export interface Miembro {
  id: string;
  nickname: string;
  status: 'fullparch' | 'prospecto' | 'interno';
  created_at: string;
  /** Retirement flag (design.md Member lifecycle DDL; spec member-lifecycle). `false` excludes the member from apoyo candidates, the pago selector, and the public debt view, without deleting their history. */
  activo: boolean;
  /**
   * Non-secret issuance timestamp for the member's access token, or `null`
   * when none has ever been generated (design.md D9/D15). Drives the admin
   * table's "Generado el ..." label without ever selecting `token_hash`
   * into the browser.
   */
  token_generado_en: string | null;
}

export interface Cargo {
  id: string;
  apoyo_id: string;
  miembro_id: string;
  monto_original: number;
  monto_pendiente: number;
  estado: 'pendiente' | 'pagado';
  created_at: string;
}

export interface RegistroApoyo {
  id: string;
  capturado_por: string;
  nombre_capturador: string;
  fecha: string;
  motivo: string;
  monto_total: number;
  tipo_division: 'INDIVIDUAL' | 'FULLPARCH' | 'TODOS';
  created_at: string;
}

export interface RegistroPago {
  id: string;
  miembro_id: string;
  monto_pagado: number;
  fecha_pago: string;
  observaciones: string | null;
  registrado_por: string;
  created_at: string;
}

/**
 * Row of `public.registro_egresos` (design.md caja). `capturado_por` is
 * `string | null` because the FK is `references auth.users(id) on delete set
 * null`; `nombre_capturador` is deliberately non-null — it is the only
 * surviving attribution when the capturing account is deleted.
 */
export interface RegistroEgreso {
  id: string;
  monto: number;
  fecha: string;
  motivo: string;
  capturado_por: string | null;
  nombre_capturador: string;
  /** `miembros.id` the disbursement is attributed to, or `null` when the expense has no beneficiary. */
  beneficiario_id: string | null;
  /** `miembros.nickname` snapshot at capture, or `null` — survives member deletion (mirrors `nombre_capturador`). */
  nombre_beneficiario: string | null;
  created_at: string;
}

/** `cargos` joined with its parent `registro_apoyos`, for the pagos debt breakdown view. */
export interface CargoConApoyo extends Pick<Cargo, 'id' | 'monto_pendiente'> {
  registro_apoyos: Pick<RegistroApoyo, 'motivo' | 'fecha'>;
}

/** `cargos` joined with its `miembros` nickname, for the dashboard debtor ranking. */
export interface CargoConMiembro extends Pick<Cargo, 'miembro_id' | 'monto_pendiente'> {
  miembros: Pick<Miembro, 'nickname' | 'status'> | null;
}

/** `cargos` + its apoyo, for the ADMIN per-member history panel (design.md D14,
 *  member-payment-history). Unlike a member-facing payload this keeps `motivo`
 *  — the admin is authorized for it. `registro_apoyos` is nullable because the
 *  join may not resolve. */
export interface CargoHistorial
  extends Pick<Cargo, 'id' | 'monto_original' | 'monto_pendiente' | 'estado' | 'created_at'> {
  registro_apoyos: Pick<RegistroApoyo, 'motivo' | 'fecha'> | null;
}

/** Row of `public.app_admins` (design.md Database Design — Phase 2). */
export interface AppAdmin {
  user_id: string;
  email: string;
  rol: 'superadmin' | 'admin';
  created_at: string;
  created_by: string | null;
}

/** Result of `auth.mfa.enroll({ factorType: 'totp' })`, renamed to camelCase at the module boundary. */
export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
}

/** Mirrors `supabase-js`'s `AuthenticatorAssuranceLevels` narrowed to the two levels this app uses. */
export type AssuranceLevel = 'aal1' | 'aal2' | null;

export interface AssuranceLevelStatus {
  currentLevel: AssuranceLevel;
  nextLevel: AssuranceLevel;
}

/** Row of `public.configuracion_bancaria` (design.md Database Design — Phase 3). Singleton, always `id: 1`. */
export interface ConfiguracionBancaria {
  id: number;
  banco: string;
  clabe: string;
  titular: string;
  updated_by: string | null;
  updated_at: string;
}

/** Row of `public.configuracion_caja` (design.md caja). Singleton, always `id: 1`; holds the stored opening amount. */
export interface ConfiguracionCaja {
  id: number;
  monto_apertura: number;
  updated_by: string | null;
  updated_at: string;
}

/**
 * Response contract of the public, unauthenticated `api/debt-view` function
 * (design.md `api/debt-view.ts` interface; specs public-debt-view,
 * bank-config). Deliberately excludes member UUIDs, status, emails,
 * capturador identity, and `observaciones` — see design.md's "Deliberately
 * excluded" note.
 */
export interface DebtViewResponse {
  generatedAt: string;
  totalPendienteCents: number;
  deudores: { nickname: string; pendienteCents: number }[];
  banco: { banco: string; clabe: string; titular: string } | null;
  /** Aggregate cash-on-hand (integer cents), never per-movement detail. May be negative. */
  cajaCents: number;
}

/**
 * Response contract of the token-scoped `api/member-view` function
 * (design.md D11; specs member-private-view). Mirrors DebtViewResponse's
 * shape discipline. Deliberately excludes: the member UUID, `status`
 * (fullparch/prospecto), `activo`, `created_at`, `registro_apoyos.motivo`
 * and `registro_pagos.observaciones` (D13), operator identity
 * (`capturado_por` / `registrado_por`), row ids, the token or its hash,
 * and every other member's data. The function never uses select('*') — the
 * explicit column list is the guard.
 */
export interface MemberViewResponse {
  generatedAt: string;
  nickname: string;
  totalPendienteCents: number;
  totalPagadoCents: number;
  cargos: {
    fecha: string;
    estado: 'pendiente' | 'pagado';
    originalCents: number;
    pendienteCents: number;
  }[]; // fecha desc
  pagos: { fecha: string; montoCents: number }[]; // fecha desc
}
