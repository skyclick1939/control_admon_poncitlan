# Phase 0 — `auth.users` Account Audit (task 0.5)

Change: `evolucion-plataforma-arca` — Phase 0, security fix on the live shared
Supabase project (`qjswicjxwsbwnxrrowsi`).

## Why this audit exists

Design decision D8 flags a gap in the original proposal: disabling signup
(task 0.3) and revoking `anon` (task 0.4) close the open-signup vulnerability
going forward, but do **not** remove any account that may have already
self-registered while signup was open. Without this audit, Phase 0 would not
actually close the incident — it would only prevent recurrence.

## Method

`auth.users` was enumerated (9 rows) and cross-referenced against
`capturado_por` / `registrado_por` foreign-key usage in this app's own tables
(`registro_apoyos`, `registro_pagos`) — this part is independently verifiable
by re-running the same queries against the live project. The identity/legitimacy
disposition of each account (who owns `fors@gmail.com`, that the 7 `arca.local`
accounts belong to a separate unrelated project, that `alexis@gmail.com` is a
real known former capturista and not an attacker) is a fact only the project
owner can attest to — it was given directly by the project owner in this
project's Engram session history (project `control_admon_poncitlan`,
`evolucion-plataforma-arca` change) and is recorded here as a human-attested
conclusion, not something a future session can re-derive from database
queries alone. The FK-reference counts below (21 + 84 = 105) ARE independently
verifiable and are the technical reason the account was kept regardless of
its legitimacy status.

## Findings

9 accounts total in `auth.users`. Disposition:

| Account | Count | Disposition |
|---|---|---|
| `fors@gmail.com` | 1 | **Keep.** Project owner's own account. Will be seeded as the sole superadmin in Phase 2 (task 2.2) — out of scope for Phase 0. |
| `admin@arca.local`, `pres.vallarta@arca.local`, `pres.tonala@arca.local`, `pres.poncitlan@arca.local`, `pres.guadalajara@arca.local`, `pres.aguascalientesnorte@arca.local`, `pres.zapopan@arca.local` | 7 | **Out of scope.** Confirmed by the project owner to belong to a different, unrelated project ("arca" national chapters system, still in approval) that happens to share this Supabase project. Not touched, not banned, not deleted. |
| `alexis@gmail.com` | 1 | **Keep — do not delete or ban.** Known, legitimate former capturista (real person, not an attacker). Verified this session: 21 rows in `registro_apoyos.capturado_por` and 84 rows in `registro_pagos.registrado_por` reference this user id. Deleting the account would null that attribution (`ON DELETE SET NULL`) with no security benefit. This account's elevated access will be revoked naturally in Phase 2 by simply not including it in the seeded `app_admins` table (task 2.2) — not a Phase 0 action. |

## Conclusion

No unrecognized or attacker-controlled account was found in `auth.users`.
Nobody appears to have exploited the open-signup vulnerability between the
app going live and this Phase 0 fix. **There is nothing to delete or ban in
this phase.**

Scope discipline: this audit reads and reasons about `auth.users` rows and
the two in-scope tables' FK-attribution columns only. No `auth.users` row was
modified, banned, or deleted, and no table outside this app's four
(`miembros`, `cargos`, `registro_apoyos`, `registro_pagos`) was touched.
