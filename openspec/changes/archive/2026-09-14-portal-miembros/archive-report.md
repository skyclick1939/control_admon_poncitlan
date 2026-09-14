# Archive Report: Member Portal (`portal-miembros`)

**Archived**: 2026-09-14  
**Status**: COMPLETE  
**Verdict**: PASS — All 31 tasks complete, 0 critical findings, 3 new capabilities merged into source of truth

## Change Summary

**Change**: `portal-miembros`  
**Artifact Store**: hybrid (openspec + Engram)  
**Archive Location**: `openspec/changes/archive/2026-09-14-portal-miembros/`

## Task Completion Status

Per the persisted tasks artifact (`openspec/changes/portal-miembros/tasks.md`):

- **Total tasks**: 31
- **Complete**: 31 (100%)
- **Incomplete**: 0

All implementation tasks are checked and verified complete. No stale unchecked tasks remain in the archive.

### Task Coverage by Phase

| Phase | Tasks | Status | Details |
|-------|-------|--------|---------|
| 1 — Admin Payment History | 1.1–1.6 (6 tasks) | ✓ Complete | Member history queries + UI + test coverage |
| 2 — Access Token Schema | 2.1–2.5 (5 tasks) | ✓ Complete | DDL applied live 2026-09-14, read-back verified |
| 3 — Token Issuance | 3.1–3.8 (8 tasks) | ✓ Complete | Module boundary + client generation + UI |
| 4 — Member Portal | 4.1–4.12 (12 tasks) | ✓ Complete | 3 manual E2E tasks with real production evidence |

## Verification Results

Per the persisted verify-report (`openspec/changes/portal-miembros/verify-report.md`):

**Verdict**: PASS

- **Blockers**: 0
- **Critical findings**: 0
- **Requirements**: 12/12 compliant
- **Scenarios**: 27/27 compliant
- **Test exit code**: 0 (181 tests passed)
- **Build exit code**: 0 (all three Vite entries built, service_role guard passed)

### Evidence Summary

1. **Specification Compliance**: All 12 requirements and 27 scenarios across the three new specs are satisfied with passing tests or live-verified evidence.

2. **Live Database State**: Schema applied live 2026-09-14 per design D9; read-back verification confirmed schema matches DDL specification. Task 2.4–2.5 record explicit evidence: `information_schema` inspection confirms `token_hash text` and `token_generado_en timestamptz` on `miembros`; constraint validation passed; multiple NULL values accepted; unique index enforced expected collisions; `anon` role confirmed zero grants.

3. **Manual Tasks with Real Evidence**:
   - **Task 4.10 (D11-timing)**: Real token issued on member Pumba, 30 curl samples per case. Recorded medians: unknown-token approximately 0.472s, revoked-token approximately 0.529s (57ms gap, within noise for identical code path), missing-token approximately 0.330s (140–190ms faster, accepted pre-DB short-circuit asymmetry). Token revoked immediately after.
   - **Task 4.11 (E2E)**: Valid token returned 200 with member data verified against actual database values (nickname, totals, cargos, pagos); confirmed no UUID/motivo/observaciones leakage. Invalid, missing, unknown, and revoked tokens returned byte-identical JSON error not_found. Cache-Control headers verified on both success and failure via curl. Referrer-leak check in real Chrome: document.referrer returned empty string after navigation from mi-cuenta to vista, confirming no-referrer meta tag. Token revoked after checks.
   - **Task 4.12 (Production)**: curl returned 200 for both mi-cuenta page and api/member-view endpoint directly against production Vercel deployment.

4. **No Regression**: diff stat across all portal-miembros commits confirms zero changes to api/debt-view.ts, vista directory, RLS, grants, or policies. The 7 existing evolucion-plataforma-arca capabilities are structurally unmodified.

### Note on Verify-Report Findings

The verify-report included one non-blocking suggestion: "Local branch is 21 commits ahead of origin/main and has not been pushed." Per the orchestrator's final-state facts, this was investigated immediately after verification and found to be a FALSE POSITIVE:

- **Root cause**: The local refs/remotes/origin/main tracking ref was stale because this project's established push convention uses an inline authenticated URL (git push https://token@github.com/...), which does not update the local tracking ref.
- **Investigation**: `git ls-remote` against the actual GitHub repo confirmed the remote HEAD already matched local HEAD exactly — all commits were genuinely pushed.
- **Resolution**: Fixed with `git fetch origin` (read-only); no commits were ever missing from GitHub.
- **Verification**: The verify-report itself was committed and pushed as commit f0de048 after the final-state facts were confirmed.

## Specs Merged into Source of Truth

Three new capabilities added to `openspec/specs/`:

| Capability | Location | Requirements | Scenarios | Action |
|---|---|---|---|---|
| Member Payment History | openspec/specs/member-payment-history/spec.md | 3 | 6 | ADDED |
| Member Access Token | openspec/specs/member-access-token/spec.md | 4 | 9 | ADDED |
| Member Private View | openspec/specs/member-private-view/spec.md | 5 | 12 | ADDED |

**Merge method**: Mechanical copy to new spec directories (none existed prior). All source bytes verified identical via diff -r post-copy.

### Requirement Summary by Capability

**Member Payment History** (3 requirements):
- Full Per-Member History Retrieval (with scenario coverage for mixed-state and retired members)
- History Totals (with scenario coverage for totals-accuracy and empty-history cases)
- No New Authorization Surface (relying solely on existing is_admin grants)

**Member Access Token** (4 requirements):
- Single Live Token With Atomic Rotation (one live token per member, immediate invalidation on regenerate)
- One-Time Plaintext Disclosure, Hash-Only Storage (plaintext shown once, hash-only persisted)
- Token Entropy (32+ bytes of CSPRNG, no collisions)
- Admin-Only Issuance and Rotation (gated by existing is_admin authorization)

**Member Private View** (5 requirements):
- Token-Scoped Own-Data Response (returns only the token's member's data)
- Indistinguishable Failure Response (identical response for invalid, missing, revoked)
- Sensitive Field Exclusion (excludes UUID, capturador identity, observaciones)
- Private, Non-Cacheable Response (Cache-Control: private, no-store on all responses)
- No Duplication of Club-Wide Aggregation (links to existing /vista/, no duplicate totals)

## Archive Contents

Archived to `openspec/changes/archive/2026-09-14-portal-miembros/`:

- proposal.md — Change intent, scope, approach, rollback plan
- exploration.md — Research and decision rationale
- design.md — Technical decisions D9–D16, module boundaries, testing strategy
- tasks.md — All 31 tasks checked and verified complete
- specs/ directory with three delta specs (member-payment-history, member-access-token, member-private-view)
- verify-report.md — Verification results, 12/12 requirements, 27/27 scenarios, PASS verdict

## Artifact Store Consistency

**Hybrid mode**: Both filesystem and Engram operations completed.

- **Filesystem**: All change artifacts moved to archive; three new specs merged into main specs directory.
- **Engram**: Archive report saved with topic_key sdd/portal-miembros/archive-report (upsert, no duplicate).

## Delivery State

This change is complete and closed per the Final-State Authority in the skill:

1. **Task completion gate**: PASSED — 31/31 tasks checked, zero incomplete.
2. **Verification gate**: PASSED — 0 critical findings, 27/27 scenarios compliant, 181/181 tests pass, build succeeds.
3. **Archive operations**: COMPLETED — specs synced, change folder moved, integrity verified via empty diff.
4. **Artifact persistence**: COMPLETED — archive report persisted to Engram and saved to filesystem.

The change has been fully planned (proposal/design), implemented (4 PR phases across commits f0de048–c791720), verified (PASS), and archived. It is ready for ordinary repository policy to decide delivery (commit and push, which remain pending per user discretion).

## Key Learnings

1. Hybrid SDD archive requires mechanical copy operations to preserve artifact bytes; diff -r verification is mandatory for audit trail integrity.
2. The stale refs/remotes/origin/main tracking ref in this project is a non-issue when actual GitHub state is confirmed via git ls-remote — the remedy is a read-only git fetch origin without destructive operations.
3. Multi-phase deliveries with auto-chain strategy require explicit archive of the closure commit f0de048 to record the final integrated state, distinct from the per-PR task tracking.
4. Bearer token design with hash-only storage and query-string distribution shifts most security burden onto the admin workflow and link distribution channel, which is acceptable for a small closed community when explicitly accepted by the project owner.
5. The testing strategy's D11-timing assertions ensure that timing-side-channel design decisions (acceptable asymmetry between shape-check and DB-lookup) are mechanically enforced rather than relying on code review, catching future refactors that might inadvertently equalize the latencies.
