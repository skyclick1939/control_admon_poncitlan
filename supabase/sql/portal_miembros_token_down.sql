-- ============================================================================
-- portal-miembros DOWN script — member access token columns
-- Reverses portal_miembros_token.sql. Additive-safe to reverse: nothing
-- references these columns, and the only data lost is token digests, which
-- were already unrecoverable by design (D9/D10). Rolling this back revokes
-- every live member link — that is the intended effect, not a side effect.
-- ============================================================================
alter table public.miembros drop column token_hash;        -- drops miembros_token_hash_key
alter table public.miembros drop column token_generado_en;
