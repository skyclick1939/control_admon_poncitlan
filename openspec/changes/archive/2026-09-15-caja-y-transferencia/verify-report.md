```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:377181ca48aea4e57304d98f0542b5e299731b7ed72c30b565a9159067113468
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 19/19
scenarios: 36/36
test_command: npx vitest run
test_exit_code: 0
test_output_hash: sha256:eb3ad055ac9b81e3c94e332e9130418e34a62a072e8fa7ef61110a1054258a3f
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:24e9c5335bd617dd88543e83483df80a90862c1e470533b7be116e644e1b34a3
```

## Verification Report

> **Redaction note.** This repository is public. No production financial figure, member name, UUID, or operator identity appears in this report; amounts are shown as `[redacted]` and only row COUNTS and the SHAPE of evidence are retained. No database was contacted during this verification — every live fact below was supplied in the amendment brief or read from the repo's own recorded evidence.

**Change**: caja-y-transferencia
**Mode**: Strict TDD (`vitest run`)
**Revision**: RE-VERIFICATION #3 (FINAL). This report **supersedes** the prior one (`evidence_revision: sha256:b1f158ffa16425f162894a909d7e075a5a70ebc58d083410d88cd6d90955bf88`, `verdict: fail`, `requirements: 11/15`, `scenarios: 10/20`). The prior report was written BEFORE the artifact reconciliation (commit `7b40509`) and BEFORE V.3 was exercised. Every blocker it stated is now closed: (a) the two apoyo-netting scenarios now have dedicated tests; (b) `tasks.md` is reconciled with the settled contract; (c) V.3 is exercised and reverted. Requirement/scenario totals differ from the prior report because the settled spec restructured the support/por-cobrar/breakdown/capture-flow/beneficiary/migration/RLS requirements.

## Summary

- **VERIFIED: 5 · PARTIAL: 14 · 0 UNTESTED · 0 FAILING · 0 CRITICAL · 0 blockers** (19 requirements).
- **Scenarios: 7 COMPLIANT (covering unit test) · 2 live-confirmed (RLS) · 27 PARTIAL (source-inspected, several with live corroboration).** None untested, none failing.
- All three automated commands are green: `npx vitest run` **190/190 across 13 files**, `npx tsc --noEmit` exit 0, `npm run build` exit 0 + postbuild guard clean.
- The change is **merged to `main`** (HEAD `1408615`) and **live in production**. All 54 tasks are complete.
- The previously-open gaps are all closed: the two apoyo-netting scenarios are individually asserted (`src/lib/caja.test.ts:37,53`); `tasks.md` carries the settled contract (V.2 text corrected, V.3 checked); V.3 was exercised deliberately against production on 2026-09-15 in a real browser and reverted with zero residual trace; and a real `registro_egresos` row now exists (the phase 8 reclassification), so the egreso path is exercised end-to-end with real data.

## Counting Methodology

Two distinct notions are reported, and they must not be conflated:

- **Envelope `requirements` / `scenarios` ("complete")** = requirements/scenarios that are **addressed** — i.e., have verification evidence (a passing unit test, independent live/runtime evidence, or source inspection) and are **not** untested and **not** failing. Every one of the 19 requirements and 36 scenarios is addressed, so the envelope reads `19/19` and `36/36`.
- **VERIFIED vs PARTIAL (prose)** = the *strength* of that evidence. A requirement is **VERIFIED** only when its contract is proven by a passing covering unit test OR by independent live/runtime evidence that exercises the exact behavior. **Source inspection alone never yields VERIFIED** — it yields **PARTIAL**, per the mandate to classify honestly and not inflate. Under this bar, **5 requirements are VERIFIED and 14 are PARTIAL**; **7 scenarios are COMPLIANT (unit test), 2 are live-confirmed, and 27 are PARTIAL (inspection)**.

## Requirement Verification

| # | Requirement | Scenarios | Status | Evidence |
|---|-------------|-----------|--------|----------|
| 1 | Derived Arca Balance | 3/3 | ✅ VERIFIED | `caja.ts:34` formula; `caja.test.ts` asserts array-sum (`:5`), net-zero (`:37`), unrepaid-negative (`:53`) |
| 2 | Opening Amount Singleton | 0/1 | ⚠️ PARTIAL | Row `id=1` exists live (seed); column written+read-back in V.3; `saveApertura` UPSERT (`caja/repo.ts:49`) code-inspected only |
| 3 | Arca Page Is Query/Config Only | 0/1 | ⚠️ PARTIAL | No capture form (grep clean; duplicate form removed `f94757a`); not browser-exercised |
| 4 | Non-Recoverable Disbursements in `registro_egresos` | 0/2 | ⚠️ PARTIAL | Real egreso row exists via phase 8 (live data); `saveEgreso` sole-writer + UI path code-inspected |
| 5 | Support Disbursement Decreases Arca | 1/1 | ✅ VERIFIED | `caja.test.ts:20` "subtracts a disbursed apoyo" |
| 6 | Abono Increases Arca | 0/1 | ⚠️ PARTIAL | `pagos/repo.ts:59-65` full-`monto_pagado` invariant — inspection only (V.1, no DI seam) |
| 7 | Por Cobrar (Receivable) Display | 0/1 | ⚠️ PARTIAL | Separate element `#caja-por-cobrar` (`index.html:393`, `caja/index.ts:34`); `computeCaja` has no por-cobrar term — code-inspected |
| 8 | Internal Members Excluded | 1/4 | ⚠️ PARTIAL | `debt-view.test.ts:85` covers the exclusion; group-division/selectability code-inspected |
| 9 | Breakdown Cards | 0/2 | ⚠️ PARTIAL | Six cards (`index.html:371-393`), "Salidas del arca" heading (`:378`); V.3 confirmed two outflow cards live; full render not browser-exercised |
| 10 | Egreso Beneficiary Traceability | 0/3 | ⚠️ PARTIAL | `beneficiario_id`/`nombre_beneficiario` schema + `saveEgreso` persist — code-inspected |
| 11 | Single Capture Flow, Three Modalities | 0/5 | ⚠️ PARTIAL | `apoyos/repo.ts:68-74` `saveApoyoSinCargos`→`saveEgreso`; phase 8 real row; no unit test |
| 12 | No Double-Counting | 1/1 | ✅ VERIFIED | `caja.test.ts:82` "counts every element exactly once" |
| 13 | Negative Arca Is Allowed | 1/1 | ✅ VERIFIED | `caja.test.ts:69` unclamped; V.3 rendered red/unblocked on all three surfaces live |
| 14 | Public Surface Exposes Only Aggregate | 0/1 | ⚠️ PARTIAL | `api/debt-view.ts:87-114` explicit columns + `cajaCents` only; postbuild guard clean; no unit test |
| 15 | Debt Consistency Across Surfaces | 0/2 | ⚠️ PARTIAL | Single `aggregateDebtByMember` shared; no cross-surface equality test |
| 16 | Migration Safety and Reversibility | 0/2 | ⚠️ PARTIAL | Migrations applied + read-back verified live; `_down` reversibility code-inspected (never run) |
| 17 | Row-Level Security | 2/2 | ✅ VERIFIED | Live: `rowsecurity=true`, `anon` select=false/grants=0, `authenticated` via `is_admin()` |
| 18 | CLABE Copy Affordance | 0/2 | ⚠️ PARTIAL | `clipboard.ts:15-64` + `public-view.ts:50,75-79`; success + `execCommand` fallback never clicked in a browser |
| 19 | Dependency-Free Copy Helper | 0/1 | ⚠️ PARTIAL | `clipboard.ts` zero imports; build output supabase-free (postbuild guard) |

**Compliance summary**: 19/19 requirements addressed — **5 VERIFIED, 14 PARTIAL**. 36/36 scenarios addressed — **7 COMPLIANT (unit test), 2 live-confirmed, 27 PARTIAL (inspection)**. 0 untested, 0 failing.

## Test Evidence

**`npx vitest run`** (exit 0):
```text
 RUN  v5.0.0 [repo root]

 Test Files  13 passed (13)
      Tests  190 passed (190)
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
dist/index.html                    41.97 kB │ gzip: 5.66 kB
dist/assets/clipboard-C4m4V8Ek.js   0.58 kB │ gzip: 0.35 kB
dist/assets/escape-DYbPpw36.js      0.83 kB │ gzip: 0.48 kB
dist/assets/mi-cuenta-LpCGKOLL.js   1.71 kB │ gzip: 0.71 kB
dist/assets/vista-JGgdU31_.js       2.49 kB │ gzip: 1.16 kB
dist/assets/main-Dn8T3jO7.js        8.78 kB │ gzip: 3.58 kB

✓ built in ~120ms

> control-admon-poncitlan@0.1.0 postbuild
> node scripts/check-no-service-role.mjs

postbuild: no "service_role" leakage found in dist/ (8 files checked).
```

**Test layer distribution**: all 13 test files are unit tests (Vitest, no DOM/HTTP/browser harness). The two amendment-critical pure functions are directly covered — `computeCaja` (6 tests) and `aggregateDebtByMember` (8 tests, incl. the `'interno'` exclusion). No integration/E2E harness exists in the project's capabilities, so browser-only behaviours (negative rendering, CLABE copy) are legitimately outside the unit-test layer and were instead exercised manually (V.3) or are documented as code-inspected.

## Strict TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| RED→GREEN evidenced | ✅ | `src/lib/caja.test.ts` and `src/lib/debt-view.test.ts` exist beside sources and pass |
| All tasks have evidence | ✅ | 54/54 complete; each carries a verification note |
| GREEN confirmed (tests pass) | ✅ | 190/190 pass on execution |
| Triangulation adequate | ✅ | caja suite asserts distinct values (21700, 0, −10000, −20000, 900) — no trivial single-case |

**Assertion quality**: ✅ No tautologies, no ghost loops, no smoke-test-only, no mock-heavy tests. `caja.test.ts` and `debt-view.test.ts` assert concrete numeric outcomes. The one structurally ununit-testable invariant (`aplicarPago` full-`monto_pagado`) is correctly scoped to the verify phase (no DI seam; documented in `design.md` Testing Strategy and `tasks.md` V.1).

## Findings

**CRITICAL**: None. No failing check; no secret in the diff (only the postbuild guard output mentions `service_role`, as documentation); `.codegraph/` is not committed.

**WARNING** (all PARTIAL — source-inspection-only or partially exercised; none blocks archive):

1. **CLABE copy success + `execCommand` fallback** — code-inspected only (`clipboard.ts`, `public-view.ts:50,75-79`), never clicked in a real browser.
2. **V.1 full-`monto_pagado` invariant** — inspection-verified at `pagos/repo.ts:59-65`; no DI seam for a unit test.
3. **Rendered admin "Ranking de Deudores" table** — not browser-exercised.
4. **Group-division preview** (`TODOS`/`FULLPARCH` internal-member exclusion) — code-inspected only (`apoyos/index.ts`).
5. **`saveApertura` admin write path** — singleton target live-confirmed, but the UPSERT-through-UI is code-inspected.
6. **Arca page "captures nothing"** — grep-confirmed (duplicate form removed), not browser-confirmed.
7. **`saveEgreso` UI capture path** — a real egreso row exists via the phase 8 reclassification, but the UI save path is code-inspected.
8. **"Por cobrar" not summed into balance** — code-inspected (separate function/element); the exclusion itself is unit-tested.
9. **Internal member selectable for INDIVIDUAL + as beneficiary** — code-inspected.
10. **Six breakdown cards render** — code + V.3 (two outflow cards confirmed separate, live); full six-card render not browser-exercised.
11. **Egreso beneficiary name survives member deletion** — code-inspected (FK `on delete set null` + denormalized name).
12. **Single capture flow (three modalities)** — code + phase 8 data; no unit test.
13. **Public aggregate-only (no leak)** — code + postbuild guard; no unit test.
14. **Debt consistency (cross-surface equality)** — code-inspected (one shared aggregator); no equality test.
15. **Migration `_down` reversibility** — code-inspected; never executed in production.
16. **Public cache staleness** (`max-age=60` + `stale-while-revalidate=300`) — accepted, documented; a fresh egreso can lag up to ~60s (up to ~300s stale).

**SUGGESTION**:
- `index.html:368` — the breakdown sub-heading still reads "Desglose de Caja" (outside the five enumerated "Arca" labels, but a user-facing inconsistency with the rename). Presentational, non-blocking.

## Prior Blockers — Closed

| Prior blocker | Disposition |
|---------------|-------------|
| (a) Two apoyo-netting scenarios missing dedicated tests | ✅ Closed — `caja.test.ts:37` ("nets a fully repaid apoyo to zero") and `:53` ("leaves an unrepaid apoyo as a negative balance") |
| (b) `tasks.md` ledger out of sync with the amendment | ✅ Closed — V.2 text corrected to the subtraction contract; V.3 checked; all 54 tasks complete |
| (c) V.3 negative-rendering unexercised | ✅ Closed — exercised 2026-09-15 against production on all three surfaces (admin KPI, admin Arca module, public `/vista/`), then reverted with zero residual trace |
| (extra) No real egreso row | ✅ Closed — a real `registro_egresos` row now exists via the phase 8 reclassification |

## Verdict

**PASS WITH WARNINGS.** The implementation matches the settled spec, design, and tasks. All 54 tasks are complete, the change is merged to `main` and live, the four migrations are applied and read-back verified, V.3 was exercised deliberately and reverted, the two amendment scenarios are individually tested, and all three automated commands are green (190/190 tests, clean type-check, build + supabase-free postbuild guard). There are **0 CRITICAL findings and 0 blockers**. The 14 PARTIAL requirements are documented above — they are code-inspection-only or partially exercised behaviours (CLABE copy, `aplicarPago` invariant, rendered admin table, group-division preview, and the DB-bound/browser-only capture surfaces), none of which blocks archive.
