# Research: evolucion-plataforma-arca

Schema: `gentle-ai.sdd-research/v1`
Revision: 1
Outcome: **done**

## Questions

1. Can Postgres RLS enforce AAL2 (TOTP-verified sessions) directly, as a real database security boundary rather than a client-side-only check?
2. What is the current `@supabase/supabase-js` v2 MFA API surface (enroll/challenge/verify/unenroll/listFactors/getAuthenticatorAssuranceLevel)?
3. What is the current, official convention for colocating Vite static frontend + Vercel serverless functions, and how is a server-only secret (e.g. `service_role`) kept out of the client bundle?
4. What is the current, correct field/toggle to disable public self-signup on a live Supabase project?

## Admission and observed grants

Research executor had WebFetch/WebSearch only (no write access), fetched directly against `supabase.com/docs`, `supabase.com/blog`, and `vercel.com/docs`. All primary sources below are official first-party documentation, not third-party/community content, except where explicitly noted.

## Sources

| ID | Class | Title | Publisher | URL | Accessed | Excerpt |
|----|-------|-------|-----------|-----|----------|---------|
| S1 | documentation | Multi-factor Authentication via Row Level Security Enforcement | Supabase (official blog) | https://supabase.com/blog/mfa-auth-via-rls | 2026-09-13 | `create policy "Enforce MFA..." on table_name as restrictive to authenticated using ( (select auth.jwt()->>'aal') = 'aal2' );` |
| S2 | documentation | Multi-Factor Authentication | Supabase (official docs) | https://supabase.com/docs/guides/auth/auth-mfa | 2026-09-13 | "adding MFA to your app's UI alone does not provide security" — RLS enforces at DB layer; documents 3 enforcement patterns + full enroll/challenge/verify/listFactors flow |
| S3 | documentation | auth-mfa-enroll (JS reference) | Supabase (official docs) | https://supabase.com/docs/reference/javascript/auth-mfa-enroll | 2026-09-13 | `enroll({factorType:'totp'\|'phone', friendlyName, phone?})` → `{id, type, friendly_name, totp:{qr_code,secret,uri}, phone}` |
| S4 | documentation | auth-mfa-verify (JS reference) | Supabase (official docs) | https://supabase.com/docs/reference/javascript/auth-mfa-verify | 2026-09-13 | `verify({factorId, challengeId, code})`; sibling `challenge({factorId, channel?})` at `/auth-mfa-challenge` |
| S5 | documentation | auth-mfa-getAuthenticatorAssuranceLevel (JS reference) | Supabase (official docs) | https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel | 2026-09-13 | Returns `{currentLevel:'aal1'\|'aal2'\|null, nextLevel, currentAuthenticationMethods}`; optional `jwt` param |
| S6 | documentation | Get auth service config (Management API reference) | Supabase (official docs) | https://supabase.com/docs/reference/api/v1-get-auth-service-config | 2026-09-13 | Schema field `disable_signup` (boolean) on `GET /v1/projects/{ref}/config/auth` |
| S7 | documentation | Vite on Vercel | Vercel (official docs) | https://vercel.com/docs/frameworks/frontend/vite | 2026-09-13 | `VITE_` prefix exposes vars client-side; SPA rewrite needs `vercel.json`; recommends Nitro plugin for a full backend |
| S8 | documentation | Vercel Functions | Vercel (official docs) | https://vercel.com/docs/functions | 2026-09-13 | `api/hello.ts` example explicitly labeled `framework=other` — zero-config, framework-agnostic |

## Validated claims

**Q1 — AAL2 at RLS layer**
- C1 (S1, S2): DB-enforced AAL2 via a `restrictive` RLS policy: `using ((select auth.jwt()->>'aal') = 'aal2')`, reading the `aal` claim server-side inside Postgres. Not a Supabase-shipped helper function (no `auth.require_aal2()`) — same raw-claim idiom as `auth.uid()`. Confidence: high (2 independent primary sources, matching SQL).
- C2 (S1, S2): Three documented enforcement variants — all authenticated users; only accounts created after a cutoff; only users with a `verified` row in `auth.mfa_factors` (queryable in RLS, `auth` schema). Confidence: high.
- C3 (S2): Supabase explicitly states client-side AAL checks alone are not a security boundary; RLS is the documented enforcement point. Confidence: high.
- **Conclusion**: DB-level AAL2 enforcement exists and should be mandated for any superadmin-write table (e.g. `app_admins`). No need for a serverless-function workaround for this specific need.

**Q2 — supabase-js v2 MFA API**
- C4 (S3) `enroll({factorType, friendlyName, phone?})`. C5 (S4) `challenge({factorId, channel?})`, `verify({factorId, challengeId, code})`. C6 (S2) `unenroll({factorId})` — requires the session to already be at aal2 to unenroll a verified factor (API-level gate distinct from RLS). C7 (S5) `getAuthenticatorAssuranceLevel(jwt?)` → `{currentLevel, nextLevel, currentAuthenticationMethods}`. C8 (S2) `listFactors()` confirmed.
- Version-sensitivity flag: an `mfa.recoveryCodes`-style API surfaced only in a GitHub PR title during search — **not confirmed against a published reference page**; do not assume it ships without checking the installed package version at design/apply time.

**Q3 — Vite + Vercel Functions colocation**
- C9 (S8): `api/` directory is Vercel's zero-config, framework-agnostic Functions convention (`framework=other` example) — works for plain Vite with no `vercel.json` needed just for functions.
- C10 (S7): `vercel.json` is needed for one specific reason on a Vite SPA — a `rewrites` block for client-side-router deep-linking. Unrelated to whether functions work.
- C11 (S7): Vercel's current Vite-specific doc recommends the Nitro Vite plugin for "a comprehensive backend." **Open tension, not resolved by research**: plain `api/*.ts` (C9) remains documented/supported. Orchestrator recommendation for `sdd-design`: use plain `api/*.ts` — this app needs exactly one small public-read function, and Nitro's fuller backend surface is unnecessary complexity for that (matches this project's own YAGNI/simplicity direction, already applied when rejecting Next.js/SvelteKit in round 1).
- C12 (supplementary, vite.dev/guide/env-and-mode): only `VITE_`-prefixed variables are statically bundled into client JS; unprefixed variables (e.g. `service_role` key) stay server/build-only. Confidence: high, cross-confirmed by S7's own `VITE_VERCEL_ENV` example. **Hard naming rule for design/apply**: the `service_role` key must never carry a `VITE_` prefix.

**Q4 — `disable_signup`**
- C13 (S6): `disable_signup` (boolean) confirmed as current Management API field name. Confidence: high.
- C14 (supplementary, supabase.com/docs/guides/auth/general-configuration): current Dashboard toggle labeled "Allow new users to sign up" under Authentication → General Configuration. Confidence: medium (AI-summarized fetch, not a verbatim quote; community reports describe dashboard nav drifting across versions). **Action for apply**: visually confirm the exact toggle location in the live project dashboard immediately before flipping it.

## Contradictions, uncertainty, freshness

- No contradictions found between sources.
- Gaps: no Supabase-shipped SQL function for AAL2 (raw JWT-claim expression only, nothing further to find); `challenge`/`verify`/`listFactors` each confirmed via a single source (less redundancy than enroll/getAAL/unenroll); recovery-codes API unconfirmed (see Q2); Q4's dashboard nav path is medium-confidence only.
- All 8 primary sources are official first-party documentation accessed 2026-09-13; no stale/deprecated-version warnings encountered on the fetched pages themselves.

## Risks surfaced by research

- Security-critical: if `sdd-design` implements only the client-side `getAuthenticatorAssuranceLevel()` gate without the `restrictive` RLS policy (C1), MFA provides no real protection against a replayed/forged `authenticated`-role request.
- A `service_role` key accidentally declared with a `VITE_` prefix would be bundled into public client JS at build time (C12) — hard rule, not style preference.
- Supabase Auth dashboard UI reorganizes across versions (C14) — verify live before touching the shared production project's signup toggle.

## Product choices (separate, non-authoritative — recorded here for traceability, decided by the user via the orchestrator's grouped prompt, not by this research)

- Role model: 2 authenticated roles (superadmin, admin/capturista), no member login — **confirmed**.
- Public dashboard mechanism: Vercel serverless function with `service_role` server-side, base tables deny `anon` SELECT — **confirmed**.
- Vite migration language: TypeScript — **confirmed**.
- Member deletion policy: RESTRICT when financial history exists (no more `ON DELETE CASCADE`) — **confirmed**.
- Superadmin self-demotion/self-deletion of the last superadmin: blocked — **orchestrator-declared assumption** (uncontested best practice to prevent total lockout; flagged to the user, not a contested fork).
- `api/*.ts` plain Vercel Functions (not the Nitro Vite plugin) — **orchestrator recommendation for `sdd-design`**, given C11's open tension and this project's established simplicity/YAGNI direction.
- Explicit user sign-off to execute the RLS-policy/`disable_signup` change against the live, shared Supabase project remains **separately gated**, immediately before `sdd-apply` runs that specific step — not granted by this research or by the product-decision confirmations above.

## proposal_ready

`true` — evidence is `done`, all forked product decisions are `confirmed`, evidence references above are valid (8 verifiable URLs), and the hybrid artifact-store state (Engram `sdd/evolucion-plataforma-arca/research` + this file) is ready to be written in parallel.
