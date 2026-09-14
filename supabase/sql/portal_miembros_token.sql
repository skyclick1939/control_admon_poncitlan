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
