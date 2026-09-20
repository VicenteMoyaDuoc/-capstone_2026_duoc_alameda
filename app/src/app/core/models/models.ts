export type Rol = 'administrador' | 'responsable' | 'miembro';

export interface Institucion {
  id: string;
  nombre: string;
  tipo: 'educativa' | 'corporativa';
  created_at: string;
}

export interface Grupo {
  id: string;
  institucion_id: string;
  nombre: string;
  responsable_id: string | null;
  created_at: string;
}

export interface Usuario {
  id: string;
  institucion_id: string;
  grupo_id: string | null;
  nombre_completo: string;
  rol: Rol;
  created_at: string;
}
