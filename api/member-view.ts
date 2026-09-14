import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  summarizeMemberHistory,
  toMemberCargoEntries,
  toMemberPagoEntries,
  type CargoRowForMember,
  type PagoRowForMember,
} from '../src/lib/member-view.js';
import { isTokenShape } from '../src/lib/member-token.js';
import type { MemberViewResponse } from '../src/lib/types.js';

// ============================================================================
// api/member-view.ts — token-scoped, unauthenticated read surface (design.md
// D11; tasks.md task 4.4; specs member-private-view). Clones api/debt-view.ts's
// service_role pattern and adds exactly one thing debt-view does not have: a
// per-visitor selector (the token). A lookup miss is the ONLY failure mode —
// missing, malformed, unknown, and revoked tokens all resolve to the same
// 404 body (D11's indistinguishable-failure contract).
//
// Explicit column lists only, never select('*') — motivo and observaciones
// are never fetched for this path, not merely never rendered (D13).
// ============================================================================

let cachedClient: SupabaseClient | null = null;

function getServiceRoleClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;

  cachedClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Lowercase SHA-256 hex digest of the plaintext token (design.md D10). */
function sha256hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Defense-in-depth re-compare of the stored and computed digests
 * (design.md D11 — "not the load-bearing control", the `.eq()` match
 * already did the real work). Both are 64-char hex, so equal-length
 * buffers are guaranteed once this is reached; a length mismatch still
 * fails closed rather than throwing.
 */
function timingSafeHexEqual(storedHex: string, computedHex: string): boolean {
  const stored = Buffer.from(storedHex, 'hex');
  const computed = Buffer.from(computedHex, 'hex');
  if (stored.length !== computed.length) return false;
  return timingSafeEqual(stored, computed);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Every response on this route is visitor-scoped — success and failure
  // alike must never be served from a shared cache to a different visitor
  // (spec member-private-view: "Failure response is also non-cacheable").
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token');

    // D12's pre-DB short-circuit: isTokenShape is a pure predicate over the
    // candidate string, so this branch cannot leak which tokens exist — it
    // only rejects strings that are not 43-char base64url, with zero DB hits.
    if (token === null || !isTokenShape(token)) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    const db = getServiceRoleClient();
    if (!db) {
      console.error('member-view: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      sendJson(res, 502, { error: 'unavailable' });
      return;
    }

    const tokenHash = sha256hex(token);

    const memberResult = await db
      .from('miembros')
      .select('id, nickname, token_hash')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (memberResult.error) {
      console.error('member-view: supabase query failed', memberResult.error);
      sendJson(res, 502, { error: 'unavailable' });
      return;
    }

    const member = memberResult.data as { id: string; nickname: string; token_hash: string } | null;

    // No row (unknown or revoked token) and a stale/mismatched digest both
    // land here as the exact same 404 — a lookup miss is the only failure
    // mode by construction (D9's `set token_hash = null` revocation model).
    if (!member || !timingSafeHexEqual(member.token_hash, tokenHash)) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    const [cargosResult, pagosResult] = await Promise.all([
      db
        .from('cargos')
        .select('monto_original, monto_pendiente, estado, created_at, registro_apoyos(fecha)')
        .eq('miembro_id', member.id)
        .order('created_at', { ascending: false }),
      db
        .from('registro_pagos')
        .select('monto_pagado, fecha_pago')
        .eq('miembro_id', member.id)
        .order('fecha_pago', { ascending: false }),
    ]);

    if (cargosResult.error || pagosResult.error) {
      console.error('member-view: supabase query failed', cargosResult.error ?? pagosResult.error);
      sendJson(res, 502, { error: 'unavailable' });
      return;
    }

    // Same untyped supabase-js join-inference caveat as debt-view.ts's
    // `miembros` column: cargos -> registro_apoyos is many-to-one at runtime
    // even though the plural table name is heuristically inferred as an array.
    const cargoRows = (cargosResult.data ?? []) as unknown as CargoRowForMember[];
    const pagoRows = (pagosResult.data ?? []) as unknown as PagoRowForMember[];

    const totals = summarizeMemberHistory(cargoRows, pagoRows);

    const responseBody: MemberViewResponse = {
      generatedAt: new Date().toISOString(),
      nickname: member.nickname,
      totalPendienteCents: totals.totalPendienteCents,
      totalPagadoCents: totals.totalPagadoCents,
      cargos: toMemberCargoEntries(cargoRows),
      pagos: toMemberPagoEntries(pagoRows),
    };

    sendJson(res, 200, responseBody);
  } catch (err) {
    console.error('member-view: unhandled error', err);
    sendJson(res, 502, { error: 'unavailable' });
  }
}
