import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface SesionAsistencia {
  id: string;
  institucion_id: string;
  grupo_id: string;
  asignatura_id: string | null;
  creada_por: string;
  inicio: string;
  expira_en: string;
  cerrada_en: string | null;
  tolerancia_min: number;
  qr_ttl_seg: number;
}

export interface RespuestaSesionActiva {
  sesion: SesionAsistencia;
  token: string;
  servidor_ahora: number;
  token_expira_en: number;
}

export interface RespuestaToken {
  token: string;
  servidor_ahora: number;
  token_expira_en: number;
}

export interface ResultadoRegistro {
  estado: 'puntual' | 'tardanza';
  registrado_en: string;
  grupo: { id: string; nombre: string } | null;
  asignatura: { id: string; nombre: string } | null;
  sesion: { id: string };
}

interface RespuestaFuncion<T> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

export const MENSAJE_GENERICO = 'Ocurrió un error. Intenta nuevamente.';

export class AsistenciaError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
  }
}

async function leerCuerpoError<T>(error: unknown): Promise<RespuestaFuncion<T> | null> {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      return await (error as { context: Response }).context.json();
    } catch {
      return null;
    }
  }
  return null;
}

@Injectable({
  providedIn: 'root'
})
export class AsistenciaService {
  private readonly supabase = inject(SupabaseService).client;

  async iniciarSesion(grupoId: string, asignaturaId: string | null = null): Promise<RespuestaSesionActiva> {
    return this.invocarSesion<RespuestaSesionActiva>({ accion: 'iniciar', grupo_id: grupoId, asignatura_id: asignaturaId });
  }

  async renovarToken(sesionId: string): Promise<RespuestaToken> {
    return this.invocarSesion<RespuestaToken>({ accion: 'renovar', sesion_id: sesionId });
  }

  async cerrarSesion(sesionId: string): Promise<void> {
    await this.invocarSesion<{ servidor_ahora: number }>({ accion: 'cerrar', sesion_id: sesionId });
  }

  async registrarAsistencia(token: string): Promise<ResultadoRegistro> {
    const { data, error } = await this.supabase.functions.invoke<RespuestaFuncion<ResultadoRegistro>>('registrar-asistencia', {
      body: { token }
    });

    if (error) {
      const cuerpo = await leerCuerpoError<ResultadoRegistro>(error);
      throw new AsistenciaError(cuerpo?.code ?? 'error_interno', cuerpo?.message ?? MENSAJE_GENERICO, cuerpo?.data);
    }

    if (!data?.ok || !data.data) {
      throw new AsistenciaError(data?.code ?? 'error_interno', data?.message ?? MENSAJE_GENERICO, data?.data);
    }

    return data.data;
  }

  private async invocarSesion<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.functions.invoke<RespuestaFuncion<T>>('sesion-asistencia', { body });

    if (error) {
      const cuerpo = await leerCuerpoError<T>(error);
      throw new AsistenciaError(cuerpo?.code ?? 'error_interno', cuerpo?.message ?? MENSAJE_GENERICO, cuerpo?.data);
    }

    if (!data?.ok || !data.data) {
      throw new AsistenciaError(data?.code ?? 'error_interno', data?.message ?? MENSAJE_GENERICO, data?.data);
    }

    return data.data;
  }
}
