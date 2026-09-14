# Design: Member Portal (`portal-miembros`)

## Technical Approach

Two independent parts sharing one pure module.

**Part 1 (admin history)** is pure repo + UI work on the existing `authenticated` → RLS path: `is_admin()` already permits SELECT on `cargos`/`registro_pagos`/`registro_apoyos` (Phase 2, live), so no DDL, no policy, no grant.

**Part 2 (member portal)** clones the proven Phase 3 triple — pure `lib/*` aggregator + `service_role` Vercel Function + zero-session Vite entry — and adds exactly one thing the public path does not have: a per-visitor selector. That selector is a 256-bit token that exists in plaintext only in the member's URL and the admin's clipboard; the database stores its SHA-256 digest and nothing else. Every decision below follows from that: a lookup miss is the *only* failure mode, so unknown, malformed, and revoked tokens are the same code path by construction rather than by careful coding.

Decision numbering continues `evolucion-plataforma-arca`'s D1–D8.

---

## Architecture Decisions

### D9 — Token storage: a column on `miembros`, not a `miembros_tokens` table

| Option | Tradeoff | Decision |
|---|---|---|
| `token_hash` + `token_generado_en` columns on `miembros` | "One live token per member" becomes structural — the row *is* the uniqueness constraint; regeneration is one `UPDATE`; revocation is `set token_hash = null` | **Chosen** |
| Separate `miembros_tokens` table | Buys token history/audit and multi-device tokens. The proposal asks for neither and explicitly rules out link recovery; it would add a table, a policy, a grant, a join, and a "which row is live" predicate to get today's behavior | Rejected |

**Rationale**: a second table is only justified by a requirement to answer "what tokens did this member have?" — and hash-only storage cannot answer it anyway. Rotation overwriting the previous digest is not a limitation to work around here; it *is* the revocation mechanism (proposal: "revoking is deleting the hash").

### D10 — SHA-256 via WebCrypto/`node:crypto`, generated in the admin browser — not bcrypt/argon2, not server-side

**Choice**: `crypto.getRandomValues(new Uint8Array(32))` → base64url (43 chars, no padding) is the plaintext token; its lowercase SHA-256 hex digest is what the admin client writes to `miembros.token_hash`. The plaintext is never transmitted to Vercel or Supabase at generation time — it goes from `getRandomValues` to the clipboard and nowhere else.

**Alternatives considered**: bcrypt/argon2 (rejected); a server-side `POST /api/generate-token` (rejected).

**Rationale**: password hashes need a deliberately slow KDF because passwords have perhaps 30 bits of entropy and are brute-forceable *offline* from a stolen digest. This token has 256 bits from a CSPRNG. An attacker holding the entire `miembros` table cannot brute-force a preimage at any work factor, so a KDF buys nothing and costs per-request latency on every page load. A slow KDF would also break D9's single indexed lookup: bcrypt's per-row salt forces a full table scan comparing every row. SHA-256 keeps the digest deterministic, so `where token_hash = $1` is one index probe.

Generating client-side is the stronger property, not just the smaller diff: it is the entire admin write path already (every admin mutation goes through `dbClient` + RLS — a generation endpoint would be the only exception), and it means no server log, no request body, and no function memory ever contains a usable token. `crypto.subtle` requires a secure context; Vercel is HTTPS and dev is `localhost`, so both qualify.

### D11 — `api/member-view.ts`: one query param, one indistinguishable failure

```
GET /api/member-view?token=<43-char base64url>
```

| Case | Response |
|---|---|
| Valid, live token | `200` + `MemberViewResponse`, `Cache-Control: private, no-store` |
| Missing `?token=` / malformed / unknown / **revoked** | `404 {"error":"not_found"}` — identical status, body, and headers in all four |
| Non-`GET` | `405 {"error":"method_not_allowed"}` (debt-view parity) |
| Supabase or unexpected failure | `502 {"error":"unavailable"}`, detail logged server-side only (D-precedent: never echo driver errors) |

Node types, not Vercel's — `debt-view.ts` uses raw `IncomingMessage`, which has no `req.query`, so the token is read via `new URL(req.url ?? '', 'http://localhost').searchParams.get('token')`.

**Indistinguishability is structural, not defensive coding.** Revocation overwrites the digest, so a revoked token and a never-issued token produce the *same* lookup miss on the same line. The only inputs that short-circuit before the DB (absent, over-length, non-base64url) are ones the attacker can already classify themselves — the token format is not a secret — so that early return leaks nothing while removing the DB round-trip from the cheapest flood path (see D12).

**Timing across the three spec-named failure causes.** `member-private-view`'s "No timing side channel between failure causes" scenario names exactly *invalid*, *missing*, and *revoked*. The D12 short-circuit makes these **not** equal-latency. That is a decided position, not an oversight:

| Case | Path | Cost |
|---|---|---|
| Invalid (well-formed, never issued) | shape pass → digest → index probe → miss | 1 DB round-trip |
| Revoked / rotated | shape pass → digest → index probe → miss | 1 DB round-trip — *same line, same cost* |
| Missing / malformed shape | shape reject | 0 DB round-trips — **measurably faster** |

The spec's requirement is qualified: indistinguishable "in a way an external caller could exploit to infer token validity or existence." Applied to each boundary:

- **Invalid vs revoked** is the boundary that carries secret information — whether a digest is live in `miembros`. These two are body- *and* cost-identical by construction: D9's `set token_hash = null` makes revocation produce the same lookup miss, so there is no second branch to keep in sync. This is the boundary the scenario exists to protect, and it is closed.
- **Missing/malformed vs well-formed** is a boundary the caller evaluates **offline, with certainty, before sending the request**. `isTokenShape` is a pure predicate over the candidate string; it reads no member data, so its verdict cannot be a function of which tokens exist. A caller measuring this asymmetry learns only "the string I sent is not 43 base64url characters" — a fact they already hold, derivable from the shipped client bundle, and not a guess against the token space. It narrows 2²⁵⁶ by exactly zero, so it is not exploitable "to infer token validity or existence."

Chosen therefore: **accept the asymmetry; do not equalize it.** Rejected alternative — a dummy digest plus a constant-cost decoy probe on shape rejection — buys no secrecy (the discriminated attribute is already public) and forfeits D12's *only* DoS mitigation, which is the specific reason this endpoint ships without a rate limiter. Equalizing here would mean paying a Supabase query for every garbage byte in a flood to hide something the attacker typed themselves.

This is a **tested non-goal, not prose**: the Testing Strategy rows tagged *D11-timing* assert the invalid-vs-revoked equality and record the missing-token asymmetry as accepted, so a future refactor that breaks the real boundary fails a test rather than passing review on this paragraph's say-so.

**Timing of the post-lookup compare (a separate, smaller concern).** After the `.eq('token_hash', digest).maybeSingle()` match, the returned digest is re-compared with `crypto.timingSafeEqual` over both hex buffers. Stated honestly: this is defense-in-depth, not the load-bearing control. A Postgres B-tree probe is not constant-time, but the comparand is a *digest* — learning it yields no token, because the caller must present a preimage. Network jitter also dwarfs the probe. The compare costs one line and survives a future refactor that fetches by some other key, so it stays.

**`Referrer-Policy: no-referrer`** on `mi-cuenta/index.html` (meta tag) **and** as a response header on the page. This is load-bearing, not hygiene: the page links out to `/vista/`, and a same-origin navigation sends the full referrer *including the token* — which would deposit live credentials into Vercel's own request logs. `no-referrer` also covers the cross-origin Tailwind/Fonts subresources that `vista/index.html` loads. `<meta name="robots" content="noindex, nofollow">` likewise.

### D12 — Still no rate limiter — D7's "revisit if parameterized or per-visitor" trigger, answered

D7's trigger genuinely fires: this response is both parameterized and per-visitor, `no-store` removes the CDN shield, and every request reaches the origin. Decision after re-examining it: **no application-level limiter in v1.**

- **Guessing is not the threat.** 256 bits of CSPRNG entropy means enumeration is not slow, it is arithmetically impossible. A limiter would be protecting a search space of 2²⁵⁶ against an adversary who cannot exhaust 2⁸⁰. Token entropy *is* the mitigation, and it is a stronger one than any throttle.
- **Cost/DoS is the real residual.** Vercel bills per invocation, and this is the project's first uncached origin-hitting route. Mitigated by: (a) the pre-DB short-circuit in D11, so garbage floods cost one function invocation and **zero** Supabase queries; (b) a platform-level spend/usage alert, which is an ops action, not code.
- **A correct limiter cannot be cheap here.** Functions are stateless and horizontally scaled, so an in-memory counter is per-instance and silently unreliable. A real one needs a shared KV store — a new external dependency, for a ~10-member club, to protect against an attack that gains the attacker nothing.

**Revisit if**: membership grows past ~100 links, Vercel usage alerts actually fire, or the endpoint ever gains a mutating verb. At that point use Vercel's firewall/rate-limit rules if this project's plan exposes them — **confirm plan availability at apply time; do not assume it.**

### D13 — `motivo` and `observaciones` stay excluded from the member payload

The member is the data subject for the *amount*, but `registro_apoyos.motivo` describes a support event that is frequently about a **third party** and may be medical or personal — D7 named it "the sharpest leak here." A URL-borne bearer credential with an owner-accepted permanent-leak risk is a worse container for that text than the public page was. `registro_pagos.observaciones` is operator free text, written for admins, never for member eyes.

Date + amount is sufficient to reconcile a charge at this club's scale. **Revisit trigger**: if members report they cannot identify charges, adding `motivo` requires explicit owner sign-off **and** a `member-private-view` spec amendment (see the reversibility note in Open Questions) — a deliberate reversal, not a quiet patch. Keeping parity with D7's exclusion list also means no reviewer must re-litigate why the public and private surfaces disagree.

### D14 — One pure `src/lib/member-view.ts`, shared by the admin panel and the function

Exactly `debt-view.ts`'s shape: no DB access, no DOM, 100% unit-testable, imported by `features/miembros/index.ts` (client) and `api/member-view.ts` (`.js`-suffixed — the `ERR_MODULE_NOT_FOUND` gotcha). It takes **minimal structural row types** so the admin can pass a superset carrying `motivo` while the member path passes rows that never fetched it. The totals math exists once.

### D15 — `fetchMembers` drops `select('*')`

`repo.ts:7` currently does `select('*')`, which after D9 would pull `token_hash` into `app.state.members` and into every admin bundle render path. The digest is not a usable credential, but it has no business in client state. `select('id, nickname, status, created_at, activo, token_generado_en')` — the non-secret timestamp is what drives the UI's "Generado el …" label, so the hash is never needed in the browser for *reading*. (Column-level `REVOKE` was considered and rejected: the admin client must still `UPDATE token_hash` to issue a link.)

### D16 — One-time reveal; no per-row "copiar enlace" afterwards

Copy is available only in the reveal block of a token that was *just* generated. The proposal's "copiar enlace" cannot mean "copy Bob's existing link" — hash-only storage makes that impossible by design, and offering a copy button that only works for 30 seconds after generation, next to rows where it never works, would be a lie in the UI. The plaintext lives in one local variable and one DOM node, never in `app.state`, and is cleared on the next `app.refresh()`.

---

## Module Boundaries

```
mi-cuenta/index.html           Vite entry #3 — no session, no anon key, noindex, no-referrer
api/member-view.ts             Vercel Function — service_role, token-scoped, private/no-store
src/
  member-view.ts               member entry — imports lib/escape + lib/types + lib/member-view ONLY
  lib/
    member-view.ts             PURE — totals + payload mapping (D14)
    member-token.ts            PURE — base64url encoding + token shape guard (shared browser/Node)
  features/miembros/
    index.ts                   + history panel, + generate/regenerate/reveal (Modified)
    repo.ts                    + fetchCargosMiembro, fetchPagosMiembro, setMemberTokenHash (Modified)
    token.ts                   NEW — WebCrypto generation, clipboard, reveal DOM
```

`src/member-view.ts` **MUST NOT** import `lib/supabase.ts` — same tree-shaking guarantee as D1. `lib/member-token.ts` must stay free of both `node:crypto` and `crypto.subtle` (the two runtimes' digest APIs differ; only the *encoding contract* is shared).

`vite.config.ts` — one added input (the key needs quoting, it has a hyphen):

```ts
input: {
  main:        resolve(import.meta.dirname, 'index.html'),
  vista:       resolve(import.meta.dirname, 'vista/index.html'),
  'mi-cuenta': resolve(import.meta.dirname, 'mi-cuenta/index.html'),
}
```

No `vercel.json` — D2 holds unchanged: `mi-cuenta/index.html` is a real file in `dist/`, and a query string needs no routing behavior that does not already exist. This is exactly why the proposal chose `?token=` over `api/mi-cuenta/[token].ts`.

---

## Database Design

`supabase/sql/portal_miembros_token.sql`:

```sql
-- ============================================================================
-- portal-miembros — Member access token: hashed-at-rest storage on miembros
-- portal-miembros, design.md D9 + D10
--
-- STATUS: NOT APPLIED. Apply live only after explicit project-owner sign-off
-- obtained immediately beforehand (the Phase 0/2/3/4 gate), with read-back
-- verification.
--
-- Additive and app-owned (config.yaml rules.proposal). No RLS or GRANT change
-- is needed: phase2_rls.sql's admins_all_miembros policy already covers
-- SELECT/UPDATE for is_admin(), and `revoke all on public.miembros from anon`
-- (design.md D4) already denies anon. api/member-view.ts reads through
-- service_role, which bypasses RLS entirely.
--
-- Specs: member-access-token.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. token_hash — lowercase SHA-256 hex digest of the plaintext token (D10),
-- or NULL for "no live link". Nullable BY DESIGN: NULL is the revoked state,
-- and it is what makes an unknown token and a revoked token the same lookup
-- miss (D11), rather than two branches someone must keep identical.
--
-- The check mirrors phase3_bank_config.sql's `clabe ~ '^[0-9]{18}$'` style:
-- a malformed value -- or an accidentally-plaintext token -- is rejected by
-- the database, not only by the client that wrote it.
-- ----------------------------------------------------------------------------
alter table public.miembros
  add column token_hash text
    check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$');

-- ----------------------------------------------------------------------------
-- 2. One live token per member, and no two members may ever share one.
-- A partial unique INDEX (not a table constraint) keeps multiple NULLs legal
-- and documents the intent; it is also the single index probe api/member-view
-- uses on every request.
-- ----------------------------------------------------------------------------
create unique index miembros_token_hash_key
  on public.miembros (token_hash)
  where token_hash is not null;

-- ----------------------------------------------------------------------------
-- 3. token_generado_en — NON-SECRET issuance timestamp. It exists so the
-- admin table can render "Enlace generado el ..." without ever selecting
-- token_hash into the browser (D15).
-- ----------------------------------------------------------------------------
alter table public.miembros add column token_generado_en timestamptz;

-- ----------------------------------------------------------------------------
-- 4. Verify: information_schema.columns shows token_hash text is_nullable=YES
-- and token_generado_en timestamptz is_nullable=YES; all 10 existing miembros
-- rows have both NULL; `update miembros set token_hash = 'no-es-un-hash'`
-- is refused by the check constraint (23514).
-- ----------------------------------------------------------------------------
```

`supabase/sql/portal_miembros_token_down.sql` — `drop column` removes the partial index with it, so the index is not dropped separately:

```sql
-- ============================================================================
-- portal-miembros DOWN script — member access token columns
-- Reverses portal_miembros_token.sql. Additive-safe to reverse: nothing
-- references these columns, and the only data lost is token digests, which
-- were already unrecoverable by design (D9/D10). Rolling this back revokes
-- every live member link — that is the intended effect, not a side effect.
-- ============================================================================
alter table public.miembros drop column token_hash;        -- drops miembros_token_hash_key
alter table public.miembros drop column token_generado_en;
```

---

## Interfaces

### `src/lib/types.ts` (additions)

```ts
/**
 * Response contract of the token-scoped `api/member-view` function
 * (design.md D11; specs member-private-view). Mirrors DebtViewResponse's
 * shape discipline. Deliberately excludes: the member UUID, `status`
 * (fullparch/prospecto), `activo`, `created_at`, `registro_apoyos.motivo`
 * and `registro_pagos.observaciones` (D13), operator identity
 * (`capturado_por` / `registrado_por`), row ids, the token or its hash,
 * and every other member's data. The function never uses select('*') — the
 * explicit column list is the guard.
 */
export interface MemberViewResponse {
  generatedAt: string;                 // ISO-8601
  nickname: string;
  totalPendienteCents: number;
  totalPagadoCents: number;
  cargos: { fecha: string; estado: 'pendiente' | 'pagado';
            originalCents: number; pendienteCents: number }[];   // fecha desc
  pagos:  { fecha: string; montoCents: number }[];               // fecha desc
}

/** `cargos` + its apoyo, for the ADMIN per-member history panel (Part 1). Unlike
 *  MemberViewResponse this keeps `motivo` — the admin is authorized for it. */
export interface CargoHistorial
  extends Pick<Cargo, 'id' | 'monto_original' | 'monto_pendiente' | 'estado' | 'created_at'> {
  registro_apoyos: Pick<RegistroApoyo, 'motivo' | 'fecha'> | null;
}
```

`cargos[].fecha` is `registro_apoyos.fecha` when the join resolves, else the cargo's `created_at` — the support event's date is the one the member recognizes.

### `src/lib/member-view.ts` (pure, D14)

```ts
export interface CargoTotalsRow { monto_original: number; monto_pendiente: number;
                                  estado: 'pendiente' | 'pagado' }
export interface PagoTotalsRow  { monto_pagado: number }

/** A cargo as the MEMBER path fetches it. `registro_apoyos` is nullable because
 *  the join may not resolve; `fecha` falls back to `created_at` then. */
export interface CargoRowForMember extends CargoTotalsRow {
  created_at: string;
  registro_apoyos: { fecha: string } | null;
}

export interface PagoRowForMember extends PagoTotalsRow { fecha_pago: string }

export interface MemberTotals { readonly totalOriginalCents: number;
                                readonly totalPendienteCents: number;
                                readonly totalPagadoCents: number }

/** Exact integer-cent totals via money.ts's toCents. Shared by the admin panel
 *  and api/member-view — the arithmetic exists once. */
export function summarizeMemberHistory(cargos: readonly CargoTotalsRow[],
                                       pagos: readonly PagoTotalsRow[]): MemberTotals;

/** Maps DB rows to MemberViewResponse['cargos'] — the field-exclusion boundary
 *  (D13). Its unit test asserts the emitted key set exactly. */
export function toMemberCargoEntries(rows: readonly CargoRowForMember[]): MemberViewResponse['cargos'];
export function toMemberPagoEntries(rows: readonly PagoRowForMember[]):  MemberViewResponse['pagos'];
```

**Why these four row types are declared here and not reused from `types.ts`.** They are *minimal structural* inputs (D14), which is the property that lets one implementation serve both callers: `CargoHistorial` and `RegistroPago` are structurally assignable to `CargoRowForMember` / `PagoRowForMember`, so the admin panel passes its richer rows unchanged while `api/member-view.ts` passes rows that never fetched the extra columns. No existing type fits without modification — `Cargo` carries `id`/`apoyo_id`/`miembro_id`, and `CargoConApoyo` both requires a non-null join and carries `motivo`, the exact field D13 excludes. Reusing either would make the excluded fields *present in the type* on the member path, turning D13's boundary into a convention instead of a signature.

### `src/lib/member-token.ts` (pure, runtime-agnostic)

```ts
export const TOKEN_BYTES = 32;
export const TOKEN_CHARS = 43;                        // base64url of 32 bytes, unpadded

export function toBase64Url(bytes: Uint8Array): string;   // no '+', '/', '='
export function isTokenShape(value: string | null): boolean;  // D11's pre-DB short-circuit
```

### `src/features/miembros/repo.ts` (Part 1 + token write)

```ts
export async function fetchCargosMiembro(miembroId: string): Promise<CargoHistorial[]>;
//   .select('id, monto_original, monto_pendiente, estado, created_at, registro_apoyos(motivo, fecha)')
//   .eq('miembro_id', id).order('created_at', { ascending: false })
//   NO estado filter — that omission is the whole point of Part 1.

export async function fetchPagosMiembro(miembroId: string): Promise<RegistroPago[]>;
//   .eq('miembro_id', id).order('fecha_pago', { ascending: false })

/** Issues or rotates a member's link. Writing a new digest silently kills the
 *  previous one — that IS revocation (D9). Never receives plaintext (D10). */
export async function setMemberTokenHash(id: string, tokenHash: string): Promise<void>;
```

Retired (`activo = false`) members are included in both — Phase 4's "history stays intact and queryable" precedent. Nothing here filters on `activo`.

---

## Data Flow

```
ADMIN (authenticated, RLS)                     MEMBER (no session)
  features/miembros/token.ts                     mi-cuenta/?token=<43 chars>
    getRandomValues(32) ─┐                              │
    toBase64Url ─────────┼─► clipboard (once)           ▼
    subtle.digest SHA256 │                       src/member-view.ts
            │            └─► NEVER leaves browser       │ fetch
            ▼                                           ▼
   dbClient.update(token_hash) ──► miembros ◄── api/member-view.ts (service_role)
                                    token_hash          │
                                                        ▼
                                               src/lib/member-view.ts (pure)
```

## Sequence: token lookup

```mermaid
sequenceDiagram
  actor M as Miembro (no session)
  participant PG as mi-cuenta/index.html + src/member-view.ts
  participant FN as api/member-view.ts
  participant SB as Supabase (service_role)
  M->>PG: GET /mi-cuenta/?token=xxx   (no-referrer, noindex)
  PG->>FN: GET /api/member-view?token=xxx
  FN->>FN: method guard -> else 405
  FN->>FN: isTokenShape(token)? no -> 404 not_found (no DB hit, D12)
  FN->>FN: sha256hex(token)  [node:crypto]
  FN->>SB: select nickname, token_hash from miembros where token_hash = $1
  alt no row  (unknown OR revoked OR tampered — one code path, D11)
    SB-->>FN: null
    FN-->>PG: 404 {"error":"not_found"}
  else row
    SB-->>FN: { id, nickname, token_hash }
    FN->>FN: timingSafeEqual(stored, computed)  [defense in depth]
    FN->>SB: select monto_original, monto_pendiente, estado, created_at,<br/>registro_apoyos(fecha) from cargos where miembro_id = id
    FN->>SB: select monto_pagado, fecha_pago from registro_pagos where miembro_id = id
    Note over FN,SB: explicit column lists — motivo and observaciones<br/>are never fetched, not merely never rendered (D13)
    FN->>FN: summarizeMemberHistory + toMember*Entries (pure)
    FN-->>PG: 200 MemberViewResponse + Cache-Control: private, no-store
  end
  Note over PG: escapeHtml on every field; links to /vista/ for the club view;<br/>the token is never written into the DOM
```

## Admin UI flow (D16)

1. Members table gains an **Enlace** column: `Sin enlace` or `Generado el <fecha>` (from `token_generado_en`), plus one button — `Generar enlace` / `Regenerar enlace`.
2. Regenerating goes through `window.confirm('Se generará un enlace nuevo y el anterior dejará de funcionar. ¿Continuar?')` — matching the existing `deleteMember` confirm pattern; first-time generation does not.
3. On success an inline reveal block appears above the table (not a modal — the project has no modal primitive): the full URL in a readonly `<input>`, a **Copiar** button, and `Cópialo ahora: no se volverá a mostrar.` in red.
4. `navigator.clipboard.writeText` can be denied or unavailable outside a secure context; on failure the input stays selected and the message becomes `No se pudo copiar automáticamente; selecciónalo y cópialo manualmente.` The URL must remain visible either way.
5. `app.refresh()` runs after the write and clears the reveal on the next render.

**Part 1 UI**: a `Ver historial` button per row toggles an inline panel below the table showing cargos (fecha, motivo, original, pendiente, estado) and pagos (fecha, monto, observaciones) with the three `summarizeMemberHistory` totals. `index.html` gains the two containers and the new column header.

---

## File Changes

| File | Action | Description |
|---|---|---|
| `supabase/sql/portal_miembros_token{,_down}.sql` | Create | D9 DDL + verbatim rollback |
| `src/lib/member-view.ts` + `.test.ts` | Create | Pure totals + exclusion mapping (D14) |
| `src/lib/member-token.ts` + `.test.ts` | Create | base64url + shape guard, shared by both runtimes |
| `api/member-view.ts` | Create | Token-scoped read surface (D11) |
| `mi-cuenta/index.html` | Create | Entry #3; `noindex`, `no-referrer` |
| `src/member-view.ts` | Create | Zero-session entry; no `lib/supabase.ts` |
| `src/features/miembros/token.ts` | Create | WebCrypto generation, reveal, clipboard (D16) |
| `src/features/miembros/repo.ts` | Modify | 3 new functions; `fetchMembers` off `select('*')` (D15) |
| `src/features/miembros/index.ts` | Modify | History panel + token column/actions |
| `index.html` | Modify | Enlace column header, history + reveal containers |
| `src/lib/types.ts` | Modify | `MemberViewResponse`, `CargoHistorial` |
| `vite.config.ts` | Modify | Third `rollupOptions.input` |
| `vercel.json` | **Not created** | D2 unchanged |
| `api/debt-view.ts`, `vista/`, RLS, grants | **Untouched** | Proposal Out of Scope |

## Testing Strategy

`strict_tdd: true` — every row below is written RED first (`vitest run`).

| Layer | What | How |
|---|---|---|
| Unit | `summarizeMemberHistory`: exact cents over mixed paid/pending, empty input, a fully-paid member, a retired member | Vitest, pure, no mocks |
| Unit | `toMemberCargoEntries` / `toMemberPagoEntries` emit **exactly** the allowed key set — asserting the absence of `motivo`, `observaciones`, ids, and operator fields (D13) | Vitest key-set assertion |
| Unit | `toBase64Url(32 bytes)` is 43 chars with no `+`, `/`, `=`; `isTokenShape` rejects `null`, `''`, 44 chars, 4 KB, and non-base64url chars, accepts a real token | Vitest |
| Unit | ***D11-timing*** — `isTokenShape` returns the same verdict for a given string under any DB state, and `lib/member-token.ts`'s import graph contains no Supabase/IO module: the short-circuit provably cannot be a function of *which tokens exist*, which is what makes its latency asymmetry non-exploitable | Vitest + static import-graph assertion |
| Unit | **Cross-runtime digest agreement**: `crypto.subtle.digest('SHA-256', …)` and `node:crypto.createHash('sha256')` produce the same hex for a fixed vector — the single assumption D10 rests on | Vitest (Node exposes both) |
| Integration (manual SQL) | Check constraint refuses a non-hex `token_hash` (23514); the partial unique index refuses two members sharing a digest (23505); multiple NULLs are accepted; `anon` still denied on `miembros` | SQL editor |
| Build guard | `dist/` contains no `service_role` | existing `postbuild` |
| E2E (manual, preview) | ***D11-timing*** — 30 sampled requests each for a well-formed-but-unknown token and a revoked token: medians MUST sit within network noise of each other (same code path). A divergence between those two is a **failure**. The missing/malformed case is sampled in the same run and **recorded as intentionally faster** — an accepted non-goal, with D11's argument cited in the recorded note so the number is never mistaken for a regression | Preview smoke; medians recorded in the task's verification note |
| E2E (manual, preview) | Valid link shows only that member; one-char tamper, a missing `?token=`, and a regenerated-away token return byte-identical `404 {"error":"not_found"}`; response carries `private, no-store`; clicking through to `/vista/` leaves **no token in the Vercel request log** (D11 referrer); `select token_hash from miembros` shows only 64-hex digests | Preview deployment smoke |

## Threat Matrix

The new boundary is an HTTP route, not a shell/VCS/process boundary — all five rows are `N/A`, on the same reading as `evolucion-plataforma-arca`'s matrix.

| Boundary | Applicability |
|---|---|
| Documentation-like paths | N/A — no file-classification or execution-by-extension logic |
| Git repository selection | N/A — no `git` invocation; deploy is Vercel git-push |
| Commit state | N/A — no index/worktree manipulation |
| Push state | N/A — no programmatic push |
| PR commands | N/A — no PR automation |

The genuine adversarial surface (a bearer credential in a URL, `service_role` custody on a parameterized route, field over-exposure, referrer leakage) is covered by the Testing Strategy above and by the proposal's Success Criteria — not by manufactured matrix rows.

## Migration / Rollout

Four slices, `delivery_strategy: auto-chain`. Part 1 ships and reverts independently of Part 2.

1. **Part 1 — admin history.** `member-view.ts` totals + tests, the two repo queries, the panel. No DB change, no new surface.
2. **DDL.** Owner sign-off immediately before execution, then `portal_miembros_token.sql`, then read-back verification (the Phase 0/2/3/4 gate). `_down.sql` written *before* applying.
3. **Token issuance.** `member-token.ts` + tests, `features/miembros/token.ts`, `setMemberTokenHash`, D15's `fetchMembers` change, the reveal UI. Admin can issue links that nothing consumes yet — safe intermediate state.
4. **Member portal.** `api/member-view.ts`, `mi-cuenta/index.html`, `src/member-view.ts`, the Vite input. Apply-time check: confirm `/mi-cuenta/` and `/api/member-view` both resolve on a preview deployment before issuing any real link (D2's standing caveat about Vercel's Vite preset).

**Rollback**: promote the previous deployment (code); `_down.sql` (schema — note this revokes every live link, intentionally); `update miembros set token_hash = null` revokes one link or all of them without touching code.

## Open Questions

- [ ] **D13 decided, flagged for the owner**: `motivo` is excluded from the member's own charge list. If members cannot identify what they were charged for, this is a product call, not a technical one — but it is **not reversible by sign-off alone**. Intended reading of `member-private-view`'s "any field that `api/debt-view.ts` already deliberately excludes": the inheritance is **transitive over debt-view's confidentiality-motivated exclusions** — `evolucion-plataforma-arca/design.md` names `motivo` in that list explicitly — so the parenthetical "(email, internal `observaciones`, capturador identity)" is illustrative, not exhaustive, and excluding `motivo` is spec-mandated rather than discretionary; reversing it needs a spec amendment alongside owner sign-off. The inheritance deliberately does **not** extend to fields debt-view omitted merely because a club-wide aggregate had no use for them (payment history, `created_at`), which the member's own view legitimately includes — otherwise the clause would forbid the very payment list this capability exists to serve.
- [ ] Vercel firewall / rate-limit rule availability on this project's plan is **unverified** (D12). Confirm before relying on it; the v1 design does not.
- [ ] Should `mi-cuenta` show the CLABE inline rather than linking to `/vista/`? Out of scope per the proposal; it would be one more `configuracion_bancaria` read on an already-`no-store` response.
- [ ] Link distribution remains manual and out-of-band — `miembros` has no contact field. A QR rendering of the reveal URL would make hand-off practical, and is deliberately not designed here.
