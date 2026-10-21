import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildPublicBreakdown,
  type AjusteDesgloseRow,
  type CargoDesgloseRow,
  type MiembroRef,
  type PagoDesgloseRow,
} from '../src/lib/public-breakdown.js';
import { computeCaja } from '../src/lib/caja.js';
import { toCents } from '../src/lib/money.js';
import type { DebtViewAdeudo, DebtViewMiembro, DebtViewResponse } from '../src/lib/types.js';

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

/** The member embed as PostgREST returns it; a to-one relation at runtime. */
interface MiembroRaw {
  id: string;
  nickname: string;
  activo: boolean;
  status: MiembroRef['status'];
}

interface CargoRaw {
  id: string;
  monto_original: number;
  monto_pendiente: number;
  estado: 'pendiente' | 'pagado';
  created_at: string;
  miembros: MiembroRaw | null;
  registro_apoyos: { motivo: string | null; fecha: string } | null;
}

interface PagoRaw {
  monto_pagado: number;
  fecha_pago: string;
  miembros: MiembroRaw | null;
}

interface AjusteRaw {
  miembro_id: string;
  cargo_id: string | null;
  monto: number;
  tipo: AjusteDesgloseRow['tipo'];
  created_at: string;
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

    // Four reads, ONE failure contract: the breakdown is part of the public
    // contract now, so a missing piece would publish a figure nobody can
    // reconcile. `cargos` is no longer filtered to `estado='pendiente'`: the
    // history of covered adeudos is the point of the breakdown, and the open
    // balance still comes from `monto_pendiente` alone.
    const [cargosResult, bancoResult, pagosResult, ajustesResult] = await Promise.all([
      db
        .from('cargos')
        .select(
          'id, monto_original, monto_pendiente, estado, created_at, miembros(id, nickname, activo, status), registro_apoyos(motivo, fecha)',
        )
        .order('created_at', { ascending: true }),
      db.from('configuracion_bancaria').select('banco, clabe, titular').eq('id', 1).maybeSingle(),
      db.from('registro_pagos').select('monto_pagado, fecha_pago, miembros(id, nickname, activo, status)'),
      // No foreign-key hint: the member is resolved from the roster built below,
      // so this read cannot break on a generated constraint name.
      db.from('registro_ajustes').select('miembro_id, cargo_id, monto, tipo, created_at'),
    ]);

    if (cargosResult.error || bancoResult.error || pagosResult.error || ajustesResult.error) {
      // Detail logged server-side only — echoing the driver error would leak
      // table/column names to anonymous callers (design.md "Errors").
      console.error(
        'debt-view: supabase query failed',
        cargosResult.error ?? bancoResult.error ?? pagosResult.error ?? ajustesResult.error,
      );
      sendJson(res, 502, { error: 'unavailable' });
      return;
    }

    const cargosRaw = (cargosResult.data ?? []) as unknown as CargoRaw[];
    const pagosRaw = (pagosResult.data ?? []) as unknown as PagoRaw[];
    const ajustesRaw = (ajustesResult.data ?? []) as unknown as AjusteRaw[];

    // The roster comes from the two embeds that carry member fields, so the
    // adjustment rows (which carry only `miembro_id`) resolve without a
    // foreign-key hint. A member absent here has no cargo and no payment, and
    // the aggregator drops them anyway.
    const roster = new Map<string, MiembroRef>();
    for (const cargo of cargosRaw) if (cargo.miembros) roster.set(cargo.miembros.id, cargo.miembros);
    for (const pago of pagosRaw) if (pago.miembros) roster.set(pago.miembros.id, pago.miembros);

    const breakdown = buildPublicBreakdown({
      cargos: cargosRaw.map(
        (cargo): CargoDesgloseRow => ({
          id: cargo.id,
          miembro: cargo.miembros,
          monto_original: cargo.monto_original,
          monto_pendiente: cargo.monto_pendiente,
          estado: cargo.estado,
          // The support's own date is what the club reads; a cargo whose
          // support did not resolve falls back to its insert time.
          fecha: cargo.registro_apoyos?.fecha ?? cargo.created_at,
          // The member-facing label is the apoyo's motive: it is the text the
          // club actually wrote to describe the support, and the concept catalog
          // is still empty (265 cargos unclassified). Operator decision,
          // 2026-10-21: the motive is published verbatim.
          etiqueta: cargo.registro_apoyos?.motivo ?? null,
        }),
      ),
      pagos: pagosRaw.map(
        (pago): PagoDesgloseRow => ({
          miembro: pago.miembros,
          monto_pagado: pago.monto_pagado,
          fecha_pago: pago.fecha_pago,
        }),
      ),
      ajustes: ajustesRaw.map(
        (ajuste): AjusteDesgloseRow => ({
          miembro: roster.get(ajuste.miembro_id) ?? null,
          cargo_id: ajuste.cargo_id,
          monto: ajuste.monto,
          tipo: ajuste.tipo,
          created_at: ajuste.created_at,
        }),
      ),
    });

    // Projected field by field: the member and cargo UUIDs the aggregator keeps
    // internally are dropped here, which is cheaper to audit than a spread over
    // a type that might grow one.
    const desglose: DebtViewMiembro[] = breakdown.miembros.map((miembro) => ({
      nickname: miembro.nickname,
      pendienteCents: miembro.pendienteCents,
      abonadoCents: miembro.abonadoCents,
      sinEfectivoCents: miembro.sinEfectivoCents,
      aplicadoCents: miembro.aplicadoCents,
      noAplicadoCents: miembro.noAplicadoCents,
      adeudos: miembro.adeudos.map(
        (adeudo): DebtViewAdeudo => ({
          motivo: adeudo.etiqueta,
          fecha: adeudo.fecha,
          originalCents: adeudo.originalCents,
          cubiertoCents: adeudo.cubiertoCents,
          pendienteCents: adeudo.pendienteCents,
        }),
      ),
      abonos: miembro.abonos.map((abono) => ({ fecha: abono.fecha, montoCents: abono.montoCents })),
    }));

    const deudores = breakdown.miembros
      .filter((miembro) => miembro.pendienteCents > 0)
      .map((miembro) => ({ nickname: miembro.nickname, pendienteCents: miembro.pendienteCents }));

    // Caja aggregate — degrade gracefully: a caja fetch failure must NOT break
    // the public debt view (spec caja: Negative Caja Is Allowed / aggregate only).
    let cajaCents = 0;
    try {
      const [aperturaRes, apoyosRes, egresosRes] = await Promise.all([
        db.from('configuracion_caja').select('monto_apertura').eq('id', 1).maybeSingle(),
        db.from('registro_apoyos').select('monto_total'),
        db.from('registro_egresos').select('monto'),
      ]);
      const cajaError = aperturaRes.error ?? apoyosRes.error ?? egresosRes.error;
      if (cajaError) {
        console.error('debt-view: caja query failed', cajaError);
      } else {
        cajaCents = computeCaja({
          openingCents: toCents(aperturaRes.data?.monto_apertura ?? 0),
          // Each recorded payment counts once; the same rows feed the breakdown.
          pagosCents: pagosRaw.map((pago) => toCents(pago.monto_pagado)),
          apoyosCents: (apoyosRes.data ?? []).map((row) => toCents(row.monto_total)),
          egresosCents: (egresosRes.data ?? []).map((row) => toCents(row.monto)),
        }).cajaCents;
      }
    } catch (err) {
      console.error('debt-view: caja aggregation failed', err);
    }

    const responseBody: DebtViewResponse = {
      generatedAt: new Date().toISOString(),
      totalPendienteCents: breakdown.totalPendienteCents,
      deudores,
      banco: bancoResult.data ?? null,
      cajaCents,
      totalAbonadoCents: breakdown.totalAbonadoCents,
      desglose,
      porMotivo: breakdown.porEtiqueta.map((item) => ({
        motivo: item.etiqueta,
        pendienteCents: item.pendienteCents,
      })),
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
