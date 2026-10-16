import { WritableSignal, signal } from '@angular/core';
import type { Rol, Usuario } from '../models/models';

/** Fase 6.1 — doble de AuthService para probar guards sin Supabase ni Router reales. */
export interface AuthFake {
  currentUser: WritableSignal<Usuario | null>;
  sinPerfil: WritableSignal<boolean>;
  cargando: WritableSignal<boolean>;
  rutaSegunRol: (rol: Rol) => string;
  rutaSegunEstado: (usuario: Usuario) => string;
  marcarPasswordCambiada: () => Promise<void>;
}

function rutaSegunRol(rol: Rol): string {
  switch (rol) {
    case 'administrador':
      return '/admin';
    case 'responsable':
      return '/responsable';
    case 'miembro':
      return '/miembro';
  }
}

function rutaSegunEstado(usuario: Usuario): string {
  return usuario.debe_cambiar_password ? '/cambiar-password' : rutaSegunRol(usuario.rol);
}

export function crearAuthFake(): AuthFake {
  const currentUser = signal<Usuario | null>(null);
  return {
    currentUser,
    sinPerfil: signal(false),
    cargando: signal(false),
    rutaSegunRol,
    rutaSegunEstado,
    marcarPasswordCambiada: async () => {
      const actual = currentUser();
      if (actual) {
        currentUser.set({ ...actual, debe_cambiar_password: false });
      }
    }
  };
}

export function usuarioDePrueba(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: 'u1',
    institucion_id: 'inst1',
    grupo_id: null,
    nombre_completo: 'Usuario de Prueba',
    email: 'prueba@example.com',
    rol: 'miembro',
    activo: true,
    debe_cambiar_password: false,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}
