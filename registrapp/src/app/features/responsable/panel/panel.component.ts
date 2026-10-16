import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ConfirmationService, MessageService } from 'primeng/api';
import { QRCodeModule } from 'angularx-qrcode';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { ListaAsistenciaComponent, type ModoListaAsistencia } from '../../../shared/components/lista-asistencia/lista-asistencia.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import {
  AsistenciaService,
  AsistenciaError,
  type SesionAsistencia,
  type RespuestaSesionActiva
} from '../../../core/services/asistencia.service';
import { ahoraServidor, calcularDesfaseServidor, formatearDuracion } from '../../../core/utils/reloj-servidor';

/**
 * Fase 4 (ampliación) — una opción del selector: o bien un curso completo del
 * que el responsable es directamente responsable_id (corporativa, o un curso
 * educativo sin asignaturas cargadas aún), o bien una asignatura puntual
 * dentro de un curso (educativa). `asignaturaId` es null en el primer caso.
 */
interface OpcionSesion {
  id: string;
  etiqueta: string;
  grupoId: string;
  asignaturaId: string | null;
}

interface HistorialSesion {
  id: string;
  inicio: string;
  presentes: number;
  tardanzas: number;
  ausentes: number;
}

type EstadoSesion = 'sin_sesion' | 'activa' | 'cerrada_resumen';

const SEGUNDOS_GRACIA_RENOVACION = 10;
const ESPERA_BASE_REINTENTO_MS = 2000;
const ESPERA_MAXIMA_REINTENTO_MS = 16000;
const SESIONES_HISTORIAL = 5;

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [FormsModule, SelectModule, ButtonModule, MessageModule, QRCodeModule, NavbarComponent, ListaAsistenciaComponent],
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.scss'
})
export class PanelComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly confirmacion = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  readonly terminologia = inject(TerminologiaService);

  readonly qrContenedor = viewChild<ElementRef<HTMLElement>>('qrContenedor');

  readonly cargando = signal(true);
  readonly opciones = signal<OpcionSesion[]>([]);
  readonly opcionSeleccionadaId = signal<string | null>(null);
  readonly opcionActual = computed(() => this.opciones().find((o) => o.id === this.opcionSeleccionadaId()) ?? null);

  readonly cargandoEstado = signal(false);
  readonly procesando = signal(false);
  readonly sesion = signal<SesionAsistencia | null>(null);
  readonly cerrada = signal(false);
  readonly token = signal<string | null>(null);
  readonly avisoRenovacion = signal<string | null>(null);

  readonly segundosRestantesQr = signal(0);
  readonly segundosRestantesSesion = signal(0);

  readonly historial = signal<HistorialSesion[]>([]);

  readonly estadoSesion = computed<EstadoSesion>(() => {
    if (!this.sesion()) return 'sin_sesion';
    return this.cerrada() ? 'cerrada_resumen' : 'activa';
  });

  readonly modoLista = computed<ModoListaAsistencia>(() => (this.estadoSesion() === 'activa' ? 'vivo' : 'estatico'));

  private desfaseServidor = 0;
  private tokenExpiraEnMs: number | null = null;
  private renovando = false;
  private intentosFallidosRenovar = 0;
  private proximoReintentoPermitidoEn = 0;
  private readonly intervalId: ReturnType<typeof setInterval>;

  constructor() {
    this.cargarOpciones();
    this.intervalId = setInterval(() => this.tick(), 1000);
    this.destroyRef.onDestroy(() => clearInterval(this.intervalId));
  }

  get qrUrl(): string {
    const token = this.token();
    return token ? `${location.origin}/asistir#t=${token}` : '';
  }

  onCambioOpcion(opcionId: string): void {
    this.opcionSeleccionadaId.set(opcionId);
    this.cargarEstadoSesion();
  }

  async iniciarSesion(): Promise<void> {
    const opcion = this.opcionActual();
    if (!opcion || this.procesando()) return;

    this.procesando.set(true);

    try {
      const respuesta = await this.asistenciaService.iniciarSesion(opcion.grupoId, opcion.asignaturaId);
      this.aplicarSesionActiva(respuesta);
    } catch (error) {
      if (error instanceof AsistenciaError && error.code === 'SESION_YA_ABIERTA' && error.data) {
        this.aplicarSesionActiva(error.data as RespuestaSesionActiva);
        this.toast.add({ severity: 'info', summary: 'Ya había una sesión abierta', detail: 'Se retomó la sesión existente.' });
      } else {
        const mensaje = error instanceof AsistenciaError ? error.message : 'No se pudo iniciar la sesión.';
        this.toast.add({ severity: 'error', summary: 'No se pudo iniciar', detail: mensaje });
      }
    } finally {
      this.procesando.set(false);
    }
  }

  async regenerarQr(): Promise<void> {
    if (this.procesando()) return;
    this.procesando.set(true);
    await this.renovar(false);
    this.procesando.set(false);
  }

  confirmarCerrar(): void {
    this.confirmacion.confirm({
      header: 'Cerrar sesión de asistencia',
      message: '¿Cerrar la sesión de asistencia? Ya nadie podrá registrar su asistencia después de esto.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Cerrar sesión',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.cerrarSesion()
    });
  }

  async alternarPantallaCompleta(): Promise<void> {
    const el = this.qrContenedor()?.nativeElement;
    if (!el) return;

    if (!document.fullscreenElement) {
      await el.requestFullscreen?.().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  }

  /** La lista detectó (por Realtime) que la sesión se cerró, por ejemplo desde otra pestaña. */
  onListaCerrada(): void {
    this.cerrada.set(true);
    this.token.set(null);
    this.tokenExpiraEnMs = null;
    this.cargarHistorialReciente();
  }

  textoRestanteQr(): string {
    return formatearDuracion(this.segundosRestantesQr());
  }

  textoRestanteSesion(): string {
    return formatearDuracion(this.segundosRestantesSesion());
  }

  formatearFechaHistorial(iso: string): string {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Santiago'
    });
  }

  private aplicarSesionActiva(respuesta: RespuestaSesionActiva): void {
    this.sesion.set(respuesta.sesion);
    this.cerrada.set(false);
    this.token.set(respuesta.token);
    this.desfaseServidor = calcularDesfaseServidor(respuesta.servidor_ahora);
    this.tokenExpiraEnMs = respuesta.token_expira_en;
    this.intentosFallidosRenovar = 0;
    this.proximoReintentoPermitidoEn = 0;
    this.avisoRenovacion.set(null);
  }

  private async cerrarSesion(): Promise<void> {
    const sesionActual = this.sesion();
    if (!sesionActual) return;

    this.procesando.set(true);

    try {
      await this.asistenciaService.cerrarSesion(sesionActual.id);
      this.cerrada.set(true);
      this.token.set(null);
      this.tokenExpiraEnMs = null;
      this.toast.add({ severity: 'success', summary: 'Sesión cerrada' });
      await this.cargarHistorialReciente();
    } catch (error) {
      const mensaje = error instanceof AsistenciaError ? error.message : 'No se pudo cerrar la sesión.';
      this.toast.add({ severity: 'error', summary: 'No se pudo cerrar', detail: mensaje });
    } finally {
      this.procesando.set(false);
    }
  }

  private async renovar(silencioso: boolean): Promise<void> {
    const sesionActual = this.sesion();
    if (!sesionActual || this.cerrada() || this.renovando) return;

    this.renovando = true;

    try {
      const respuesta = await this.asistenciaService.renovarToken(sesionActual.id);
      this.token.set(respuesta.token);
      this.desfaseServidor = calcularDesfaseServidor(respuesta.servidor_ahora);
      this.tokenExpiraEnMs = respuesta.token_expira_en;
      this.intentosFallidosRenovar = 0;
      this.proximoReintentoPermitidoEn = 0;
      this.avisoRenovacion.set(null);
    } catch (error) {
      const esFin = error instanceof AsistenciaError && ['SESION_CERRADA', 'no_encontrada', 'no_autorizado'].includes(error.code);

      if (esFin) {
        this.cerrada.set(true);
        this.token.set(null);
        this.tokenExpiraEnMs = null;
        if (!silencioso) {
          this.toast.add({ severity: 'info', summary: 'Sesión finalizada', detail: 'Esta sesión ya terminó.' });
        }
        await this.cargarHistorialReciente();
      } else {
        this.intentosFallidosRenovar++;
        const espera = Math.min(2 ** this.intentosFallidosRenovar * ESPERA_BASE_REINTENTO_MS, ESPERA_MAXIMA_REINTENTO_MS);
        this.proximoReintentoPermitidoEn = Date.now() + espera;
        this.avisoRenovacion.set('No se pudo renovar el código QR. Reintentando…');
      }
    } finally {
      this.renovando = false;
    }
  }

  private tick(): void {
    const sesionActual = this.sesion();
    if (!sesionActual || this.cerrada() || this.tokenExpiraEnMs === null) return;

    const ahora = ahoraServidor(this.desfaseServidor);

    const restanteQrMs = this.tokenExpiraEnMs - ahora;
    this.segundosRestantesQr.set(Math.max(0, Math.round(restanteQrMs / 1000)));

    const restanteSesionMs = new Date(sesionActual.expira_en).getTime() - ahora;
    this.segundosRestantesSesion.set(Math.max(0, Math.round(restanteSesionMs / 1000)));

    const puedeReintentar = Date.now() >= this.proximoReintentoPermitidoEn;

    if (restanteQrMs / 1000 <= SEGUNDOS_GRACIA_RENOVACION && puedeReintentar && !this.renovando) {
      this.renovar(true);
    }
  }

  private async cargarOpciones(): Promise<void> {
    const usuario = this.auth.currentUser();

    if (!usuario) {
      this.cargando.set(false);
      return;
    }

    const [gruposDirectos, asignaturas] = await Promise.all([
      this.supabase.from('grupos').select('id, nombre').eq('responsable_id', usuario.id).eq('activo', true).order('nombre'),
      this.supabase
        .from('asignaturas')
        .select('id, nombre, grupo_id, grupo:grupos(nombre)')
        .eq('responsable_id', usuario.id)
        .eq('activo', true)
        .order('nombre')
    ]);

    const opciones: OpcionSesion[] = [];

    for (const grupo of gruposDirectos.data ?? []) {
      opciones.push({ id: grupo['id'] as string, etiqueta: grupo['nombre'] as string, grupoId: grupo['id'] as string, asignaturaId: null });
    }

    for (const asignatura of asignaturas.data ?? []) {
      const nombreGrupo = (asignatura['grupo'] as unknown as { nombre: string } | null)?.nombre ?? '';
      opciones.push({
        id: `${asignatura['grupo_id']}:${asignatura['id']}`,
        etiqueta: `${nombreGrupo} — ${asignatura['nombre']}`,
        grupoId: asignatura['grupo_id'] as string,
        asignaturaId: asignatura['id'] as string
      });
    }

    opciones.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
    this.opciones.set(opciones);

    if (opciones.length === 1) {
      this.opcionSeleccionadaId.set(opciones[0].id);
      await this.cargarEstadoSesion();
    }

    this.cargando.set(false);
  }

  private async cargarEstadoSesion(): Promise<void> {
    const opcion = this.opcionActual();
    if (!opcion) return;

    this.cargandoEstado.set(true);
    this.sesion.set(null);
    this.cerrada.set(false);
    this.token.set(null);
    this.tokenExpiraEnMs = null;
    this.avisoRenovacion.set(null);

    let consultaAbierta = this.supabase.from('sesiones_asistencia').select('*').is('cerrada_en', null);
    consultaAbierta = opcion.asignaturaId
      ? consultaAbierta.eq('asignatura_id', opcion.asignaturaId)
      : consultaAbierta.eq('grupo_id', opcion.grupoId).is('asignatura_id', null);

    const { data: sesionAbierta } = await consultaAbierta.maybeSingle();

    if (sesionAbierta) {
      this.sesion.set(sesionAbierta as SesionAsistencia);
      await this.renovar(true);
    }

    await this.cargarHistorialReciente();
    this.cargandoEstado.set(false);
  }

  private async cargarHistorialReciente(): Promise<void> {
    const opcion = this.opcionActual();
    if (!opcion) {
      this.historial.set([]);
      return;
    }

    let consultaHistorial = this.supabase
      .from('sesiones_asistencia')
      .select('id, inicio')
      .not('cerrada_en', 'is', null)
      .order('inicio', { ascending: false })
      .limit(SESIONES_HISTORIAL);
    consultaHistorial = opcion.asignaturaId
      ? consultaHistorial.eq('asignatura_id', opcion.asignaturaId)
      : consultaHistorial.eq('grupo_id', opcion.grupoId).is('asignatura_id', null);

    const { data: sesiones } = await consultaHistorial;

    const sesionesData = sesiones ?? [];
    if (sesionesData.length === 0) {
      this.historial.set([]);
      return;
    }

    const ids = sesionesData.map((s) => s['id'] as string);

    const [{ data: asistencias }, { count: totalMiembros }] = await Promise.all([
      this.supabase.from('asistencias').select('sesion_id, estado').in('sesion_id', ids),
      this.supabase
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('grupo_id', opcion.grupoId)
        .eq('rol', 'miembro')
        .eq('activo', true)
    ]);

    const total = totalMiembros ?? 0;

    const resumen: HistorialSesion[] = sesionesData.map((s) => {
      const deEstaSesion = (asistencias ?? []).filter((a) => a['sesion_id'] === s['id']);
      const puntual = deEstaSesion.filter((a) => a['estado'] === 'puntual').length;
      const tardanza = deEstaSesion.filter((a) => a['estado'] === 'tardanza').length;
      return {
        id: s['id'] as string,
        inicio: s['inicio'] as string,
        presentes: puntual + tardanza,
        tardanzas: tardanza,
        ausentes: Math.max(0, total - (puntual + tardanza))
      };
    });

    this.historial.set(resumen);
  }
}
