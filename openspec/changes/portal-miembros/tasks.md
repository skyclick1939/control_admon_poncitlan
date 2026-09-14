# Tasks: Member Portal (`portal-miembros`)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~750–850 total across 4 phases |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Per-Phase Line Estimate

| Phase | Est. lines | Risk |
|---|---|---|
| 1 — Admin payment history (no DB) | ~190 | Low |
| 2 — Access token schema (D9, live-DB) | ~60 (DDL) | Low (additive, sign-off gated) |
| 3 — Token issuance | ~240 | Medium |
| 4 — Member portal | ~295 | Medium-High |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Part 1 — admin payment history, no DB change | PR1 | `npx vitest run src/lib/member-view.test.ts` | `npm run dev` manual click-through: history panel per member | `git revert`; nothing DB-side to undo, feature is additive query+UI only |
| 2 | Schema DDL (D9) — additive columns + partial index | PR2 | N/A — DDL has no Vitest surface | Manual SQL editor read-back (tasks 2.4–2.5) | Run `portal_miembros_token_down.sql`; drops both columns, revokes every live link (intended) |
| 3 | Token issuance — `member-token.ts` + admin UI | PR3 | `npx vitest run src/lib/member-token.test.ts` | `npm run dev` manual generate/regenerate + clipboard | `git revert`; admin can issue links but nothing consumes them yet (design's stated safe intermediate state) |
| 4 | Member portal — `api/member-view.ts` + `mi-cuenta/` entry | PR4 | `npx vitest run src/lib/member-view.test.ts` (extended) | Vercel preview: `/mi-cuenta/?token=`, `curl /api/member-view?token=` | Remove `api/member-view.ts` + `mi-cuenta/` + the Vite input; promote prior deploy |

## Phase 1: Admin Payment History (Part 1 — independent, no DB change) — PR1

- [x] 1.1 RED: `src/lib/member-view.test.ts` — `summarizeMemberHistory`: mixed paid/pending exact cents, empty input, fully-paid member, retired member — failing (module absent).
- [x] 1.2 GREEN: `src/lib/member-view.ts` — `CargoTotalsRow`, `PagoTotalsRow`, `MemberTotals`, `summarizeMemberHistory` via `src/lib/money.ts` (read-only) `toCents` (D14).
- [x] 1.3 `src/lib/types.ts` — add `CargoHistorial` (Pick<Cargo,'id'|'monto_original'|'monto_pendiente'|'estado'|'created_at'> + nullable `registro_apoyos` join) per Interfaces section.
- [x] 1.4 `src/features/miembros/repo.ts` — add `fetchCargosMiembro(miembroId)` (no `estado` filter, joins `registro_apoyos(motivo, fecha)`, `created_at` desc) and `fetchPagosMiembro(miembroId)` (`fecha_pago` desc); neither filters on `activo`.
- [x] 1.5 `src/features/miembros/index.ts` + `index.html` — "Ver historial" button per row toggles inline panel: cargos (fecha, motivo, original, pendiente, estado) + pagos (fecha, monto, observaciones) + the three `summarizeMemberHistory` totals; zero-history case loads with all totals at zero.
- [x] 1.6 Verify: `npx vitest run src/lib/member-view.test.ts` — passes spec `member-payment-history` scenarios (mixed-state, retired member, totals reflect entries, totals for empty history).

## Phase 2: Access Token Schema (D9) — live-DB, sign-off gated — PR2

- [x] 2.1 Draft `supabase/sql/portal_miembros_token.sql` — additive `token_hash text check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$')` + `token_generado_en timestamptz` on `miembros`, plus partial unique index `miembros_token_hash_key on miembros(token_hash) where token_hash is not null`. **APPLIED live 2026-09-14.**
- [x] 2.2 Draft `supabase/sql/portal_miembros_token_down.sql` — verbatim `drop column token_hash` (drops the partial index with it) + `drop column token_generado_en`. Written before live execution.
- [x] 2.3 **[LIVE-DB, SIGN-OFF GATED]** Explicit project-owner sign-off obtained in-session; `portal_miembros_token.sql` executed live via the Supabase Management API 2026-09-14.
- [x] 2.4 Read-back verification: `information_schema.columns` confirms `token_hash text` and `token_generado_en timestamptz`, both `is_nullable=YES`; all 10 existing `miembros` rows have `token_hash` NULL (`count=10, with_token=0`).
- [x] 2.5 Integration test, all confirmed live: `update miembros set token_hash = 'no-es-un-hash'` refused (`23514`, no rows modified); setting the same digest on two members refused by `miembros_token_hash_key` (`23505`, no rows modified); multiple `NULL` values accepted (all 10 rows); `anon` still has zero grants on `miembros` (`information_schema.role_table_grants` returns no rows).

## Phase 3: Token Issuance (`member-token.ts` + admin UI) — PR3

- [ ] 3.1 RED: `src/lib/member-token.test.ts` — `toBase64Url(32 bytes)` is 43 chars with no `+`/`/`/`=`; `isTokenShape` rejects `null`, `''`, 44 chars, 4 KB, non-base64url, accepts a real token — failing (module absent).
- [ ] 3.2 RED (D11-timing): same file — static import-graph assertion that `src/lib/member-token.ts` imports no Supabase/IO module, proving `isTokenShape`'s verdict cannot depend on which tokens exist.
- [ ] 3.3 GREEN: `src/lib/member-token.ts` — `TOKEN_BYTES=32`, `TOKEN_CHARS=43`, `toBase64Url`, `isTokenShape`; runtime-agnostic (no `node:crypto`, no `crypto.subtle`).
- [ ] 3.4 RED→GREEN: new `src/lib/digest-agreement.test.ts` — `crypto.subtle.digest('SHA-256', …)` and `node:crypto.createHash('sha256')` produce the same hex digest for a fixed vector (the single cross-runtime assumption D10 rests on). *Filename is inferred — design.md does not pin one.*
- [ ] 3.5 `src/features/miembros/repo.ts` — add `setMemberTokenHash(id, tokenHash)`; change `fetchMembers`'s `select('*')` to the explicit column list per D15 (drops `token_hash` from client state).
- [ ] 3.6 `src/features/miembros/token.ts` (NEW) — `getRandomValues(32)` → `toBase64Url` → clipboard; `subtle.digest` SHA-256 hex → `setMemberTokenHash`; plaintext never leaves this module (D10).
- [ ] 3.7 `src/features/miembros/index.ts` + `index.html` — "Enlace" column (`Sin enlace` / `Generado el <fecha>`), Generar/Regenerar button; `window.confirm` on regenerate only, no confirm on first generation; one-time reveal block (readonly input + Copiar + red "no se volverá a mostrar" text); clipboard-denied fallback keeps the input visible/selected; `app.refresh()` clears the reveal (D16).
- [ ] 3.8 Verify: `npx vitest run src/lib/member-token.test.ts src/lib/digest-agreement.test.ts` — entropy, shape, import-graph, and cross-runtime-digest scenarios all pass.

## Phase 4: Member Portal (`api/member-view.ts` + `mi-cuenta/` entry) — PR4

- [ ] 4.1 `src/lib/types.ts` — add `MemberViewResponse` per the finalized Interfaces section (excludes member UUID, `status`, `activo`, `created_at`, `motivo`, `observaciones`, operator identity, row ids, token/hash, other members' data).
- [ ] 4.2 RED: `src/lib/member-view.test.ts` — `toMemberCargoEntries`/`toMemberPagoEntries` emit **exactly** the allowed key set; assert absence of `motivo`, `observaciones`, ids, operator fields (D13) — failing.
- [ ] 4.3 GREEN: `src/lib/member-view.ts` — add `CargoRowForMember`, `PagoRowForMember`, `toMemberCargoEntries`, `toMemberPagoEntries` (`fecha` = `registro_apoyos.fecha` when the join resolves, else `created_at`).
- [ ] 4.4 `api/member-view.ts` — clone `api/debt-view.ts` (read-only pattern source): `service_role` client (`persistSession:false`), raw `IncomingMessage`/`ServerResponse`, token via `new URL(req.url ?? '', 'http://localhost').searchParams.get('token')`; 405 on non-GET; `isTokenShape` short-circuit → 404 with no DB hit (D12); `sha256hex` via `node:crypto`; explicit-column `miembros` lookup by digest; `crypto.timingSafeEqual` compare (defense-in-depth); explicit-column `cargos`/`registro_pagos` selects; `summarizeMemberHistory` + `toMember*Entries`; `200` + `Cache-Control: private, no-store`; top-level try/catch → `502 {"error":"unavailable"}`; `.js`-suffixed relative imports (`ERR_MODULE_NOT_FOUND` gotcha, Phase 3 precedent).
- [ ] 4.5 `mi-cuenta/index.html` — Vite entry #3: `<meta name="robots" content="noindex, nofollow">`, `<meta name="referrer" content="no-referrer">`, link out to `/vista/` (read-only reference).
- [ ] 4.6 `src/member-view.ts` — zero-session entry importing `src/lib/escape.ts` (read-only) + `src/lib/types.ts` + `src/lib/member-view.ts` ONLY (no `src/lib/supabase.ts`); fetches `/api/member-view?token=`, renders via `escapeHtml`, never writes the token into the DOM.
- [ ] 4.7 `vite.config.ts` — add `'mi-cuenta': resolve(import.meta.dirname, 'mi-cuenta/index.html')` to `rollupOptions.input`.
- [ ] 4.8 `api/member-view.ts` — set `Referrer-Policy: no-referrer` as an actual response header, not only the 4.5 meta tag. **Flag for apply-time check**: design.md's File Changes table states `vercel.json` is "Not created" (D2), but a response header on the *static* `mi-cuenta/index.html` page (the document that navigates to `/vista/`) may require a headers-only `vercel.json` entry, since a Vercel Function response header (this task) only covers the JSON API response, not the static HTML document itself. Resolve at apply time; do not add routing/rewrites either way.
- [ ] 4.9 **[MANUAL, SQL editor + build, requires 4.4 done]** `npm run build`; confirm existing `postbuild` script still reports zero `service_role` occurrences in `dist/`, now including the `mi-cuenta` chunk.
- [ ] 4.10 **[MANUAL, preview deployment, D11-timing — mirrors `evolucion-plataforma-arca` 2.6/4.5 pattern, not executable by `sdd-apply`]** 30-sample median latency: well-formed-but-unknown token vs. a revoked token — medians must sit within network noise of each other (same lookup-miss code path). Missing/malformed sampled in the same run and recorded as *intentionally faster* (accepted non-goal, cite D11). Record both medians in this task's completion note.
- [ ] 4.11 **[MANUAL, preview deployment]** E2E: valid link shows only that member's data and links to `/vista/`; a one-char tamper, a missing `?token=`, and a regenerated-away token all return byte-identical `404 {"error":"not_found"}`; response carries `Cache-Control: private, no-store`; clicking through to `/vista/` leaves no token in the Vercel request log (`Referer` absent/stripped); `select token_hash from miembros` shows only 64-hex digests, never plaintext.
- [ ] 4.12 **[MANUAL, apply-time check — design.md Migration/Rollout step 4]** Confirm `/mi-cuenta/` and `/api/member-view` both resolve on a preview deployment before issuing any real link (Vercel Vite-preset caveat, D2).

## Threat Matrix

All five threat-matrix rows are `N/A` per design.md (HTTP route, not a shell/VCS/process boundary) — no RED task required for that matrix.
