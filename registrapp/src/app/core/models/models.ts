export type Rol = 'administrador' | 'responsable' | 'miembro';

export interface Institucion {
  id: string;
  nombre: string;
  tipo: 'educativa' | 'corporativa';
  tolerancia_min: number;
  duracion_sesion_min: number;
  qr_ttl_seg: number;
  created_at: string;
}

export interface Grupo {
  id: string;
  institucion_id: string;
  nombre: string;
  responsable_id: string | null;
  activo: boolean;
  created_at: string;
}

/** Fase 4 (ampliación) — una materia dentro de un curso, con su propio profesor. Solo aplica a instituciones educativas. */
export interface Asignatura {
  id: string;
  institucion_id: string;
  grupo_id: string;
  nombre: string;
  responsable_id: string | null;
  activo: boolean;
  created_at: string;
}

export interface Usuario {
  id: string;
  institucion_id: string;
  grupo_id: string | null;
  nombre_completo: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debe_cambiar_password: boolean;
  created_at: string;
}
