# Archive Report: Arca Ledger (`caja-y-transferencia`)

**Archived**: 2026-09-15
**Status**: COMPLETE
**Verdict**: PASS WITH WARNINGS — 54/54 tasks complete, 0 CRITICAL findings, 0 blockers, 19/19 requirements and 36/36 scenarios addressed (5 VERIFIED / 14 PARTIAL), 2 new capabilities merged into the source of truth.

## Change Summary

**Change**: `caja-y-transferencia`
**Artifact Store**: openspec (repo-local; no Engram artifact writes for this change)
**Archive Location**: `openspec/changes/archive/2026-09-15-caja-y-transferencia/`
**Delivery State**: merged to `main` (HEAD `1408615`) and LIVE in production. The four migrations are APPLIED and read-back verified live.

The change defines the club's liquid-position ledger ("Arca"): a stored opening amount, member-payment inflows, recoverable support disbursements, and non-recoverable disbursements, with the balance derived on read and negative balances allowed.

## Task Completion Gate

Per the persisted tasks artifact (`openspec/changes/caja-y-transferencia/tasks.md`, now archived):

- **Total tasks**: 54
- **Complete**: 54 (100%)
- **Incomplete**: 0

Independently confirmed by native status (`gentle-ai sdd-status caja-y-transferencia --json`):

```text
taskProgress: { "total": 54, "completed": 54, "pending": 0, "allComplete": true }
dependencies: { "verify": "all_done", "archive": "ready" }
nextRecommended: "archive"
artifactStore: "openspec"
```

The archive readiness gate passed: `dependencies.archive: ready` and `nextRecommended: archive`. No stale-checkbox reconciliation was required or performed — the persisted artifact already reflected the final state, including V.3 checked with its evidence. No unchecked implementation task remains in the archived ledger.

## Source Authority and Final-State Facts

Sources were ranked per the skill's Final-State Authority, most authoritative first:

1. **Persisted tasks artifact** — 54/54 checked (above). Authoritative for completion visibility.
2. **Explicit final-state facts in the archive launch prompt** — work that continued after the intermediate artifacts were persisted. These outrank the snapshots below.
3. **`verify-report`** — an intermediate snapshot. In this change it is also the most recent verification artifact: **RE-VERIFICATION #3 (FINAL)**, rewritten at archive time, `evidence_revision: sha256:377181ca48aea4e57304d98f0542b5e299731b7ed72c30b565a9159067113468`. It explicitly **supersedes** a prior `fail` report (`sha256:b1f158ff…`, `11/15` requirements, `10/20` scenarios) that was written before the artifact reconciliation (commit `7b40509`) and before V.3 was exercised. Every blocker the prior report listed is closed in the current one.

Final-state facts that postdate or outrank the intermediate snapshots, recorded as current:

- **V.3 (negative-balance rendering) was exercised DELIBERATELY against production on 2026-09-15 in a real browser, then reverted.** Because the Arca is positive in normal operation, the negative path is otherwise unreachable; `configuracion_caja.monto_apertura` was temporarily set to a synthetic value chosen so the derived Arca was exactly a small negative amount (figure redacted). All THREE surfaces were confirmed live with that negative — the admin dashboard "Arca (disponible)" KPI, the admin Arca module breakdown, and the public `/vista/` with no session — each rendered red and unblocked, with the two outflow cards SEPARATE under "Salidas del arca" and "Por Cobrar" NOT summed into the balance. Reverted the same session: `monto_apertura` restored to its original value and confirmed by read-back, and only that one column was ever written, so `updated_by`/`updated_at` retain their original values — **zero residual trace**. Documented caveat: the public endpoint's edge cache (`max-age=60` + `stale-while-revalidate=300`) can lag the revert by up to ~1 minute — accepted staleness, not a defect.
- **Test suite**: 190 tests across 13 files, all green. `tsc --noEmit` exit 0. `npm run build` exit 0 with the supabase-free postbuild guard. The two amendment apoyo-netting scenarios are individually asserted at `src/lib/caja.test.ts:37` and `:53`.
- **A real `registro_egresos` row exists** (created by the phase 8 reclassification), so the egreso path is exercised end-to-end with real data.
- **Four migrations APPLIED and read-back verified live**: `phase5_egresos`, `phase6_miembros_status_interno`, `phase7_egresos_beneficiario`, `phase8_reclasificar_gasto_sin_cargar`, each with a `_down`. Three are additive; phase 8 is one guarded, atomic, reversible data reclassification.

No unrankable contradiction was found between the ranked sources. One minor factual correction to the launch prompt is recorded under **Deviations and Integrity Notes** below.

## Verification Results

Per the archived `verify-report.md` (RE-VERIFICATION #3, FINAL — treated as current, not stale):

```yaml
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 19/19
scenarios: 36/36
test_command: npx vitest run
test_exit_code: 0
build_command: npm run build
build_exit_code: 0
```

**Counting methodology (per the report — two notions, deliberately not conflated):**

- Envelope `19/19` / `36/36` = requirements/scenarios **addressed** (have evidence: passing unit test, independent live evidence, or source inspection; none untested, none failing).
- Prose VERIFIED vs PARTIAL = the **strength** of that evidence. Source inspection alone never yields VERIFIED. Under that bar: **5 VERIFIED / 14 PARTIAL** requirements, and **7 COMPLIANT (unit test) / 2 live-confirmed (RLS) / 27 PARTIAL (inspection)** scenarios.

**CRITICAL findings**: None. **Blockers**: None. No secret was found in the change diff; the postbuild guard output mentions `service_role` only as documentation.

The 16 WARNING items in the archived report are all PARTIAL classifications (code-inspection-only or partially exercised behaviour) plus the accepted public-cache staleness; none blocks archive.

## Specs Merged into Source of Truth

| Capability | Location | Requirements | Scenarios | Action |
|---|---|---|---|---|
| Arca (`caja`) | `openspec/specs/caja/spec.md` | 17 | 33 | ADDED (capability created) |
| Public CLABE Copy (`public-clabe-copy`) | `openspec/specs/public-clabe-copy/spec.md` | 2 | 3 | ADDED (capability created) |

**Merge method**: neither main spec existed, so each delta spec IS a full spec and was copied **mechanically** with the shell (`Copy-Item` → staged temp → `Move-Item`), then verified by an empty `git diff --no-index` and matching SHA-256 pairs. No model Read → Write path was used for artifact bytes. Native `sdd-archive-compose` was not applicable: it composes a delta into an **existing** canonical spec, and neither `openspec/specs/caja/` nor `openspec/specs/public-clabe-copy/` existed prior to this archive. The established project convention set by the `2026-09-14-portal-miembros` archive (main spec = verbatim copy of the delta, `## ADDED Requirements` heading retained) is followed byte-for-byte.

**Archive rule check** — `openspec/config.yaml` `rules.archive` requires a WARN before merging **destructive** deltas, especially schema/auth changes on the shared Supabase project. Assessment: **not destructive**. Both deltas are pure `## ADDED Requirements` merged into brand-new capability homes — no requirement removed, no requirement modified, no rename. The three pre-existing `portal-miembros` capabilities in `openspec/specs/` are untouched. The shared-Supabase schema changes the spec describes were already applied live and read-back verified; three are additive and phase 8 is one guarded, atomic, reversible data reclassification. No warning-level confirmation was required, and none was bypassed.

## Archive Contents

Archived to `openspec/changes/archive/2026-09-15-caja-y-transferencia/`:

- `proposal.md` — change intent, scope, approach, rollback plan
- `exploration.md` — research and decision rationale
- `design.md` — technical decisions, module boundaries, testing strategy
- `tasks.md` — all 54 tasks checked and verified complete (0 unchecked)
- `specs/caja/spec.md` — Arca delta spec (17 requirements / 33 scenarios)
- `specs/public-clabe-copy/spec.md` — public CLABE copy delta spec (2 requirements / 3 scenarios)
- `verify-report.md` — RE-VERIFICATION #3 (FINAL), PASS WITH WARNINGS
- `archive-report.md` — this file (additive; not present in the pre-move source snapshot)

## Mechanical Operations and Readback (verbatim evidence)

### Step 1 — Fold the two delta specs into `openspec/specs/`

Staged copy, compared, then moved into place:

```text
--- caja staged diff (empty = identical) ---
caja staged diff exit: 0
--- public-clabe-copy staged diff (empty = identical) ---
clabe staged diff exit: 0
```

Final readback (delta vs. main spec):

```text
--- FINAL readback: caja delta vs main spec (empty = identical) ---
caja final exit: 0
--- FINAL readback: public-clabe-copy delta vs main spec (empty = identical) ---
clabe final exit: 0
```

SHA-256 pairs (source delta, destination main spec):

```text
3ED0449400D4D84C405F0C5BC559D33F224E5D4B6027A5B3D2D08B2D7EF5022A  specs/caja/spec.md  (delta)
3ED0449400D4D84C405F0C5BC559D33F224E5D4B6027A5B3D2D08B2D7EF5022A  openspec/specs/caja/spec.md  (main)
EB717721D0EA8C83D526FBFA67F2D4A352D0C9383263CD1713BC3BFD80AE2F11  specs/public-clabe-copy/spec.md  (delta)
EB717721D0EA8C83D526FBFA67F2D4A352D0C9383263CD1713BC3BFD80AE2F11  openspec/specs/public-clabe-copy/spec.md  (main)
```

### Step 2 — Move the change folder to the archive

A recursive pre-move snapshot was taken to a temp directory outside the repo, the destination collision guard found no collision, the folder was moved, the source absence was asserted, and the destination was compared against the snapshot. Verbatim output:

```text
--- MANDATORY readback: snapshot vs destination (empty = identical) ---
warning: in the working copy of '<snapshot>\source/verify-report.md', LF will be replaced by CRLF the next time Git touches it
archive move readback exit: 0
warning: in the working copy of 'openspec/changes/archive/2026-09-15-caja-y-transferencia/verify-report.md', LF will be replaced by CRLF the next time Git touches it
snapshot removed: True
```

The two `warning:` lines are Git's `autocrlf` notices emitted identically for the same file on both sides; they are **not** diff content. `git diff --no-index --exit-code` printed no difference and exited **0**, so the snapshot and the archived tree are byte-identical. The temp snapshot was removed after the readback.

Post-move verification:

- [x] Main specs updated correctly (`openspec/specs/caja/spec.md`, `openspec/specs/public-clabe-copy/spec.md` created byte-identical)
- [x] Change folder moved to archive (`openspec/changes/archive/2026-09-15-caja-y-transferencia/`)
- [x] Archive contains all artifacts (7 pre-existing files + this additive report)
- [x] Archived `tasks.md` has 0 unchecked and 54 checked tasks
- [x] Active changes directory no longer has this change (`source exists: False`); `openspec/changes/` now holds only `archive/` and the unrelated `evolucion-plataforma-arca/`
- [x] Verbatim `diff` readback included above and empty

## Deviations and Integrity Notes

1. **Move mechanism deviation (deliberate).** The skill prefers `git mv` for tracked folders. The archive launch prompt carries a hard constraint: *do not commit, push, or perform any git mutation; leave the worktree for the human to review.* `git mv` stages a rename, which mutates the index. The move was therefore performed with the filesystem-only `Move-Item` (the skill's permitted `mv` fallback shape), with the mandatory pre-move snapshot and post-move `diff` readback intact. **Nothing was staged, committed, or pushed.** Git will surface the archive as deletions at the old paths plus untracked additions at the new paths for human review.
2. **Launch-prompt line counts vs. repository evidence.** The prompt described `specs/caja/spec.md` as 200 lines and `specs/public-clabe-copy/spec.md` as 23 lines; the files are **305** and **36** lines respectively. The prompt's requirement/scenario counts (17/33 and 2/3) match the files exactly, and the ledger budget is unaffected. Repository evidence outranks the prompt's line counts; recorded so a future reader is not confused.
3. **Working tree intentionally left uncommitted.** `tasks.md` (V.3 checked with its evidence) and `verify-report.md` (RE-VERIFICATION #3, rewritten) were already modified in the working tree at archive time. Those modifications were carried into the archive by the move; they were not committed.
4. **Minor public-repo hygiene note (not fixed, per instruction).** The archived `verify-report.md` embeds a local absolute filesystem path inside its captured `vitest` output block. Pre-existing artifact content; the archive neither introduced nor modified it. No credential, financial figure, member name, UUID, or operator identity is involved. Low severity.

## Outstanding Items (recorded as OUTSTANDING — not done, not dropped)

These are explicitly NOT complete. They are carried forward so the next reader does not mistake the archive for their closure:

1. **Legacy sub-cent `cargos` normalization.** The operator's discontinued "cents placeholder" practice creates cents-level phantom debt on real members. A normalization UPDATE is available but was **NEVER run**. Recommended, not performed.
2. **YEAR FILTER — deferred, not implemented.** It is a reporting MODEL, blocked on three decisions: (i) flows vs. balance — the Arca is cumulative, so a period figure means "at year-end"; (ii) the aperture has no effective date — it must be defined as "balance before the first recorded movement"; (iii) "Por Cobrar" is **not** historically reconstructible because payments are recorded per MEMBER, not per CARGO, so the FIFO allocation is never persisted.
3. **CLABE copy success path + `execCommand` fallback** — code-inspected only; never clicked in a browser (verify-report WARNING 1).
4. **V.1 full-`monto_pagado` invariant** — inspection-verified only; no DI seam exists for a unit test (verify-report WARNING 2).
5. **The 14 PARTIAL requirements** listed in the archived verify report — all code-inspection-only or partially exercised (rendered admin ranking table, group-division preview, `saveApertura` UI write, "captures nothing" confirmation, `saveEgreso` UI path, "Por cobrar" not summed, internal-member selectability, full six-card render, beneficiary-name survival, single capture flow, public aggregate-only, cross-surface debt equality, migration `_down` reversibility).

## Artifact Store Consistency

**openspec mode**: the report is the filesystem artifact required by Section C (no Engram artifact write for this change). All operations are repo-local; `actionContext.allowedEditRoots` was `["C:\...\control_admon_ponci"]` and every write stayed inside it.

## Delivery State

This change is closed per the Final-State Authority in the skill:

1. **Task completion gate**: PASSED — 54/54 checked, zero incomplete, corroborated by native status `allComplete: true`.
2. **Verification gate**: PASSED — 0 CRITICAL findings, 0 blockers, `pass_with_warnings`, 19/19 requirements and 36/36 scenarios addressed.
3. **Archive operations**: COMPLETED — both delta specs folded into `openspec/specs/`, change folder moved, integrity verified by empty readbacks and matching hashes.
4. **Artifact persistence**: COMPLETED — this report written to the archived change folder.

Ordinary repository policy decides delivery. **No commit, push, or git mutation was performed**; the worktree is left for the human to review.

## Key Learnings

1. Archiving two brand-new capabilities is a pure mechanical copy (no `sdd-archive-compose`), because composition only applies when a canonical spec already exists to merge into.
2. The 2026-09-14 portal-miembros archive established that this project keeps the `## ADDED Requirements` heading in the folded main spec; matching that byte-for-byte keeps the source of truth self-consistent.
3. Git's `autocrlf` warnings appear identically on both sides of a directory comparison and are not diff content — the empty `diff --no-index` output with exit 0 is the actual byte-identity evidence.
4. When the launch prompt forbids git mutations but the skill prefers `git mv`, the filesystem-only move with the mandatory snapshot readback preserves both the audit-trail guarantee and the no-mutation constraint.
5. A verify report can be both an intermediate snapshot and the freshest verification artifact; recording its `evidence_revision` and superseded predecessor is what keeps the archived audit trail unambiguous.
