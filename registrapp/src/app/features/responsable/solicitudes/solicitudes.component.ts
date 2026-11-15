import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { MarcoMovilComponent } from '../../../shared/components/marco-movil/marco-movil.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { SolicitudesService, type Solicitud, type TipoSolicitud } from '../../../core/services/solicitudes.service';
import { glosaDe } from '../../../core/errores/catalogo-errores';
import { pestanasResponsable } from '../pestanas';

interface OpcionGrupo {
  id: string;
  nombre: string;
}

@Component({
  selector: 'app-solicitudes-responsable',
  standalone: true,
  imports: [FormsModule, SelectModule, InputTextModule, ButtonModule, MessageModule, MarcoMovilComponent],
  templateUrl: './solicitudes.component.html',
  styleUrl: './solicitudes.component.scss'
})
export class SolicitudesResponsableComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly servicio = inject(SolicitudesService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly enviando = signal(false);
  /** Cursos donde el profesor es responsable o enseña alguna asignatura (la seguridad de la base de datos filtra). */
  readonly grupos = signal<OpcionGrupo[]>([]);
  readonly lista = signal<Solicitud[]>([]);

  readonly tipo = signal<TipoSolicitud>('asignatura');
  readonly grupoId = signal<string | null>(null);
  readonly nombre = signal('');
  readonly detalle = signal('');
  readonly mensaje = signal<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  readonly pestanas = computed(() => pestanasResponsable());

  /** Las empresas no tienen asignaturas: solo pueden enviar mensajes. */
  readonly tiposDisponibles = computed<{ id: TipoSolicitud; nombre: string }[]>(() =>
    this.terminologia.esEducativa()
      ? [
          { id: 'asignatura', nombre: 'Nueva asignatura' },
          { id: 'consulta', nombre: 'Mensaje al administrador' }
        ]
      : [{ id: 'consulta', nombre: 'Mensaje al administrador' }]
  );
  readonly tipoActual = computed<TipoSolicitud>(() => (this.terminologia.esEducativa() ? this.tipo() : 'consulta'));

  readonly pendientes = computed(() => this.lista().filter((s) => s.estado === 'pendiente').length);
  readonly puedeEnviar = computed(() => {
    if (this.enviando() || !this.grupoId()) return false;
    const nombreOk = this.nombre().trim().length >= 2;
    return this.tipoActual() === 'asignatura' ? nombreOk : nombreOk && this.detalle().trim().length >= 3;
  });

  constructor() {
    this.cargar();
  }

  get primerNombre(): string {
    return this.auth.currentUser()?.nombre_completo.split(' ')[0] ?? '';
  }

  nombreGrupo(id: string | null): string {
    return this.grupos().find((g) => g.id === id)?.nombre ?? this.terminologia.grupo();
  }

  fecha(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');
  }

  etiquetaEstado(s: Solicitud): string {
    return { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', respondida: 'Respondida' }[s.estado];
  }

  elegirTipo(tipo: TipoSolicitud): void {
    this.tipo.set(tipo);
    this.mensaje.set(null);
  }

  async enviar(): Promise<void> {
    const grupoId = this.grupoId();
    if (!grupoId || !this.puedeEnviar()) return;

    const esAsignatura = this.tipoActual() === 'asignatura';
    this.enviando.set(true);
    this.mensaje.set(null);
    try {
      if (esAsignatura) await this.servicio.crearSolicitudAsignatura(grupoId, this.nombre());
      else await this.servicio.crearConsulta(grupoId, this.nombre(), this.detalle());

      this.nombre.set('');
      this.detalle.set('');
      this.mensaje.set({
        tipo: 'success',
        texto: esAsignatura ? 'Solicitud enviada. El administrador la revisará.' : 'Mensaje enviado. El administrador te responderá aquí mismo.'
      });
      this.lista.set(await this.servicio.listar());
    } catch (error) {
      this.mensaje.set({ tipo: 'error', texto: glosaDe(error) });
    } finally {
      this.enviando.set(false);
    }
  }

  async cancelar(solicitud: Solicitud): Promise<void> {
    this.mensaje.set(null);
    try {
      await this.servicio.cancelar(solicitud.id);
      this.lista.set(await this.servicio.listar());
    } catch (error) {
      this.mensaje.set({ tipo: 'error', texto: glosaDe(error) });
    }
  }

  private async cargar(): Promise<void> {
    try {
      const { data } = await this.supabase.from('grupos').select('id, nombre').eq('activo', true).order('nombre');
      const grupos = (data as OpcionGrupo[]) ?? [];
      this.grupos.set(grupos);
      // Solo se elige solo cuando hay un único curso; con varios, el profesor siempre decide.
      if (grupos.length === 1) this.grupoId.set(grupos[0].id);
      this.lista.set(await this.servicio.listar());
    } catch {
      this.mensaje.set({ tipo: 'error', texto: 'No se pudieron cargar tus solicitudes.' });
    } finally {
      this.cargando.set(false);
    }
  }
}
