import { Injectable, NgZone, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import type { SesionAsistencia } from './asistencia.service';

export interface AsistenciaRealtimeRow {
  id: string;
  institucion_id: string;
  sesion_id: string;
  grupo_id: string;
  usuario_id: string;
  registrado_en: string;
  estado: 'puntual' | 'tardanza';
  origen: 'qr' | 'manual';
}

export type EstadoConexionRealtime = 'conectando' | 'conectado' | 'reconectando' | 'polling';

export interface ManejadoresRealtime {
  /** Se llama una vez que el canal queda SUBSCRIBED, para recién ahí cargar el listado inicial. */
  alSuscribir: () => void;
  alInsertarAsistencia: (fila: AsistenciaRealtimeRow) => void;
  alActualizarSesion: (fila: SesionAsistencia) => void;
  /** Recarga completa: al reconectar, al volver la pestaña a primer plano, o en cada tick del polling de respaldo. */
  alRecargarCompleto: () => void;
}

const LIMITE_INTENTOS_RECONEXION = 5;
const ESPERA_BASE_MS = 1000;
const ESPERA_MAXIMA_MS = 15000;
const INTERVALO_POLLING_MS = 10000;

/**
 * Un canal por sesión (asistencia:<sesion_id>). Corre el cliente Realtime fuera
 * de NgZone y solo reentra para actualizar signals, según lo pedido en la Fase 4.
 */
@Injectable({
  providedIn: 'root'
})
export class AsistenciaRealtimeService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly zone = inject(NgZone);

  readonly estadoConexion = signal<EstadoConexionRealtime>('conectando');

  private canal: RealtimeChannel | null = null;
  private pollingId: ReturnType<typeof setInterval> | null = null;
  private reintentoId: ReturnType<typeof setTimeout> | null = null;
  private intentos = 0;
  private sesionIdActual: string | null = null;
  private manejadoresActuales: ManejadoresRealtime | null = null;
  private readonly alCambiarVisibilidad = () => {
    if (document.visibilityState === 'visible' && this.sesionIdActual) {
      this.manejadoresActuales?.alRecargarCompleto();
    }
  };

  suscribir(sesionId: string, manejadores: ManejadoresRealtime): void {
    this.desuscribir();
    this.sesionIdActual = sesionId;
    this.manejadoresActuales = manejadores;
    this.intentos = 0;
    this.estadoConexion.set('conectando');
    this.abrirCanal(sesionId);
    document.addEventListener('visibilitychange', this.alCambiarVisibilidad);
  }

  desuscribir(): void {
    document.removeEventListener('visibilitychange', this.alCambiarVisibilidad);
    this.detenerPolling();
    if (this.reintentoId) {
      clearTimeout(this.reintentoId);
      this.reintentoId = null;
    }
    if (this.canal) {
      this.supabase.removeChannel(this.canal);
      this.canal = null;
    }
    this.sesionIdActual = null;
    this.manejadoresActuales = null;
  }

  private abrirCanal(sesionId: string): void {
    this.zone.runOutsideAngular(() => {
      const canal = this.supabase
        .channel(`asistencia:${sesionId}`)
        .on<AsistenciaRealtimeRow>(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'asistencias', filter: `sesion_id=eq.${sesionId}` },
          (payload) => this.zone.run(() => this.manejadoresActuales?.alInsertarAsistencia(payload.new))
        )
        .on<SesionAsistencia>(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sesiones_asistencia', filter: `id=eq.${sesionId}` },
          (payload) => this.zone.run(() => this.manejadoresActuales?.alActualizarSesion(payload.new))
        )
        .subscribe((status) => this.zone.run(() => this.manejarCambioEstado(status, sesionId)));

      this.canal = canal;
    });
  }

  private manejarCambioEstado(status: string, sesionId: string): void {
    if (this.sesionIdActual !== sesionId) return;

    if (status === 'SUBSCRIBED') {
      this.intentos = 0;
      this.detenerPolling();
      this.estadoConexion.set('conectado');
      this.manejadoresActuales?.alSuscribir();
      return;
    }

    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      this.reintentar(sesionId);
    }
  }

  private reintentar(sesionId: string): void {
    this.intentos++;

    if (this.intentos > LIMITE_INTENTOS_RECONEXION) {
      if (this.estadoConexion() !== 'polling') {
        this.estadoConexion.set('polling');
        this.iniciarPolling();
      }
      return;
    }

    this.estadoConexion.set('reconectando');
    const espera = Math.min(2 ** this.intentos * ESPERA_BASE_MS, ESPERA_MAXIMA_MS);

    this.reintentoId = setTimeout(() => {
      if (this.sesionIdActual !== sesionId) return;
      if (this.canal) this.supabase.removeChannel(this.canal);
      this.abrirCanal(sesionId);
    }, espera);
  }

  private iniciarPolling(): void {
    this.manejadoresActuales?.alRecargarCompleto();
    this.pollingId = setInterval(() => this.manejadoresActuales?.alRecargarCompleto(), INTERVALO_POLLING_MS);
  }

  private detenerPolling(): void {
    if (this.pollingId) {
      clearInterval(this.pollingId);
      this.pollingId = null;
    }
  }
}
