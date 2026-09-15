```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a789e249fa1ae05322bb71d45b95409ac5386135fd977c14ed243b0d763d5b8d
verdict: fail
blockers: 0
critical_findings: 0
requirements: 9/12
scenarios: 10/14
test_command: npx vitest run
test_exit_code: 0
test_output_hash: sha256:C7A2F50ECB1B2B0893416860613A669266B35A6D60DE2DF80187B5A8CE471112
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:E0B82ADB65BBD4EB2DA9F7BE4EEE1203FDCC2FD6F28D8062B33D4B757A62B27B
```

## Verification Report

**Change**: caja-y-transferencia
**Mode**: Strict TDD (`vitest run`)
**Revision**: RE-VERIFICATION — this report supersedes the prior one (which had `evidence_revision: sha256:d96c92…`, `verdict: fail`, `requirements: 9/12`, `scenarios: 7/14`). The migration has since been **applied to the production Supabase project** and read-only live evidence gathered. The prior report's framing is NOT discarded; the change in verdicts below is the direct consequence of that new evidence, and the two major re-classifications (Req 9 and Req 10) are called out explicitly.

## Summary

- **VERIFIED: 9** · **PARTIAL: 3** · **NOT VERIFIABLE (whole): 0**
- The 12 requirements are accounted for. The composition changed versus the prior report: **Req 9 (Migration Safety) and Req 10 (Row-Level Security) both upgraded PARTIAL → VERIFIED** on live production evidence, while Req 7 (negative-caja rendering) and Req 11 (CLABE copy runtime) are now explicitly PARTIAL because their runtime halves remain browser-only.
- **0 CRITICAL** code findings, **0 blockers**. All three automated commands green (`vitest run` 185/185, `tsc --noEmit` exit 0, `npm run build` exit 0 + postbuild guard clean).
- **Not archive-ready.** The DB-level concerns (migration applied, RLS enforced, column types mirror) are now fully closed with live evidence. What remains is browser-only runtime (negative rendering, CLABE copy) plus the absence of any real egreso disbursement (Req 3 end-to-end) and the untested V.1 invariant.

## Requirement Verification

### 1. Derived Balance — VERIFIED
`src/lib/caja.ts:25-31` — `computeCaja` is a pure function: `cajaCents = openingCents + ΣpagosCents − ΣegresosCents`, no DB access, no `toCents` call. Covered by `src/lib/caja.test.ts` (4 passing tests). **New**: the formula is now exercised over REAL production data (evidence E): apertura `0` + `sum(registro_pagos.monto_pagado)` over 106 rows = `58983.52` − `sum(registro_egresos.monto)` = `0` → derived caja `58983.52`.

### 2. Opening Amount Singleton — VERIFIED
`phase5_egresos.sql:64-69` — `configuracion_caja` `id smallint primary key default 1 check (id = 1)` (singleton). `src/features/caja/repo.ts:42-50` — `saveApertura` UPSERTs `id: 1` (update-not-insert guaranteed by the PK). **New**: live production evidence (C) proves the singleton exists — exactly **1 row, `id = 1`, `monto_apertura = 0`** (the seed). Admin-writability is live-proven by the `admins_all_configuracion_caja` policy using `is_admin()` (D: `authenticated` select = true, `anon` = false). The admin write itself (saveApertura UPSERT) remains code-verified, not yet live-exercised.

### 3. Egreso Recording Decreases Caja — PARTIAL
Code-level VERIFIED: DDL `registro_egresos` (`phase5_egresos.sql:52-60`, live-confirmed by evidence C); `saveEgreso` inserts one row (`src/features/caja/repo.ts:23-32`); `fetchCaja` maps `registro_egresos.monto` → `egresosCents` → `computeCaja` subtracts. **Remaining gap**: **no egreso row has ever been inserted** (evidence E: `sum(registro_egresos.monto)` = `0`). The end-to-end "record an egreso → caja decreases" path is verified at schema + formula level only, not by an actual disbursement.

### 4. Abono Increases Caja — VERIFIED (code-level; V.1 untested)
`src/features/pagos/repo.ts:59-65` — `aplicarPago` inserts exactly ONE `registro_pagos` row with `monto_pagado: input.montoPagadoPesos` (the FULL input amount, line 61), never the FIFO-decremented remainder; `unappliedCents` is returned separately at `:68` and does not overwrite the insert. **New**: the 106 real pago rows and the derived sum `58983.52` are consistent with the full-monto invariant (corroboration, evidence E). **Still no unit test** (no DI seam) — see V.1.

### 5. Support Records Do Not Move Caja — VERIFIED
`src/features/apoyos/repo.ts:22-51` — `saveApoyo` writes only `registro_apoyos` + `cargos`; no caja term. `computeCaja` takes no apoyo input (`src/lib/caja.ts:21-23`). Covered by `src/lib/caja.test.ts:18-32` ("has no apoyos term").

### 6. No Double-Counting — VERIFIED
`src/lib/caja.ts:26-27` — each input array reduced once, no dedup. Covered by `src/lib/caja.test.ts:46-60` (two identical rows each counted once).

### 7. Negative Caja Is Allowed — PARTIAL
Unclamped compute VERIFIED: `computeCaja` (`src/lib/caja.ts:28`) returns `-15000` unclamped (`src/lib/caja.test.ts:34-44`); no clamp and no "insufficient balance" guard anywhere (grep confirmed). Rendering code is present and correct — admin `src/features/caja/index.ts:71-72`, dashboard `src/features/dashboard/index.ts:70-72`, public `src/public-view.ts:98-99` all apply `text-red-600` when `cajaCents < 0`, never hidden/clamped. **Browser rendering is browser-unverified** (V.3) — the requirement's "displayed clearly and unblocked" half has not been exercised in a real browser.

### 8. Public Surface Exposes Only Aggregate Caja — VERIFIED
`api/debt-view.ts:62-64` and `:87-90` use explicit column lists; no `select('*')`. Response body `:106-112` exposes `cajaCents` aggregate only. `DebtViewResponse` (`src/lib/types.ts:133-140`) has no egreso rows, no operator identity, no member UUIDs. Public bundle `vista-JGgdU31_.js` is supabase-free (build proof).

### 9. Migration Safety and Reversibility — VERIFIED (was PARTIAL — upgraded)
Re-classified on live evidence. **(A)** The live `information_schema` read has NOW been performed: `registro_pagos` (`id uuid`, `monto_pagado numeric` **unconstrained**, `fecha_pago date`) and `registro_apoyos` (`id uuid`, `monto_total numeric`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`). The migration's columns mirror EXACTLY: `id uuid`, `monto numeric`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`. **(C)** The migration WAS applied to production cleanly. **(F)** The migration drill (disposable `postgres:15`): POSITIVE (sibling `numeric(10,2)`) applied cleanly with RLS/policies/zero-anon-grants/seed; NEGATIVE (sibling `text`) aborted via the guard with exit 3 and **0 tables created**; DOWN dropped exactly the two new tables while preserving both pre-existing ones. **Correction of prior framing (evidence B):** the sibling is unconstrained `numeric`, so the ORIGINAL precision/scale equality assertion would have PASSED on this database (`NULL IS NOT DISTINCT FROM NULL`). The defect that was fixed was **latent, not active** — it would have fired only against a `numeric(p,s)` sibling, and critically it fired AFTER the DDL (misleading error on a successful apply). Do not overstate what the fix prevented here: on this specific database the original assertion would not have tripped.

### 10. Row-Level Security — VERIFIED (was PARTIAL — upgraded)
Live production proof (D): `has_table_privilege('anon','public.registro_egresos','select')` = **false**; `has_table_privilege('anon','public.configuracion_caja','select')` = **false**; `has_table_privilege('authenticated','public.registro_egresos','select')` = **true**. **(C)** `rowsecurity = true` on both tables; policies `admins_all_registro_egresos` and `admins_all_configuracion_caja` present; anon grants on both tables = **0**. This matches the DDL (`phase5_egresos.sql:74-86`).

### 11. CLABE Copy Affordance — PARTIAL
Code-level VERIFIED: `src/lib/clipboard.ts:15-31` — `copyToClipboard` with Clipboard API → `execCommand` fallback, never throws; button + feedback in `src/public-view.ts:39-56` (`renderBanco`) and `:58-80` (`handleClabeCopy`, success/failure toggles). Slot `vista/index.html:44`. **Browser-only behaviour (real copy success / fallback) is browser-unverified** — never exercised in a real browser.

### 12. Dependency-Free Copy Helper — VERIFIED (build proof)
`src/lib/clipboard.ts` has **zero imports** (browser globals only). `src/public-view.ts:17-19` imports only `./lib/clipboard`, `./lib/escape`, `./lib/types`. Build output: `dist/assets/vista-JGgdU31_.js` = 2.49 kB; grep for `supabase|anon|service_role` = clean. `clipboard-C4m4V8Ek.js` also clean.

## Cross-Slice Invariants

### V.1 — Full `monto_pagado` invariant (confirmed, read-only; NO unit test)
`src/features/pagos/repo.ts:59-65` verbatim insert carries `monto_pagado: input.montoPagadoPesos` regardless of `unappliedCents` (computed at `:46`, returned at `:68`, never used to overwrite the insert). **CONFIRMED by inspection.** No unit test exists (no DI seam) — the 106 real pago rows + derived sum (evidence E) are consistent with the invariant, but that is **corroboration, not a test**. A silent regression here would not be caught by the suite.

### V.2 — `saveApoyo` neutrality (confirmed, read-only)
`src/features/apoyos/repo.ts:22-51` inserts into `registro_apoyos` (`.insert({...})` at `:22-33`) and `cargos` (`:50`). No `configuracion_caja`, no `registro_egresos`, no `registro_pagos`, no caja term. `computeCaja` has no apoyo input. **CONFIRMED.**

### V.3 — Negative `cajaCents` rendering (code-verified, browser-unverified)
- Admin `src/features/caja/index.ts:71-72`: `cajaTotal.className = breakdown.cajaCents < 0 ? 'text-red-600' : 'text-gray-900'` — red, never hidden/clamped.
- Admin dashboard `src/features/dashboard/index.ts:70-72`: `text-red-600` when `< 0`, `text-green-600` otherwise; error → `'—'`.
- Public `src/public-view.ts:98-99`: `text-red-600` when `< 0`, `text-green-600` otherwise.
- No clamp and no "insufficient balance" guard exists in any path. **Code-verified.** Actual pixel rendering requires a live browser — **browser-unverified**.

## Test Evidence

**`npx vitest run`** (exit 0):
```text
 RUN  v5.0.0 C:/Users/LABORATORIO/Downloads/desarrollos/MC/control_admon_ponci

 Test Files  12 passed (12)
      Tests  185 passed (185)
   Start at  20:23:54
   Duration  245ms (transform 59%, import 25%, tests 9%, worker 7%)
```

**`npx tsc --noEmit`** (exit 0): no output (clean).

**`npm run build`** (exit 0):
```text
> control-admon-poncitlan@0.1.0 build
> vite build

vite v8.3.0 building client environment for production...
✓ 88 modules transformed.
dist/vista/index.html               3.06 kB │ gzip: 1.16 kB
dist/mi-cuenta/index.html           4.38 kB │ gzip: 1.20 kB
dist/index.html                    42.13 kB │ gzip: 5.53 kB
dist/assets/clipboard-C4m4V8Ek.js   0.58 kB │ gzip: 0.35 kB
dist/assets/escape-DYbPpw36.js      0.83 kB │ gzip: 0.48 kB
dist/assets/mi-cuenta-LpCGKOLL.js   1.71 kB │ gzip: 0.71 kB
dist/assets/vista-JGgdU31_.js       2.49 kB │ gzip: 1.16 kB
dist/assets/main-Dn8T3jO7.js        8.78 kB │ gzip: 3.58 kB

✓ built in 162ms

> control-admon-poncitlan@0.1.0 postbuild
> node scripts/check-no-service-role.mjs

postbuild: no "service_role" leakage found in dist/ (8 files checked).
```

**Commit hygiene** (`git diff --stat dab7a62..HEAD` → 15 files, +683/−23): source/SQL only. `.codegraph/` and `openspec/` are **NOT tracked** (confirmed via `git ls-files`; they appear as untracked `??` in `git status`). **No secret** appears in the diff — the only "anon key" matches are code comments explaining that the key is kept OUT of the public bundle (no `service_role`, no URL/key literal, no private key, no password).

**Wiring** (re-checked): `initCaja` imported at `src/main.ts:9` and called at `:48`; nav refresh `:59` (`if (viewId === 'caja-content') void cajaApi.refresh()`). All 14 `#caja-content` element IDs queried by `src/features/caja/index.ts` (`egreso-form`, `egreso-monto`, `egreso-fecha`, `egreso-motivo`, `egreso-feedback`, `save-egreso-button`, `apertura-form`, `apertura-monto`, `apertura-feedback`, `save-apertura-button`, `caja-opening`, `caja-pagos-total`, `caja-egresos-total`, `caja-total`) exist in `index.html:341-395`; `data-view="caja-content"` at `index.html:92` matches.

## Production Verification (evidence A–E)

- **A. Live column types (satisfies task 3.1).** `registro_pagos`: `id uuid`, `monto_pagado numeric` (precision NULL, scale NULL — UNCONSTRAINED), `fecha_pago date`. `registro_apoyos`: `id uuid`, `monto_total numeric`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`. Migration columns mirror EXACTLY: `id uuid`, `monto numeric`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`.
- **B. Defect was latent, not active.** Sibling is unconstrained `numeric`, so the original precision/scale equality assertion would have PASSED (`NULL IS NOT DISTINCT FROM NULL`); it would only have fired against a `numeric(p,s)` sibling, and it fired AFTER the DDL (misleading error on a successful apply). The fix moved the guard before DDL and to a `data_type`-only superset check.
- **C. Migration applied to production.** `registro_egresos` and `configuracion_caja` both exist with `rowsecurity = true`; policies `admins_all_registro_egresos` / `admins_all_configuracion_caja`; anon grants = 0; seed exactly 1 row in `configuracion_caja` (`id = 1`, `monto_apertura = 0`); mirrored types `registro_egresos.monto = numeric` and `registro_pagos.monto_pagado = numeric`.
- **D. RLS privilege proof.** `anon` select on both tables = **false**; `authenticated` select on `registro_egresos` = **true**.
- **E. Derived caja over real data.** apertura `0`; `sum(registro_pagos.monto_pagado)` over 106 rows = `58983.52`; `sum(registro_egresos.monto)` = `0`; derived caja = **`58983.52`**.
- **F. Migration drill (previously performed, still valid).** POSITIVE sibling `numeric(10,2)` clean with RLS/policies/zero-anon-grants/seed; NEGATIVE sibling `text` aborted via guard exit 3, 0 tables created; DOWN dropped exactly the two new tables, preserving pre-existing ones.

## Findings

**CRITICAL**: None. No secret in the diff; no failing check.

**WARNING**:
1. **V.1 untested** — `src/features/pagos/repo.ts:59-65`: the full-`monto_pagado` invariant has no unit test (no DI seam). The 106 real pago rows + derived sum corroborate it, but a silent regression in `aplicarPago` would not be caught by the suite.
2. **Req 3 end-to-end unexercised** — no egreso row has ever been inserted (evidence E: `sum(registro_egresos.monto)` = 0). The "record egreso → caja decreases" path is schema + formula verified only.
3. **Browser-only behaviours unexercised** — negative-`cajaCents` red rendering on both surfaces (Req 7 / V.3) and CLABE copy success + fallback (Req 11) are code-inspected only; never run in a real browser.

**SUGGESTION**:
1. `src/lib/types.ts:54` — `RegistroEgreso` type is declared but referenced nowhere in the runtime path (grep finds only the declaration). Either wire it (e.g. a future egreso history listing) or annotate it as schema-contract-only.
2. `api/debt-view.ts:114` — public `cajaCents` inherits `Cache-Control: max-age=60, stale-while-revalidate=300`; a freshly captured egreso/pago lags up to 60s (edge) / 300s (stale) in the public figure. Documented in design, not tightened (accepted).

## Verification Gaps

- **No real egreso disbursement**: Req 3's runtime decrease is unproven by an actual insert (schema + formula + derived-data only).
- **No browser**: V.3 negative-caja rendering and Req 11 CLABE copy (success + fallback) are code-verified only.
- **No DI seam for `aplicarPago`**: V.1 full-`monto_pagado` invariant is inspection-verified + real-data-corroborated, not test-covered.
- **Public cache staleness** (accepted, documented): up to 300s stale revalidation on `cajaCents`.

## Conclusion

With the migration applied to production and live evidence in hand, the DB-level verification is now **complete and green**: column types mirror the siblings exactly (Req 9), RLS denies `anon` and grants `authenticated` (Req 10), the singleton seed exists (Req 2), and the derived formula is exercised over 106 real pago rows (Req 1, `58983.52`). The prior report's two DB-bound PARTIAL requirements are now VERIFIED.

**This is still not archive-ready.** Three browser/manual items remain: (1) negative-`cajaCents` red rendering on both surfaces (V.3/Req 7), (2) CLABE copy success + fallback in a real browser (Req 11), and (3) at least one real egreso disbursement so the derived caja visibly decreases (Req 3). V.1 also remains untested (no DI seam), though real data corroborates it. Verdict: **PASS WITH WARNINGS** on the code and schema, **NOT archive-ready** until the browser checks and a real egreso are exercised. Envelope `verdict: fail` reflects the remaining runtime gaps, not a code defect — there are 0 CRITICAL findings and 0 blockers.
