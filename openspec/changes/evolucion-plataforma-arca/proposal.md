# Proposal: ARCA Platform Evolution

> **Status (updated after Phase 0 executed):** the "Live risk" below describing the open-signup/blanket-RLS hole was the state of the project BEFORE this change started. Phase 0 has since executed and closed it — `disable_signup` is `true`, `anon` grants are revoked on all 4 tables, live-verified. See `tasks.md` for the authoritative, up-to-date phase/task status; this proposal document is a frozen planning snapshot and does not update as work completes.

## Intent

Live risk: `disable_signup: false` plus blanket `ALL`-for-`authenticated` RLS on all four tables lets any self-registered account fully control club finances. The same 858-line single-file app also mis-rounds split apoyos (unrounded float into `cargos`) and renders user text through unescaped `innerHTML`. Target state: a tested Vite+TypeScript app with real roles, DB-enforced superadmin MFA, and one public read-only debt view, with `anon` denied on every base table.

## Scope

### In Scope
- Role-based RLS + `disable_signup: true`; `anon` SELECT denied on all base tables
- Vite + TypeScript migration; Tailwind/Chart.js/supabase-js as npm deps; Vercel git-push deploy kept
- Pure money module (split + FIFO allocation) under Vitest; rounding bug fixed by largest-remainder reconciliation to exact cents
- HTML escaping for every rendered user string, admin UI and public view
- `app_admins` (superadmin|admin) + superadmin-only admin-management UI
- Superadmin TOTP MFA (`auth.mfa.*`) + `restrictive` AAL2 RLS policy on `app_admins` writes
- Public no-login debt view via one `api/*.ts` Vercel Function using `service_role`
- `configuracion_bancaria`, admin-writable, served by that same function
- `miembros` FKs `CASCADE` → `RESTRICT` plus an `activo` flag for retiring members

### Out of Scope
- Every other table in the shared arca project (`arca_*`, `n8n_chat_histories`, `telegram_whitelist`)
- Member logins — members stay rows in `miembros`, identified by nickname
- Framework rewrite, Nitro Vite plugin, private-schema hardening
- Repairing historical mis-rounded `cargos`; MFA for the `admin` role; recovery-codes API (unconfirmed, research Q2)

## Capabilities

### New Capabilities
- `auth-roles`: superadmin/admin model, `app_admins`, role-based RLS, signup closed
- `superadmin-mfa`: TOTP enroll/challenge/verify plus DB-level AAL2 gate
- `money-math`: exact-cent apoyo split and payment allocation
- `safe-rendering`: escaped output for all user-supplied text
- `public-debt-view`: unauthenticated debt + bank payload from one serverless function
- `bank-config`: `configuracion_bancaria` read/write rules
- `member-lifecycle`: create, retire (`activo`), restricted delete

### Modified Capabilities
- None — `openspec/specs/` is empty; this is the first change.

## Approach

Decided (rationale inherited from exploration/research): dedicated role table over JWT claims; the serverless function is the sole public-read surface, since RLS misconfiguration already caused the live incident; plain `api/*.ts` over Nitro (YAGNI); TypeScript; AAL2 enforced in RLS per research C1, never client-side only.

Phases: **0** security fix (sign-off gated) → **1** Vite+TS + money module + escaping → **2** roles + MFA → **3** public view + bank config → **4** `RESTRICT` + `activo`, `config.yaml` test-command flip. Escaping lands in Phase 1 so Phase 3 cannot ship unescaped output to anonymous visitors.

Declared assumptions, stated not asked: the last remaining superadmin cannot demote or delete itself; `api/*.ts` over Nitro.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `index.html` | Modified | Becomes the Vite entry shell |
| `src/` | New | TS modules, including pure `money.ts` + Vitest specs |
| `api/` | New | Public-read function; `service_role`, never `VITE_`-prefixed |
| `package.json`, `vite.config.ts` | New | Build config |
| ~~`vercel.json`~~ | **Superseded — see design.md D2** | Not created: the app is hash-routed (`#dashboard` etc.), not path-routed, so no SPA rewrite is needed. This row originally assumed a path router; design.md's D2 corrected it after reading the actual code. |
| Supabase (4 existing + 2 new tables) | Modified | RLS rewrite, FK policy, `activo` |
| `openspec/config.yaml` | Modified | `strict_tdd`/test commands once Vitest lands |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| RLS rewrite locks out live admins | Med | Apply in a verified order behind the sign-off gate; rollback below |
| `service_role` reaches the client bundle | Low | Never `VITE_`-prefixed; grep built assets before deploy |
| Client-only AAL2 gate ships | Low | `restrictive` policy is an acceptance criterion, not a design note |
| Signup toggle moved in the dashboard | Med | Confirm live location before flipping (research C14) |
| `RESTRICT` blocks legitimate deletions | Med | `activo` retirement path ships in the same phase |

## Rollback Plan

- **Phase 0 — RLS + signup (live, shared project)**: snapshot `pg_policies` for the four tables and the current `disable_signup` value first; prepare a DOWN script recreating the prior policies verbatim. No data is mutated, so rollback is policy replay plus re-flipping the toggle. Confirm with one authenticated smoke login before closing the change window.
- **Phase 4 — deletion policy**: `ALTER TABLE ... DROP CONSTRAINT` and re-add with `ON DELETE CASCADE`. `activo` is additive with a default and stays in place on rollback.
- **Phases 1–3 — code**: promote the previous Vercel deployment (immutable). New tables are additive; drop only if unused.

## Dependencies

- **Separate explicit user sign-off immediately before `sdd-apply` executes the `disable_signup`/RLS change.** Prior approvals in this change do not cover it.
- Supabase project-owner access; Vercel server-only env var for `service_role`.

## Success Criteria

- [x] Self-signup disabled; `anon` SELECT denied on all base tables — **done in Phase 0, live-verified; see `tasks.md` 0.3/0.4**
- [ ] `app_admins` write from an `aal1` superadmin session is refused by the database
- [ ] Vitest proves split cents sum exactly to the apoyo total
- [ ] Public URL returns debt + bank info with no session and exposes nothing else
- [ ] A `<script>` payload in a nickname renders as text in every view
- [ ] Deleting a member with financial history is refused; retiring succeeds

## Input for `sdd-tasks`

The user wants these artifacts to double as an incremental roadmap ("poco a poco"): phased hierarchical numbering with a running applied/pending status log.
