import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ErrorApp, aErrorApp } from '../errores/catalogo-errores';

export type TipoSolicitud = 'asignatura' | 'consulta';
export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada' | 'respondida';

export interface Solicitud {
  id: string;
  institucion_id: string;
  tipo: TipoSolicitud;
  solicitante_id: string;
  /** Curso o departamento sobre el que trata: se elige siempre, porque un profesor puede dar clases en varios. */
  grupo_id: string | null;
  /** Nombre de la asignatura pedida, o asunto del mensaje. */
  nombre: string;
  /** Mensaje del profesor (solo en las consultas). */
  detalle: string | null;
  estado: EstadoSolicitud;
  /** Lo que contesta el administrador: la respuesta a una consulta, o el comentario al aprobar o rechazar. */
  respuesta: string | null;
  resuelta_en: string | null;
  created_at: string;
}

/**
 * Solicitudes de un profesor al administrador:
 *   · 'asignatura': pide crear una asignatura. El administrador la aprueba (se crea sola) o la rechaza.
 *   · 'consulta': un mensaje sobre un curso. El administrador lo responde.
 * El profesor solo crea y cancela las suyas; el administrador las resuelve con funciones de la base de datos.
 */
@Injectable({
  providedIn: 'root'
})
export class SolicitudesService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  /** Cantidad de solicitudes pendientes (para la insignia del menú del administrador). */
  readonly pendientes = signal(0);

  /** RLS limita el resultado: el administrador ve todas las de su institución; un profesor, solo las suyas. */
  async listar(): Promise<Solicitud[]> {
    const { data, error } = await this.supabase.from('solicitudes').select('*').order('created_at', { ascending: false }).limit(300);
    if (error) throw aErrorApp(error);
    return (data as Solicitud[]) ?? [];
  }

  async crearSolicitudAsignatura(grupoId: string, nombre: string): Promise<void> {
    await this.insertar({ tipo: 'asignatura', grupo_id: grupoId, nombre: nombre.trim() });
  }

  async crearConsulta(grupoId: string, asunto: string, mensaje: string): Promise<void> {
    await this.insertar({ tipo: 'consulta', grupo_id: grupoId, nombre: asunto.trim(), detalle: mensaje.trim() });
  }

  async cancelar(id: string): Promise<void> {
    const { error } = await this.supabase.from('solicitudes').delete().eq('id', id);
    if (error) throw aErrorApp(error);
  }

  /** Solo administrador. Aprueba o rechaza una asignatura; si aprueba, se crea con el solicitante como responsable. */
  async resolver(id: string, aprobar: boolean, comentario?: string): Promise<void> {
    const { error } = await this.supabase.rpc('resolver_solicitud', { p_id: id, p_aprobar: aprobar, p_motivo: comentario?.trim() || null });
    if (error) throw aErrorApp(error);
  }

  /** Solo administrador. Contesta una consulta. */
  async responder(id: string, respuesta: string): Promise<void> {
    const { error } = await this.supabase.rpc('responder_solicitud', { p_id: id, p_respuesta: respuesta.trim() });
    if (error) throw aErrorApp(error);
  }

  async actualizarPendientes(): Promise<void> {
    const { count } = await this.supabase.from('solicitudes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');
    this.pendientes.set(count ?? 0);
  }

  private async insertar(datos: { tipo: TipoSolicitud; grupo_id: string; nombre: string; detalle?: string }): Promise<void> {
    const usuario = this.auth.currentUser();
    if (!usuario) throw new ErrorApp('AUTH_SESION_EXPIRADA');

    const { error } = await this.supabase.from('solicitudes').insert({
      institucion_id: usuario.institucion_id,
      solicitante_id: usuario.id,
      ...datos
    });
    if (error) throw aErrorApp(error);
  }
}
