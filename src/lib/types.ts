export interface Miembro {
  id: string;
  nickname: string;
  status: 'fullparch' | 'prospecto';
  created_at: string;
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
