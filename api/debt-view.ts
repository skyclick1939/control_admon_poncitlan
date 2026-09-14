import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { aggregateDebtByMember, type CargoPendienteRow } from '../src/lib/debt-view.js';
import type { DebtViewResponse } from '../src/lib/types.js';

// ============================================================================
// api/debt-view.ts — sole public, unauthenticated read surface (design.md,
// tasks.md task 3.3; specs public-debt-view, bank-config).
//
// service_role bypasses RLS entirely and is server-side only. Env naming
// (design.md research C12, hard rule): unprefixed SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY — never VITE_-prefixed, or Vite would inline the
// key into the client bundle. package.json's `postbuild` script (task 3.5)
// greps dist/ for "service_role" and fails the build if it ever leaks.
//
// Explicit column lists only, never select('*') — the guard against
// over-exposure on a service_role query (spec public-debt-view, "Sensitive
// Field Exclusion").
// ============================================================================

// Module-scope, created lazily on first request and reused across warm
// invocations (design.md: "module scope, reused warm"). Deferred rather than
// created eagerly at import time so a missing env var surfaces as a 502 on
// request, not a cold-start crash.
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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const db = getServiceRoleClient();
    if (!db) {
      console.error('debt-view: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      sendJson(res, 502, { error: 'unavailable' });
      return;
    }

    const [cargosResult, bancoResult] = await Promise.all([
      db.from('cargos').select('monto_pendiente, miembros(nickname)').eq('estado', 'pendiente'),
      db.from('configuracion_bancaria').select('banco, clabe, titular').eq('id', 1).maybeSingle(),
    ]);

    if (cargosResult.error || bancoResult.error) {
      // Detail logged server-side only — echoing the driver error would leak
      // table/column names to anonymous callers (design.md "Errors").
      console.error('debt-view: supabase query failed', cargosResult.error ?? bancoResult.error);
      sendJson(res, 502, { error: 'unavailable' });
      return;
    }

    // The untyped supabase-js client heuristically infers `miembros` as an array
    // from the plural table name; at runtime (cargos.miembro_id -> miembros.id
    // is many-to-one) it is a single object or null (see dashboard/index.ts's
    // identical caveat).
    const { totalPendienteCents, deudores } = aggregateDebtByMember(
      (cargosResult.data ?? []) as unknown as CargoPendienteRow[],
    );

    const responseBody: DebtViewResponse = {
      generatedAt: new Date().toISOString(),
      totalPendienteCents,
      deudores,
      banco: bancoResult.data ?? null,
    };

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    sendJson(res, 200, responseBody);
  } catch (err) {
    // getServiceRoleClient()'s createClient() call throws synchronously on a
    // malformed SUPABASE_URL, and any other unexpected failure in this path
    // must not leak an opaque platform 500 — the same 502 contract as a
    // Supabase query error applies here (design.md "Errors").
    console.error('debt-view: unhandled error', err);
    sendJson(res, 502, { error: 'unavailable' });
  }
}
