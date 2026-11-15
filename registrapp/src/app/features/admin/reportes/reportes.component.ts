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
  agruparPorAsignatura,
  agruparPorGrupo,
  agruparPorPersona,
  calcularMetricas,
  matrizPersonaAsignatura,
  nivelAsistencia,
  nombreAsignatura,
  serieDiaria,
  type FilaDetalleAsistencia,
  type FilaResumenAsignatura,
  type FilaResumenGrupo,
  type FilaResumenPersona,
  type MatrizPersonaAsignatura
} from '../../../core/utils/metricas-asistencia';
import { glosaDe } from '../../../core/errores/catalogo-errores';

export interface VistaReporte {
  id: string;
  nombre: string;
}

interface FilaTablaAsignatura {
  clave: string;
  esTotal: boolean;
  grupo: string;
  asignatura: string;
  clases: number;
  miembros: number;
  asistidas: number;
  tardanzas: number;
  porcentaje: number | null;
}

const CLAVE_VISTA = 'reportes.vista';

function leerVistaGuardada(): string {
  try {
    return localStorage.getItem(CLAVE_VISTA) ?? 'resumen';
  } catch {
    return 'resumen';
  }
}

interface OpcionGrupo {
  id: string;
  nombre: string;
}

interface OpcionAsignatura {
  id: string;
  nombre: string;
  grupo_id: string;
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
  readonly asignaturas = signal<OpcionAsignatura[]>([]);
  readonly personas = signal<OpcionPersona[]>([]);

  readonly grupoId = signal<string | null>(null);
  readonly asignaturaId = signal<string | null>(null);
  readonly usuarioId = signal<string | null>(null);
  readonly rango = signal<Date[]>(this.rangoPorDefecto());

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exportando = signal<'excel' | 'pdf' | null>(null);
  readonly progresoExportacion = signal(0);

  private datos = signal<FilaDetalleAsistencia[]>([]);
  readonly huboConsulta = signal(false);

  readonly opcionesGrupo = computed<OpcionGrupo[]>(() => [{ id: null as unknown as string, nombre: 'Todos' }, ...this.grupos()]);
  /** Las asignaturas se filtran por el curso elegido; sin curso se ven todas (con su curso entre paréntesis). */
  readonly opcionesAsignatura = computed<{ id: string; nombre: string }[]>(() => {
    const grupoId = this.grupoId();
    const nombreGrupo = new Map(this.grupos().map((g) => [g.id, g.nombre]));
    const visibles = this.asignaturas().filter((a) => !grupoId || a.grupo_id === grupoId);
    return [
      { id: null as unknown as string, nombre: 'Todas' },
      ...visibles.map((a) => ({ id: a.id, nombre: grupoId ? a.nombre : `${a.nombre} (${nombreGrupo.get(a.grupo_id) ?? ''})` }))
    ];
  });
  readonly opcionesPersona = computed<OpcionPersona[]>(() => [
    { id: null as unknown as string, nombre_completo: 'Todos' },
    ...this.personas()
  ]);

  readonly resumenGrupo = computed<FilaResumenGrupo[]>(() => agruparPorGrupo(this.datos()));
  readonly resumenPersona = computed<FilaResumenPersona[]>(() => agruparPorPersona(this.datos()));
  readonly resumenAsignatura = computed<FilaResumenAsignatura[]>(() => agruparPorAsignatura(this.datos()));
  readonly matriz = computed<MatrizPersonaAsignatura>(() => matrizPersonaAsignatura(this.datos()));
  readonly detalle = computed(() => this.datos());

  // Vista "Resumen": cifras generales, ranking de asignaturas y evolución por día.
  readonly general = computed(() => {
    const filas = this.datos();
    const metricas = calcularMetricas(filas);
    const puntuales = filas.filter((f) => f.estado === 'puntual').length;
    const ausentes = filas.filter((f) => f.estado === 'ausente').length;
    return {
      ...metricas,
      registros: filas.length,
      puntuales,
      ausentes,
      clases: new Set(filas.map((f) => f.sesion_id)).size
    };
  });
  /** Ranking de la vista Resumen: por asignatura en instituciones educativas, por departamento en empresas. */
  readonly ranking = computed(() => {
    const items = this.terminologia.esEducativa()
      ? this.resumenAsignatura().map((a) => ({ clave: a.clave, nombre: a.asignatura, detalle: a.grupo, porcentaje: a.porcentajeAsistencia }))
      : this.resumenGrupo().map((g) => ({
          clave: g.grupoId,
          nombre: g.grupo,
          detalle: `${g.miembrosTotal} ${this.terminologia.miembros().toLowerCase()}`,
          porcentaje: g.porcentajeAsistencia
        }));
    return items.filter((i) => i.porcentaje !== null).sort((x, y) => (y.porcentaje ?? 0) - (x.porcentaje ?? 0));
  });

  /** Por asignatura: cada curso con una fila de total y debajo sus asignaturas. */
  readonly filasAsignatura = computed<FilaTablaAsignatura[]>(() => {
    const filas = this.datos();
    const porAsignatura = this.resumenAsignatura();
    const salida: FilaTablaAsignatura[] = [];

    for (const g of [...this.resumenGrupo()].sort((x, y) => x.grupo.localeCompare(y.grupo))) {
      salida.push({
        clave: 't' + g.grupoId,
        esTotal: true,
        grupo: g.grupo,
        asignatura: 'Todas las asignaturas',
        clases: new Set(filas.filter((f) => f.grupo_id === g.grupoId).map((f) => f.sesion_id)).size,
        miembros: g.miembrosTotal,
        asistidas: g.asistidas,
        tardanzas: g.tardanzas,
        porcentaje: g.porcentajeAsistencia
      });
      for (const a of porAsignatura.filter((x) => x.grupoId === g.grupoId)) {
        salida.push({
          clave: a.clave,
          esTotal: false,
          grupo: g.grupo,
          asignatura: a.asignatura,
          clases: a.clases,
          miembros: a.miembrosTotal,
          asistidas: a.asistidas,
          tardanzas: a.tardanzas,
          porcentaje: a.porcentajeAsistencia
        });
      }
    }
    return salida;
  });

  readonly serie = computed(() => serieDiaria(this.datos()).slice(-20));
  readonly hayAsignaturas = computed(() => this.datos().some((f) => !!f.asignatura_id));

  // ───── Vistas elegibles: cambian según el tipo de cuenta (educativa o empresa) ─────
  readonly vistas = computed<VistaReporte[]>(() => {
    const persona = `Por ${this.terminologia.miembro().toLowerCase()}`;
    return this.terminologia.esEducativa()
      ? [
          { id: 'resumen', nombre: 'Resumen' },
          { id: 'asignatura', nombre: 'Por asignatura' },
          { id: 'persona', nombre: persona },
          { id: 'detalle', nombre: 'Detalle' }
        ]
      : [
          { id: 'resumen', nombre: 'Resumen' },
          { id: 'grupo', nombre: `Por ${this.terminologia.grupo().toLowerCase()}` },
          { id: 'persona', nombre: persona },
          { id: 'detalle', nombre: 'Detalle' }
        ];
  });
  private readonly vistaElegida = signal<string>(leerVistaGuardada());
  readonly vistaActual = computed(() => (this.vistas().some((v) => v.id === this.vistaElegida()) ? this.vistaElegida() : 'resumen'));
  readonly nombreAsignatura = nombreAsignatura;

  readonly nivelAsistencia = nivelAsistencia;

  constructor() {
    this.cargarGrupos();
  }

  elegirVista(id: string): void {
    this.vistaElegida.set(id);
    try {
      localStorage.setItem(CLAVE_VISTA, id);
    } catch {
      // sin almacenamiento local: la elección dura solo mientras la página esté abierta
    }
  }

  onAsignaturaCambiada(): void {
    this.consultar();
  }

  async onGrupoCambiado(): Promise<void> {
    this.usuarioId.set(null);
    this.asignaturaId.set(null);
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
      const resumenAsignatura = agruparPorAsignatura(filas);
      const resumenPersona = agruparPorPersona(filas);

      if (formato === 'excel') {
        this.exportacionService.exportarExcel(resumenGrupo, resumenAsignatura, resumenPersona, filas, meta);
      } else {
        this.exportacionService.exportarPdf(resumenGrupo, resumenAsignatura, resumenPersona, filas, meta);
      }
    } catch (error) {
      this.error.set(glosaDe(error));
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
      asignaturaId: this.asignaturaId(),
      usuarioId: this.usuarioId(),
      desde: formatearIso(desde ?? hoyEnSantiago()),
      hasta: formatearIso(hasta ?? desde ?? hoyEnSantiago())
    };
  }

  private construirMeta(): MetaReporte {
    const grupoSeleccionado = this.grupos().find((g) => g.id === this.grupoId());
    const asignaturaSeleccionada = this.asignaturas().find((a) => a.id === this.asignaturaId());
    const filtros = this.filtrosActuales();

    return {
      institucionNombre: this.institucionNombre(),
      grupoNombre: grupoSeleccionado?.nombre ?? 'Todos los grupos',
      asignaturaNombre: asignaturaSeleccionada?.nombre ?? 'Todas',
      conAsignaturas: this.terminologia.esEducativa(),
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
      this.error.set(glosaDe(error));
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

    const [{ data: grupos }, { data: institucion }, { data: asignaturas }] = await Promise.all([
      this.supabase.from('grupos').select('id, nombre').eq('institucion_id', institucionId).order('nombre'),
      this.supabase.from('instituciones').select('nombre').eq('id', institucionId).single(),
      this.supabase.from('asignaturas').select('id, nombre, grupo_id').eq('institucion_id', institucionId).order('nombre')
    ]);

    this.grupos.set((grupos as OpcionGrupo[]) ?? []);
    this.asignaturas.set((asignaturas as OpcionAsignatura[]) ?? []);
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
