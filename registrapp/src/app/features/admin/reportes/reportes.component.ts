import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { ReportesService, type FiltrosReporte } from '../../../core/services/reportes.service';
import { ExportacionService, type MetaReporte } from '../../../core/services/exportacion.service';
import {
  agruparPorGrupo,
  agruparPorPersona,
  nivelAsistencia,
  type FilaDetalleAsistencia,
  type FilaResumenGrupo,
  type FilaResumenPersona
} from '../../../core/utils/metricas-asistencia';

interface OpcionGrupo {
  id: string;
  nombre: string;
}

interface OpcionPersona {
  id: string;
  nombre_completo: string;
}

function formatearIso(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function hoyEnSantiago(): Date {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });
  const partes = Object.fromEntries(dtf.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return new Date(+partes['year'], +partes['month'] - 1, +partes['day']);
}

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SelectModule,
    DatePickerModule,
    TableModule,
    TabsModule,
    ButtonModule,
    MessageModule,
    ProgressBarModule
  ],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.scss'
})
export class ReportesComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly reportesService = inject(ReportesService);
  private readonly exportacionService = inject(ExportacionService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargandoFiltros = signal(true);
  readonly institucionNombre = signal('');
  readonly grupos = signal<OpcionGrupo[]>([]);
  readonly personas = signal<OpcionPersona[]>([]);

  readonly grupoId = signal<string | null>(null);
  readonly usuarioId = signal<string | null>(null);
  readonly rango = signal<Date[]>(this.rangoPorDefecto());

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exportando = signal<'excel' | 'pdf' | null>(null);
  readonly progresoExportacion = signal(0);

  private datos = signal<FilaDetalleAsistencia[]>([]);
  readonly huboConsulta = signal(false);

  readonly opcionesGrupo = computed<OpcionGrupo[]>(() => [{ id: null as unknown as string, nombre: 'Todos' }, ...this.grupos()]);
  readonly opcionesPersona = computed<OpcionPersona[]>(() => [
    { id: null as unknown as string, nombre_completo: 'Todas' },
    ...this.personas()
  ]);

  readonly resumenGrupo = computed<FilaResumenGrupo[]>(() => agruparPorGrupo(this.datos()));
  readonly resumenPersona = computed<FilaResumenPersona[]>(() => agruparPorPersona(this.datos()));
  readonly detalle = computed(() => this.datos());

  readonly nivelAsistencia = nivelAsistencia;

  constructor() {
    this.cargarGrupos();
  }

  async onGrupoCambiado(): Promise<void> {
    this.usuarioId.set(null);
    await this.cargarPersonas();
    await this.consultar();
  }

  onPersonaCambiada(): void {
    this.consultar();
  }

  onRangoCambiado(rango: Date[]): void {
    this.rango.set(rango);
    if (rango[0] && rango[1]) {
      this.consultar();
    }
  }

  async exportar(formato: 'excel' | 'pdf'): Promise<void> {
    if (this.exportando()) return;

    this.exportando.set(formato);
    this.progresoExportacion.set(0);

    try {
      const filtros = this.filtrosActuales();
      const filas = await this.reportesService.obtenerTodo(filtros, (traidas, total) => {
        this.progresoExportacion.set(total > 0 ? Math.round((traidas / total) * 100) : 100);
      });

      const meta = this.construirMeta();
      const resumenGrupo = agruparPorGrupo(filas);
      const resumenPersona = agruparPorPersona(filas);

      if (formato === 'excel') {
        this.exportacionService.exportarExcel(resumenGrupo, resumenPersona, filas, meta);
      } else {
        this.exportacionService.exportarPdf(resumenGrupo, resumenPersona, filas, meta);
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo exportar el reporte.');
    } finally {
      this.exportando.set(null);
    }
  }

  private rangoPorDefecto(): Date[] {
    const hoy = hoyEnSantiago();
    const hace30 = new Date(hoy);
    hace30.setDate(hace30.getDate() - 29);
    return [hace30, hoy];
  }

  private filtrosActuales(): FiltrosReporte {
    const [desde, hasta] = this.rango();
    return {
      grupoId: this.grupoId(),
      usuarioId: this.usuarioId(),
      desde: formatearIso(desde ?? hoyEnSantiago()),
      hasta: formatearIso(hasta ?? desde ?? hoyEnSantiago())
    };
  }

  private construirMeta(): MetaReporte {
    const grupoSeleccionado = this.grupos().find((g) => g.id === this.grupoId());
    const filtros = this.filtrosActuales();

    return {
      institucionNombre: this.institucionNombre(),
      grupoNombre: grupoSeleccionado?.nombre ?? 'Todos los grupos',
      desde: filtros.desde,
      hasta: filtros.hasta,
      generadoPor: this.auth.currentUser()?.nombre_completo ?? '—',
      generadoEn: new Date()
    };
  }

  private async consultar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);

    try {
      const filas = await this.reportesService.obtenerTodo(this.filtrosActuales());
      this.datos.set(filas);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo cargar el reporte.');
      this.datos.set([]);
    } finally {
      this.huboConsulta.set(true);
      this.cargando.set(false);
    }
  }

  private async cargarGrupos(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;
    if (!institucionId) {
      this.cargandoFiltros.set(false);
      return;
    }

    const [{ data: grupos }, { data: institucion }] = await Promise.all([
      this.supabase.from('grupos').select('id, nombre').eq('institucion_id', institucionId).order('nombre'),
      this.supabase.from('instituciones').select('nombre').eq('id', institucionId).single()
    ]);

    this.grupos.set((grupos as OpcionGrupo[]) ?? []);
    this.institucionNombre.set((institucion?.['nombre'] as string) ?? '');

    await this.cargarPersonas();
    await this.consultar();
    this.cargandoFiltros.set(false);
  }

  private async cargarPersonas(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;
    if (!institucionId) return;

    let consulta = this.supabase.from('usuarios').select('id, nombre_completo').eq('institucion_id', institucionId).eq('rol', 'miembro');

    const grupoId = this.grupoId();
    if (grupoId) consulta = consulta.eq('grupo_id', grupoId);

    const { data } = await consulta.order('nombre_completo');
    this.personas.set((data as OpcionPersona[]) ?? []);
  }
}
