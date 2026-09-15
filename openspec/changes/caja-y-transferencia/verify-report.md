```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:b1f158ffa16425f162894a909d7e075a5a70ebc58d083410d88cd6d90955bf88
verdict: fail
blockers: 0
critical_findings: 0
requirements: 11/15
scenarios: 10/20
test_command: npx vitest run
test_exit_code: 0
test_output_hash: sha256:f46d44f17f3ea8a0e4bd2b0cd5badb1551e1ad9b9eed623c76b067d8e062ed41
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:f66d1c45bbd620f0f54444601267a9a34b57f51125f3a37c50ae4523bd766434
```

## Verification Report

> **Redaction note.** This repository is public. Real financial figures from the production database are shown as `[redacted]`; row counts are retained for evidentiary weight. No database was contacted during this re-verification — every production fact used below was supplied in the amendment brief.

**Change**: caja-y-transferencia
**Mode**: Strict TDD (`vitest run`)
**Revision**: RE-VERIFICATION #2 (MATERIAL AMENDMENT). This report **supersedes** the prior one (`evidence_revision: sha256:a789e249fa1ae05322bb71d45b95409ac5386135fd977c14ed243b0d763d5b8d`, `verdict: fail`, `requirements: 9/12`, `scenarios: 10/14`). The amendment changed the derived-balance contract: `registro_apoyos.monto_total` now **SUBTRACTS** (handing out an apoyo is cash leaving the club), the "Por cobrar" figure is displayed as context, and user-facing labels were renamed to "Arca" while identifiers were left untouched. The prior report's **Req 5 ("Support Records Do Not Move Caja") and invariant V.2 are SUPERSEDED** — that was exactly the modelling defect this amendment corrects. Requirement and scenario totals change because the amended specs restructured the support/por-cobrar/breakdown/pago-sin-cargo requirements.

## Summary

- **VERIFIED: 11 · PARTIAL: 4 · NOT VERIFIABLE (whole): 0** (15 requirements).
- **Scenarios: 10/20 COMPLIANT · 6 PARTIAL · 4 UNTESTED.**
- **0 CRITICAL** code findings, **0 blockers**. All three automated commands are green (`vitest run` 185/185, `tsc --noEmit` exit 0, `npm run build` exit 0 + postbuild guard clean).
- The **core amendment is verified**: `computeCaja` now subtracts `apoyosCents` (`src/lib/caja.ts:34`), the test suite asserts the subtraction, `fetchCaja` maps `registro_apoyos.monto_total` into that term, "Por cobrar" is genuinely excluded from the balance, and the "Arca" rename is presentational-only (no identifier leak).
- **Not archive-ready.** Remaining gaps: two amendment-specific unit-test scenarios are missing (fully-repaid-net-zero, unrepaid-negative), the `tasks.md` ledger is out of sync with the amendment (V.2 carries superseded text; PR 5 tasks unchecked), no real egreso exists, and the two browser-only behaviours remain unexercised.

## Requirement Verification

### 1. Derived Arca Balance — PARTIAL (formula correct; 2 of 3 scenarios untested)
`src/lib/caja.ts:30-43` — `computeCaja` is pure and computes `cajaCents = openingCents + pagosTotalCents − apoyosTotalCents − egresosTotalCents` (`:34`), no DB access, no `toCents`. Correct and covered by `src/lib/caja.test.ts`. **Gap**: the subtraction IS tested (`caja.test.ts:20-35` asserts `cajaCents === 21700` = `20000 + 3500 − 1500 − 300`), but the two narrative scenarios the design explicitly required — *fully repaid apoyo nets to zero* and *unrepaid apoyo stays negative* — have no dedicated test case (see Findings W1). The formula is correct by inspection (a fully-repaid `1000` apoyo yields `−1000 + 1000 = 0`; an unrepaid one stays `−1000`), but it is not individually asserted.

### 2. Opening Amount Singleton — VERIFIED
`supabase/sql/phase5_egresos.sql:64-69` — `configuracion_caja` `id smallint primary key default 1 check (id = 1)` (singleton). `src/features/caja/repo.ts:43-51` — `saveApertura` UPSERTs `id: 1` (update-not-insert guaranteed by the PK). Live production evidence: exactly 1 row, `id = 1`, `monto_apertura = 0` (the seed); admin-writability live-proven by `admins_all_configuracion_caja` using `is_admin()`. The `saveApertura` write itself remains code-verified, not live-exercised.

### 3. Egreso Recording Decreases Arca — PARTIAL
Code-level VERIFIED: `registro_egresos` DDL (`phase5_egresos.sql:52-60`, live-confirmed); `saveEgreso` inserts one row (`src/features/caja/repo.ts:24-33`); `fetchCaja` maps `registro_egresos.monto` → `egresosCents` → subtracted (`repo.ts:69,77`, `caja.ts:33-34`). **Gap**: no egreso row has ever been inserted (production `sum(registro_egresos.monto)` = `0`), so the end-to-end decrease is schema+formula verified only.

### 4. Support Disbursement Decreases Arca — VERIFIED (the amendment's core)
`src/lib/caja.ts:6,14,32,34` — `CajaInput.apoyosCents` and `CajaBreakdown.apoyosTotalCents` exist and `computeCaja` SUBTRACTS `apoyosTotalCents`. `src/features/caja/repo.ts:68,76` — `fetchCaja` fetches `registro_apoyos.monto_total` and passes `apoyosCents`. `src/features/apoyos/repo.ts:22-52` — `saveApoyo` writes `registro_apoyos` + `cargos` (no balance column); the deduction happens at read. Covered by `caja.test.ts:20-35` ("subtracts a disbursed apoyo"). The corrected contract is fully realised.

### 5. Abono Increases Arca — VERIFIED (code-level; V.1 untested)
`src/features/pagos/repo.ts:59-65` — `aplicarPago` inserts exactly ONE `registro_pagos` row with `monto_pagado: input.montoPagadoPesos` (the FULL input, `:61`), never the FIFO-decremented remainder; `unappliedCents` is returned separately (`:68`). The 106 real pago rows are consistent with the full-monto invariant (corroboration, not a test — see V.1).

### 6. Por Cobrar (Receivable) Display — VERIFIED (excluded from balance)
`src/features/caja/repo.ts:87-93` — `fetchPorCobrar()` returns `aggregateDebtByMember(...).totalPendienteCents` via a SEPARATE query, never passed to `computeCaja`. `src/features/caja/index.ts:68-77` — `renderBreakdown(breakdown, porCobrarCents)` renders `porCobrarCents` to a separate element (`caja-por-cobrar`, `:74`) while `cajaTotal` gets `breakdown.cajaCents` (`:73`). `computeCaja` (`caja.ts:30-43`) has no `porCobrar` input. See Amendment Verification for the full exclusion proof.

### 7. Breakdown Cards — VERIFIED (code-present)
`index.html:378-402` renders all six cards — `Apertura` (`:380`), `Pagos Recibidos` (`:384`), `Apoyos Entregados` (`:388`), `Egresos` (`:392`), `Arca (disponible)` (`:396`), `Por Cobrar` (`:400`). `src/features/caja/index.ts:69-74` populates all six via `setText`. `Arca (disponible)` = `Apertura + Pagos − Apoyos − Egresos` holds because `cajaTotal` is `breakdown.cajaCents` (`:73`) and the other cards are the four breakdown terms. UI runtime is code-verified, not browser-exercised.

### 8. Pago_sin_cargo Disbursement Convention — VERIFIED (documented)
Documented in `design.md` "Pago_sin_cargo Convention (amendment)" and `spec.md` "Requirement: Pago_sin_cargo Disbursement Convention" — a sin-cargo disbursement is a `registro_egresos` row, NEVER a `registro_pagos` row (inflow sign inversion). The code enforces this structurally: `saveEgreso` (`repo.ts:24-33`) is the only "money leaves" path, `aplicarPago` (`pagos/repo.ts:59-65`) is the only inflow path, and there is no code path that writes an egreso-like event as `registro_pagos`. Operational convention, satisfied by construction + documentation.

### 9. No Double-Counting — VERIFIED
`src/lib/caja.ts:31-34` — each input array reduced once; no dedup. Covered by `caja.test.ts:50-67` (two/three identical rows each counted once; `pagosTotalCents === 1500`, `apoyosTotalCents === 200`, `egresosTotalCents === 400`, `cajaCents === 900`).

### 10. Negative Arca Is Allowed — PARTIAL
Unclamped compute VERIFIED: `computeCaja` returns `−20000` unclamped (`caja.test.ts:37-48`); no clamp and no "insufficient balance" guard anywhere (grep confirmed). Rendering code correct — admin `src/features/caja/index.ts:76` (`text-red-600` when `cajaCents < 0`), dashboard `src/features/dashboard/index.ts:70-72`, public `src/public-view.ts:99` all apply red, never hide/clamp. **Browser rendering is browser-unverified** (V.3) — the "displayed clearly and unblocked" half has not been exercised in a real browser (Tailwind Play CDN means utility-class rendering is only confirmable in-browser).

### 11. Public Surface Exposes Only Aggregate Arca — VERIFIED
`api/debt-view.ts:87-92` and `:62-64` use explicit column lists, never `select('*')`. Response body `:108-114` exposes `cajaCents` (net aggregate) only — no `apoyosTotalCents`, `egresosTotalCents`, or `porCobrar` field. `DebtViewResponse` (`src/lib/types.ts:133-140`) has `generatedAt, totalPendienteCents, deudores, banco, cajaCents` — no egreso/apoyo rows, no operator identity, no member UUIDs. Public bundle `vista-JGgdU31_.js` is supabase-free (build proof). See Amendment Verification for the `totalPendienteCents` nuance.

### 12. Migration Safety and Reversibility — VERIFIED (live evidence)
`phase5_egresos.sql:29-47` — compatibility guard runs BEFORE any DDL (aborts cleanly on drift). `registro_egresos` columns mirror the live `registro_pagos`/`registro_apoyos` (`monto numeric`, `id uuid`, `fecha date`, `motivo text`, `capturado_por uuid`, `nombre_capturador text`). `_down.sql:7-8` drops exactly the two new tables, touches nothing else. Migration applied to production; drill (POSITIVE `numeric(10,2)` clean / NEGATIVE `text` aborted, 0 tables / DOWN preserved pre-existing tables) still valid.

### 13. Row-Level Security — VERIFIED (live evidence)
`phase5_egresos.sql:74-86` — `enable row level security` + `revoke all … from anon` + `admins_all_*` policies using `is_admin()`. Live proof: `rowsecurity = true` on both tables; `anon` select = false on both; `authenticated` select = true; anon grants = 0.

### 14. CLABE Copy Affordance — PARTIAL
Code-level VERIFIED: `src/lib/clipboard.ts:15-64` — `copyToClipboard` with Clipboard API → `execCommand` fallback, never throws; button + success/failure feedback in `src/public-view.ts:39-56` and `:62-80`; slot `vista/index.html:44`. **Copy success and fallback are browser-unverified** — never exercised in a real browser.

### 15. Dependency-Free Copy Helper — VERIFIED (build proof)
`src/lib/clipboard.ts` has **zero imports** (browser globals only). `src/public-view.ts:17-19` imports only `./lib/clipboard`, `./lib/escape`, `./lib/types`. Build output `dist/assets/vista-JGgdU31_.js` = 2.49 kB; grep for `supabase|anon|service_role` = clean; `clipboard-C4m4V8Ek.js` also clean.

## Amendment Verification

### A1. The formula (subtract apoyos) — VERIFIED
`src/lib/caja.ts:34`: `cajaCents = input.openingCents + pagosTotalCents - apoyosTotalCents - egresosTotalCents`. This matches the amended contract `Apertura + Σ(registro_pagos.monto_pagado) − Σ(registro_apoyos.monto_total) − Σ(registro_egresos.monto)` exactly. `CajaInput` gained `apoyosCents` (`:6`); `CajaBreakdown` gained `apoyosTotalCents` (`:14`). `fetchCaja` (`repo.ts:68,76`) and `api/debt-view.ts:90,100` both feed `registro_apoyos.monto_total` into that term. No stored running balance anywhere.

### A2. Net-zero on full repayment / negative on unrepaid — VERIFIED by construction
`saveApoyo` writes `registro_apoyos.monto_total` (deduction at read) and the member's repayment flows back through `aplicarPago` → `registro_pagos.monto_pagado` (addition at read). A fully-repaid apoyo nets `−monto_total + monto_pagado = 0`; an unrepaid one stays `−monto_total`. Correct by inspection; the two dedicated scenario tests are missing (W1).

### A3. "Por cobrar" exclusion — VERIFIED (genuinely excluded)
`computeCaja`'s input type (`caja.ts:1-9`) has `openingCents, pagosCents, apoyosCents, egresosCents` — **no** por-cobrar field. `fetchPorCobrar` (`repo.ts:87-93`) is a SEPARATE function returning `totalPendienteCents`; it is called only in `index.ts:87` and rendered to a SEPARATE element (`caja-por-cobrar`, `:74`), never summed into `cajaCents`. In `api/debt-view.ts`, `cajaCents` is computed from `computeCaja({openingCents, pagosCents, apoyosCents, egresosCents})` (`:97-102`) with no por-cobrar term; `totalPendienteCents` is a separate response field (`:110`) derived from `aggregateDebtByMember` (`:79`). **The "Por cobrar" figure is not present in the balance arithmetic anywhere.**

### A4. Label-only rename — VERIFIED (no identifier leak)
Grep across the codebase for `computeArca|ArcaInput|arcaCents|fetchArca|initArca|#arca-content|features/arca` returns **zero matches**. All identifiers remain: `computeCaja` (`caja.ts:30`), `CajaInput` (`caja.ts:1`), `CajaBreakdown` (`caja.ts:11`), `cajaCents` (`caja.ts:16/34/41`, `types.ts:139`, `public-view.ts:97-99`, `dashboard/index.ts:69-70`), `src/lib/caja.ts`, `src/features/caja/{index,repo}.ts`, `fetchCaja` (`repo.ts:64`), `initCaja` (`index.ts:23`, wired `main.ts:9,48`), `#caja-content` (`index.html:341`, `main.ts:59`), `data-view="caja-content"` (`index.html:92`), `configuracion_caja` (`phase5_egresos.sql:64`, `types.ts:118-119`, `repo.ts:44/55/66`). User-facing labels are "Arca" / "Arca (disponible)" at exactly the five required surfaces: module heading (`index.html:342`), nav entry (`index.html:92`), balance card (`index.html:396`), dashboard KPI (`index.html:134`), public card (`vista/index.html:36`). The only `arca` occurrences in `.ts` files are a lowercase comment (`repo.ts:85`, referring to the shared Supabase project name), not an identifier.

### A5. Public surface rule — VERIFIED (net aggregate only)
`api/debt-view.ts:108-114` response body and `DebtViewResponse` (`types.ts:133-140`) expose `cajaCents` (net aggregate) only — no apoyos/egresos/por-cobrar breakdown, no operator identity, no member UUIDs, explicit column lists only. **Nuance (SUGGESTION S1):** `totalPendienteCents` (numerically equal to "Por cobrar") is a PRE-EXISTING public field ("Deuda Total Pendiente", `vista/index.html:31-32`) that predates this change; it is the debt-view's primary metric, not an Arca-breakdown term. The amendment's rule — *the Arca breakdown must not leak* — is satisfied. `design.md:228`'s wording "never exposed on the public surface" overstates this specific point.

### A6. `Pago_sin_cargo` documentation — VERIFIED
Documented in `design.md` ("Pago_sin_cargo Convention (amendment)") and `spec.md` (Requirement: Pago_sin_cargo Disbursement Convention), including the inflow-sign-inversion trap. Confirmed by the structural absence of any path that records an egreso-like event as `registro_pagos`.

## Test Evidence

**`npx vitest run`** (exit 0):
```text
 RUN  v5.0.0 C:/Users/LABORATORIO/Downloads/desarrollos/MC/control_admon_ponci

 Test Files  12 passed (12)
      Tests  185 passed (185)
   Start at  22:11:44
   Duration  179ms (transform 54%, import 28%, tests 11%, worker 7%)
```

**`npx tsc --noEmit`** (exit 0): no output (clean).

**`npm run build`** (exit 0):
```text
> control-admon-poncitlan@0.1.0 build
> vite build

vite v8.3.0 building client environment for production...
✓ 89 modules transformed.
dist/vista/index.html               3.11 kB │ gzip: 1.16 kB
dist/mi-cuenta/index.html           4.38 kB │ gzip: 1.20 kB
dist/index.html                    42.88 kB │ gzip: 5.60 kB
dist/assets/clipboard-C4m4V8Ek.js   0.58 kB │ gzip: 0.35 kB
dist/assets/escape-DYbPpw36.js      0.83 kB │ gzip: 0.48 kB
dist/assets/mi-cuenta-LpCGKOLL.js   1.71 kB │ gzip: 0.71 kB
dist/assets/vista-JGgdU31_.js       2.49 kB │ gzip: 1.16 kB
dist/assets/main-Dn8T3jO7.js        8.78 kB │ gzip: 3.58 kB

✓ built in 117ms

> control-admon-poncitlan@0.1.0 postbuild
> node scripts/check-no-service-role.mjs

postbuild: no "service_role" leakage found in dist/ (8 files checked).
```

**Commit hygiene** (`git diff --stat dab7a62..HEAD` → 22 files, +1693/−23): source/SQL/docs only. **No secret** appears — the only `service_role` matches in the diff are documentation text (design/exploration/verify-report prose describing the server-side-only role), plus the `postbuild` guard output; no JWT, no anon/URL/key literal, no private key, no password. `.codegraph/` is **NOT committed** (`git ls-files` returns 0 entries; `.codegraph/.gitignore` is untracked `??`). **Correction to the prior report**: the prior report claimed `openspec/` was "NOT tracked" — that is now stale; the SDD artifacts ARE committed (they appear in the diff stat). No secret either way.

**Test layer distribution**: all 12 test files are unit tests (Vitest, no DOM/HTTP/browser harness). `src/lib/caja.test.ts` (4 tests) is the amendment's direct coverage. No integration/E2E harness exists in the project's capabilities, so browser-only behaviours (negative rendering, CLABE copy) are legitimately out of the unit-test layer.

**TDD evidence**: no `apply-progress` artifact exists in the change directory, so the RED/GREEN/triangulation cycle could not be cross-referenced against a TDD Cycle Evidence table (SUGGESTION S4). The test files exist and pass, which is consistent with a completed RED→GREEN cycle, but the cycle ledger itself is absent.

## Findings

**CRITICAL**: None. No secret in the diff; no failing check; no identifier rename leak; the amended formula is correct and tested for the subtraction.

**WARNING**:
1. **Two amendment scenarios untested** — `src/lib/caja.test.ts` asserts the apoyo subtraction (`:20-35`) and unclamped negativity (`:37-48`, egresos-driven), but *"fully repaid apoyo nets to zero"* and *"unrepaid apoyo stays negative"* — explicitly required by `design.md` (Testing Strategy, case 2) and `tasks.md:5.1` — have no dedicated test case. The formula is correct by inspection and the subtraction is tested, but the two narrative scenarios are not individually asserted. This is the single most important pre-archive gap and a trivial test to add.
2. **`tasks.md` ledger out of sync with the amendment** — `tasks.md:94` V.2 still reads "`saveApoyo` … contributes no caja term. CONFIRMED", which is the SUPERSEDED contract (spec now: "Support Disbursement Decreases Arca"). PR 5 tasks 5.1–5.8 (`tasks.md:82-89`) and V.3 (`:95`) remain `[ ]` unchecked although the amendment code is committed and green. The code is correct; the task ledger is stale and must be reconciled (mark 5.1–5.7 done; 5.8/V.3 stay browser-gated) before archive.
3. **Req 3 end-to-end unexercised** — no `registro_egresos` row has ever been inserted (production `sum(registro_egresos.monto)` = 0). The "record egreso → Arca decreases" path is schema + formula verified only.
4. **Browser-only behaviours unexercised** — negative-`cajaCents` red rendering (Req 10 / V.3) and CLABE copy success + fallback (Req 14) are code-inspected only; never run in a real browser (the app uses the Tailwind Play CDN, so utility-class rendering can only be confirmed in-browser).
5. **V.1 untested** — `src/features/pagos/repo.ts:59-65`: the full-`monto_pagado` invariant has no unit test (no DI seam). The 106 real pago rows + derived sum corroborate it, but a silent regression in `aplicarPago` would not be caught by the suite.

**SUGGESTION**:
1. `design.md:228` — "it is never exposed on the public surface" is imprecise: `totalPendienteCents` (numerically equal to "Por cobrar") IS a pre-existing public field ("Deuda Total Pendiente"). The Arca breakdown is correctly excluded; only the wording overstates.
2. `index.html:377` — the breakdown sub-heading "Desglose de Caja" still says "Caja" (outside the five enumerated labels, but a user-facing inconsistency with the "Arca" rename).
3. `src/lib/types.ts:54` — `RegistroEgreso` is declared but unreferenced in the runtime path (schema-contract only). Wire it or annotate as contract-only.
4. No `apply-progress` artifact exists for this change, so the TDD cycle evidence could not be cross-referenced.

## Verification Gaps

- **Two amendment unit-test scenarios missing**: fully-repaid-net-zero and unrepaid-negative (W1).
- **No real egreso disbursement**: Req 3's runtime decrease is unproven by an actual insert (W3).
- **No browser**: V.3 negative rendering and Req 14 CLABE copy (success + fallback) are code-verified only (W4).
- **No DI seam for `aplicarPago`**: V.1 full-`monto_pagado` invariant is inspection-verified + real-data-corroborated, not test-covered (W5).
- **`tasks.md` stale**: V.2 superseded text + PR 5 tasks unchecked (W2).
- **Public cache staleness** (accepted, documented): up to 300s stale revalidation on `cajaCents`.

## Conclusion

The **material amendment is correctly implemented**. `computeCaja` now subtracts `Σ(registro_apoyos.monto_total)` (`src/lib/caja.ts:34`), `fetchCaja` and `api/debt-view.ts` both feed that term, the "Por cobrar" figure is genuinely excluded from the balance arithmetic, and the "Arca" rename is presentational-only with zero identifier leakage. All three automated commands are green (185/185 tests, clean type-check, build + supabase-free postbuild guard), no secret is in the diff, and `.codegraph/` was never committed.

**This is not archive-ready.** The blockers are quality-and-runtime gaps, not code defects: (1) the two amendment-specific scenarios (fully-repaid-net-zero, unrepaid-negative) lack dedicated unit tests; (2) `tasks.md` is out of sync with the amendment (V.2 superseded text + unchecked PR 5); (3) no real egreso exists so Req 3 is unexercised end-to-end; (4) negative rendering and CLABE copy remain browser-only. Envelope `verdict: fail` reflects these remaining gaps — there are **0 CRITICAL findings and 0 blockers**. Verdict on the code and schema: **PASS WITH WARNINGS**; verdict on archive-readiness: **NOT ARCHIVE-READY** until the two tests are added, `tasks.md` is reconciled, and the browser checks plus a real egreso are exercised.
