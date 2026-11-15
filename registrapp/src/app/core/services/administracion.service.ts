import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Rol } from '../models/models';
import { errorDeFuncion } from '../errores/catalogo-errores';

interface RespuestaFuncion<T> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

@Injectable({
  providedIn: 'root'
})
export class AdministracionService {
  private readonly supabase = inject(SupabaseService).client;

  async crearInstitucion(datos: {
    nombre: string;
    tipo: 'educativa' | 'corporativa';
    nombre_completo: string;
  }): Promise<{ institucion_id: string }> {
    const { data, error } = await this.supabase.functions.invoke<RespuestaFuncion<{ institucion_id: string }>>(
      'crear-institucion',
      { body: datos }
    );

    if (error || !data?.ok || !data.data) {
      throw await errorDeFuncion(error, data, 'ERROR_INTERNO');
    }

    return data.data;
  }

  async crearUsuario(datos: {
    email: string;
    nombre_completo: string;
    rol: Extract<Rol, 'responsable' | 'miembro'>;
    grupo_id?: string | null;
    password?: string;
  }): Promise<{ usuario_id: string; password_temporal: string }> {
    const { data, error } = await this.supabase.functions.invoke<
      RespuestaFuncion<{ usuario_id: string; password_temporal: string }>
    >('crear-usuario', { body: datos });

    if (error || !data?.ok || !data.data) {
      throw await errorDeFuncion(error, data, 'ERROR_INTERNO');
    }

    return data.data;
  }

  async editarUsuario(usuarioId: string, cambios: { nombre_completo?: string; grupo_id?: string | null }): Promise<void> {
    await this.invocarActualizarUsuario({ accion: 'editar', usuario_id: usuarioId, ...cambios });
  }

  async desactivarUsuario(usuarioId: string): Promise<void> {
    await this.invocarActualizarUsuario({ accion: 'desactivar', usuario_id: usuarioId });
  }

  async reactivarUsuario(usuarioId: string): Promise<void> {
    await this.invocarActualizarUsuario({ accion: 'reactivar', usuario_id: usuarioId });
  }

  async resetearPassword(usuarioId: string): Promise<{ password_temporal: string }> {
    const data = await this.invocarActualizarUsuario<{ password_temporal: string }>({
      accion: 'resetear_password',
      usuario_id: usuarioId
    });
    return data!;
  }

  private async invocarActualizarUsuario<T = undefined>(body: Record<string, unknown>): Promise<T | undefined> {
    const { data, error } = await this.supabase.functions.invoke<RespuestaFuncion<T>>('actualizar-usuario', { body });

    if (error || !data?.ok) {
      throw await errorDeFuncion(error, data, 'ERROR_INTERNO');
    }

    return data.data;
  }
}
