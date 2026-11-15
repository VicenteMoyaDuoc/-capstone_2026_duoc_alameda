import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { UbicacionService, UbicacionError, type ModoGeo, type UbicacionLeida } from './ubicacion.service';

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

/** Lo que devuelve el servidor sobre la ubicación (la sede solo viene en modo proximidad). */
export interface DatosGeo {
  modo: ModoGeo;
  distancia_m: number | null;
  sede?: { lat: number; lng: number; radio_m: number };
}

export interface ResultadoRegistro {
  estado: 'puntual' | 'tardanza';
  registrado_en: string;
  grupo: { id: string; nombre: string } | null;
  asignatura: { id: string; nombre: string } | null;
  sesion: { id: string };
  geo?: DatosGeo | null;
  /** Dónde estaba el alumno al registrar (solo si la clase pidió ubicación). Solo se usa para mostrar el mapa. */
  ubicacionAlumno?: UbicacionLeida;
}

interface RespuestaFuncion<T> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

export const MENSAJE_GENERICO = 'Ocurrió un error. Intenta nuevamente.';

export class AsistenciaError extends Error {
  /** Dónde estaba el alumno al intentar registrar (si se le pidió ubicación). */
  ubicacion?: UbicacionLeida;

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
  private readonly ubicacion = inject(UbicacionService);

  async iniciarSesion(grupoId: string, asignaturaId: string | null = null): Promise<RespuestaSesionActiva> {
    const base = { accion: 'iniciar', grupo_id: grupoId, asignatura_id: asignaturaId };
    return this.conUbicacion((ubicacion) => this.invocarSesion<RespuestaSesionActiva>(ubicacion ? { ...base, ubicacion } : base));
  }

  async renovarToken(sesionId: string): Promise<RespuestaToken> {
    return this.invocarSesion<RespuestaToken>({ accion: 'renovar', sesion_id: sesionId });
  }

  async cerrarSesion(sesionId: string): Promise<void> {
    await this.invocarSesion<{ servidor_ahora: number }>({ accion: 'cerrar', sesion_id: sesionId });
  }

  async registrarAsistencia(token: string): Promise<ResultadoRegistro> {
    let lectura: UbicacionLeida | undefined;
    try {
      const registro = await this.conUbicacion((ubicacion) => {
        lectura = ubicacion;
        return this.enviarRegistro(token, ubicacion);
      });
      return lectura ? { ...registro, ubicacionAlumno: lectura } : registro;
    } catch (error) {
      if (error instanceof AsistenciaError) error.ubicacion = lectura;
      throw error;
    }
  }

  /**
   * La ubicación solo se pide cuando la clase la exige: se intenta sin ella y, si el servidor responde
   * UBICACION_REQUERIDA (indicando el modo: proximidad o exacta), se lee el GPS y se repite una vez.
   * Así el navegador no pide permiso de ubicación en instituciones que no usan esta función.
   */
  private async conUbicacion<T>(operacion: (ubicacion?: UbicacionLeida) => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if (!(error instanceof AsistenciaError) || error.code !== 'UBICACION_REQUERIDA') throw error;

      const modo = (error.data as { modo?: ModoGeo } | undefined)?.modo ?? 'proximidad';
      let lectura: UbicacionLeida;
      try {
        lectura = await this.ubicacion.obtener(modo);
      } catch (errorGps) {
        throw errorGps instanceof UbicacionError ? new AsistenciaError(errorGps.code, errorGps.message) : errorGps;
      }
      return operacion(lectura);
    }
  }

  private async enviarRegistro(token: string, ubicacion?: UbicacionLeida): Promise<ResultadoRegistro> {
    const { data, error } = await this.supabase.functions.invoke<RespuestaFuncion<ResultadoRegistro>>('registrar-asistencia', {
      body: ubicacion ? { token, ubicacion } : { token }
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
