import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { SolicitudesService, type Solicitud } from '../../../core/services/solicitudes.service';
import { glosaDe } from '../../../core/errores/catalogo-errores';

type Vista = 'pendientes' | 'resueltas';

@Component({
  selector: 'app-solicitudes-admin',
  standalone: true,
  imports: [FormsModule, ButtonModule, MessageModule],
  templateUrl: './solicitudes.component.html',
  styleUrl: './solicitudes.component.scss'
})
export class SolicitudesAdminComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly servicio = inject(SolicitudesService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly todas = signal<Solicitud[]>([]);
  readonly vista = signal<Vista>('pendientes');
  readonly procesandoId = signal<string | null>(null);
  readonly mensaje = signal<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  /** Lo que el administrador va escribiendo debajo de cada solicitud (respuesta o comentario), por id. */
  readonly textos = signal<Record<string, string>>({});

  private readonly nombresGrupo = signal<Map<string, string>>(new Map());
  private readonly nombresUsuario = signal<Map<string, string>>(new Map());

  readonly pendientes = computed(() => this.todas().filter((s) => s.estado === 'pendiente'));
  readonly resueltas = computed(() => this.todas().filter((s) => s.estado !== 'pendiente'));
  readonly visibles = computed(() => (this.vista() === 'pendientes' ? this.pendientes() : this.resueltas()));

  constructor() {
    this.cargar();
  }

  nombreGrupo(id: string | null): string {
    return (id && this.nombresGrupo().get(id)) || this.terminologia.grupo();
  }

  nombreUsuario(id: string): string {
    return this.nombresUsuario().get(id) ?? this.terminologia.responsable();
  }

  texto(id: string): string {
    return this.textos()[id] ?? '';
  }

  escribir(id: string, valor: string): void {
    this.textos.update((t) => ({ ...t, [id]: valor }));
  }

  etiquetaEstado(s: Solicitud): string {
    return { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', respondida: 'Respondida' }[s.estado];
  }

  fechaRelativa(iso: string): string {
    const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (dias <= 0) return 'hoy';
    if (dias === 1) return 'ayer';
    if (dias < 30) return `hace ${dias} días`;
    return new Date(iso).toLocaleDateString('es-CL');
  }

  /** Aprueba una asignatura: se crea en el curso elegido y queda a cargo del profesor que la pidió. */
  async aprobar(s: Solicitud): Promise<void> {
    await this.ejecutar(s, () => this.servicio.resolver(s.id, true, this.texto(s.id)),
      `Aprobada: la asignatura "${s.nombre}" se creó en ${this.nombreGrupo(s.grupo_id)} y quedó a cargo de ${this.nombreUsuario(s.solicitante_id)}.`);
  }

  async rechazar(s: Solicitud): Promise<void> {
    await this.ejecutar(s, () => this.servicio.resolver(s.id, false, this.texto(s.id)), `Rechazaste la solicitud "${s.nombre}".`);
  }

  async responder(s: Solicitud): Promise<void> {
    if (!this.texto(s.id).trim()) return;
    await this.ejecutar(s, () => this.servicio.responder(s.id, this.texto(s.id)), `Respondiste a ${this.nombreUsuario(s.solicitante_id)}.`);
  }

  private async ejecutar(s: Solicitud, accion: () => Promise<void>, exito: string): Promise<void> {
    this.procesandoId.set(s.id);
    this.mensaje.set(null);
    try {
      await accion();
      this.mensaje.set({ tipo: 'success', texto: exito });
      this.textos.update((t) => {
        const { [s.id]: _, ...resto } = t;
        return resto;
      });
      await this.cargar();
    } catch (error) {
      this.mensaje.set({ tipo: 'error', texto: glosaDe(error) });
    } finally {
      this.procesandoId.set(null);
    }
  }

  private async cargar(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;
    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    try {
      const [solicitudes, grupos, usuarios] = await Promise.all([
        this.servicio.listar(),
        this.supabase.from('grupos').select('id, nombre').eq('institucion_id', institucionId),
        this.supabase.from('usuarios').select('id, nombre_completo').eq('institucion_id', institucionId).eq('rol', 'responsable')
      ]);

      this.nombresGrupo.set(new Map(((grupos.data as { id: string; nombre: string }[]) ?? []).map((g) => [g.id, g.nombre])));
      this.nombresUsuario.set(new Map(((usuarios.data as { id: string; nombre_completo: string }[]) ?? []).map((u) => [u.id, u.nombre_completo])));
      this.todas.set(solicitudes);
      this.servicio.pendientes.set(solicitudes.filter((s) => s.estado === 'pendiente').length);
    } catch (error) {
      this.mensaje.set({ tipo: 'error', texto: glosaDe(error) });
    } finally {
      this.cargando.set(false);
    }
  }
}
