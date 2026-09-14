export interface Miembro {
  id: string;
  nickname: string;
  status: 'fullparch' | 'prospecto';
  created_at: string;
  /** Retirement flag (design.md Member lifecycle DDL; spec member-lifecycle). `false` excludes the member from apoyo candidates, the pago selector, and the public debt view, without deleting their history. */
  activo: boolean;
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

/** `cargos` joined with its parent `registro_apoyos`, for the pagos debt breakdown view. */
export interface CargoConApoyo extends Pick<Cargo, 'id' | 'monto_pendiente'> {
  registro_apoyos: Pick<RegistroApoyo, 'motivo' | 'fecha'>;
}

/** `cargos` joined with its `miembros` nickname, for the dashboard debtor ranking. */
export interface CargoConMiembro extends Pick<Cargo, 'miembro_id' | 'monto_pendiente'> {
  miembros: Pick<Miembro, 'nickname'> | null;
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
}
