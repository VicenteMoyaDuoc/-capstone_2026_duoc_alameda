import { Component, computed, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { calcularMetricas, type FilaDetalleAsistencia } from '../../../core/utils/metricas-asistencia';
import { glosaDe } from '../../../core/errores/catalogo-errores';

type NivelAsistencia = 'bien' | 'regular' | 'bajo' | 'sin-datos';

/** Umbrales de color de la asistencia: >= 85 bien, >= 70 regular, menos es bajo. */
const UMBRAL_BIEN = 85;
const UMBRAL_REGULAR = 70;

export function nivelDeAsistencia(porcentaje: number | null): NivelAsistencia {
  if (porcentaje === null) return 'sin-datos';
  if (porcentaje >= UMBRAL_BIEN) return 'bien';
  if (porcentaje >= UMBRAL_REGULAR) return 'regular';
  return 'bajo';
}

interface FilaGrupo {
  id: string;
  nombre: string;
  responsable: string;
  miembros: number;
  porcentajeAsistencia: number | null;
  nivel: NivelAsistencia;
}

interface GrupoConResponsableNombre {
  id: string;
  nombre: string;
  responsable: { nombre_completo: string } | null;
}

interface FilaResumenGrupoVista {
  grupo_id: string;
  porcentaje_asistencia: number | null;
}

interface FilaDetalle30d {
  estado: 'puntual' | 'tardanza' | 'ausente';
  fecha: string;
  grupo_id?: string;
}

export interface PuntoSemana {
  etiqueta: string;
  porcentaje: number;
  total: number;
}

export interface ComposicionGrupo {
  id: string;
  nombre: string;
  total: number;
  puntual: number;
  tardanza: number;
  ausente: number;
  pPuntual: number;
  pTardanza: number;
  pAusente: number;
  pAsistencia: number;
}

export interface PuntoLinea extends PuntoDiario {
  x: number; // 0-100, posición horizontal en el lienzo
  y: number; // 0-100, desde arriba
}

export interface PuntoDiario {
  fecha: string;
  etiqueta: string;
  porcentaje: number;
  asistidas: number;
  total: number;
}

export interface SegmentoDona {
  clave: 'puntual' | 'tardanza' | 'ausente';
  etiqueta: string;
  cantidad: number;
  porcentaje: number;
  dash: string;
  offset: number;
}

const ETIQUETAS_ESTADO: Record<SegmentoDona['clave'], string> = {
  puntual: 'Puntual',
  tardanza: 'Tardanza',
  ausente: 'Ausente'
};

/** Cuántos días con clases se muestran en el gráfico de barras. */
const DIAS_EN_GRAFICO = 14;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  readonly terminologia = inject(TerminologiaService);

  readonly meta = UMBRAL_BIEN;
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  readonly totalGrupos = signal(0);
  readonly totalMiembros = signal(0);
  readonly totalResponsables = signal(0);
  readonly sesionesHoy = signal(0);
  readonly porcentajeAsistencia30d = signal<number | null>(null);

  readonly filasGrupos = signal<FilaGrupo[]>([]);
  readonly serieDiaria = signal<PuntoDiario[]>([]);
  readonly conteoEstados = signal({ puntual: 0, tardanza: 0, ausente: 0 });
  readonly serieSemana = signal<PuntoSemana[]>([]);
  readonly composicionGrupos = signal<ComposicionGrupo[]>([]);

  /** Puntos de la línea de tendencia, alineados con las etiquetas del eje X. */
  readonly puntosLinea = computed<PuntoLinea[]>(() => {
    const serie = this.serieDiaria();
    return serie.map((p, i) => ({ ...p, x: ((i + 0.5) / serie.length) * 100, y: 100 - p.porcentaje }));
  });
  readonly trazoLinea = computed(() => {
    const pts = this.puntosLinea();
    return pts.length ? 'M' + pts.map((p) => `${p.x} ${p.y}`).join(' L') : '';
  });
  readonly trazoArea = computed(() => {
    const pts = this.puntosLinea();
    if (!pts.length) return '';
    return `M${pts[0].x} 100 L` + pts.map((p) => `${p.x} ${p.y}`).join(' L') + ` L${pts[pts.length - 1].x} 100 Z`;
  });

  readonly nivelGeneral = computed(() => nivelDeAsistencia(this.porcentajeAsistencia30d()));
  readonly totalRegistros = computed(() => {
    const c = this.conteoEstados();
    return c.puntual + c.tardanza + c.ausente;
  });

  /** Segmentos de la dona (circunferencia = 100 unidades; 1 unidad de separación entre segmentos). */
  readonly segmentosDona = computed<SegmentoDona[]>(() => {
    const conteo = this.conteoEstados();
    const total = this.totalRegistros();
    if (total === 0) return [];

    const claves: SegmentoDona['clave'][] = ['puntual', 'tardanza', 'ausente'];
    const presentes = claves.filter((c) => conteo[c] > 0);
    const separacion = presentes.length > 1 ? 1 : 0;

    let acumulado = 0;
    return claves.map((clave) => {
      const porcentaje = (100 * conteo[clave]) / total;
      const largo = Math.max(porcentaje - (conteo[clave] > 0 ? separacion : 0), 0);
      const segmento: SegmentoDona = {
        clave,
        etiqueta: ETIQUETAS_ESTADO[clave],
        cantidad: conteo[clave],
        porcentaje: Math.round(porcentaje),
        dash: `${largo} ${100 - largo}`,
        offset: 25 - acumulado
      };
      acumulado += porcentaje;
      return segmento;
    });
  });

  constructor() {
    this.cargarDashboard();
  }

  recargar(): void {
    this.cargarDashboard();
  }

  private async cargarDashboard(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const hace30Dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const hace30DiasFecha = hace30Dias.toISOString().slice(0, 10);

    const [grupos, miembros, responsables, sesionesHoyRes, resumenGrupo, detalle30d] = await Promise.all([
      this.supabase
        .from('grupos')
        .select('id, nombre, responsable:usuarios!grupos_responsable_id_fkey(nombre_completo)')
        .eq('institucion_id', institucionId)
        .eq('activo', true)
        .order('nombre'),
      this.supabase
        .from('usuarios')
        .select('id, grupo_id', { count: 'exact' })
        .eq('institucion_id', institucionId)
        .eq('rol', 'miembro')
        .eq('activo', true),
      this.supabase
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('institucion_id', institucionId)
        .eq('rol', 'responsable')
        .eq('activo', true),
      this.supabase
        .from('sesiones_asistencia')
        .select('id', { count: 'exact', head: true })
        .eq('institucion_id', institucionId)
        .gte('inicio', inicioHoy.toISOString()),
      this.supabase.from('v_resumen_grupo').select('grupo_id, porcentaje_asistencia').eq('institucion_id', institucionId),
      this.supabase
        .from('v_asistencia_detalle')
        .select('estado, fecha, grupo_id')
        .eq('institucion_id', institucionId)
        .gte('fecha', hace30DiasFecha)
    ]);

    if (grupos.error) {
      this.error.set(glosaDe(grupos.error));
      this.cargando.set(false);
      return;
    }

    const conteoMiembrosPorGrupo: Record<string, number> = {};
    for (const fila of miembros.data ?? []) {
      const grupoId = fila['grupo_id'] as string | null;
      if (grupoId) conteoMiembrosPorGrupo[grupoId] = (conteoMiembrosPorGrupo[grupoId] ?? 0) + 1;
    }

    const porcentajePorGrupo: Record<string, number | null> = {};
    for (const fila of (resumenGrupo.data as FilaResumenGrupoVista[] | null) ?? []) {
      porcentajePorGrupo[fila.grupo_id] = fila.porcentaje_asistencia;
    }

    this.totalGrupos.set(grupos.data?.length ?? 0);
    this.totalMiembros.set(miembros.count ?? 0);
    this.totalResponsables.set(responsables.count ?? 0);
    this.sesionesHoy.set(sesionesHoyRes.count ?? 0);

    const filasDetalle = (detalle30d.data as FilaDetalle30d[] | null) ?? [];
    const metricas30d = calcularMetricas(filasDetalle as Pick<FilaDetalleAsistencia, 'estado'>[]);
    this.porcentajeAsistencia30d.set(metricas30d.porcentajeAsistencia);
    this.conteoEstados.set(this.contarEstados(filasDetalle));
    this.serieDiaria.set(this.calcularSerieDiaria(filasDetalle));
    this.serieSemana.set(this.calcularSerieSemana(filasDetalle));

    const filas = (grupos.data as unknown as GrupoConResponsableNombre[]) ?? [];
    this.filasGrupos.set(
      filas.map((g) => {
        const porcentaje = porcentajePorGrupo[g.id] ?? null;
        return {
          id: g.id,
          nombre: g.nombre,
          responsable: g.responsable?.nombre_completo ?? 'Sin asignar',
          miembros: conteoMiembrosPorGrupo[g.id] ?? 0,
          porcentajeAsistencia: porcentaje,
          nivel: nivelDeAsistencia(porcentaje)
        };
      })
    );

    this.composicionGrupos.set(this.calcularComposicion(filasDetalle, filas));

    this.cargando.set(false);
  }

  private contarEstados(filas: FilaDetalle30d[]): { puntual: number; tardanza: number; ausente: number } {
    const conteo = { puntual: 0, tardanza: 0, ausente: 0 };
    for (const fila of filas) {
      if (fila.estado in conteo) conteo[fila.estado]++;
    }
    return conteo;
  }

  /** Porcentaje de asistencia por día (solo días con clases), últimos DIAS_EN_GRAFICO. */
  private calcularSerieDiaria(filas: FilaDetalle30d[]): PuntoDiario[] {
    const porFecha = new Map<string, { asistidas: number; total: number }>();
    for (const fila of filas) {
      if (!fila.fecha) continue;
      const acumulado = porFecha.get(fila.fecha) ?? { asistidas: 0, total: 0 };
      acumulado.total++;
      if (fila.estado !== 'ausente') acumulado.asistidas++;
      porFecha.set(fila.fecha, acumulado);
    }

    return [...porFecha.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-DIAS_EN_GRAFICO)
      .map(([fecha, { asistidas, total }]) => ({
        fecha,
        etiqueta: `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`,
        porcentaje: Math.round((100 * asistidas) / total),
        asistidas,
        total
      }));
  }

  /** Porcentaje de asistencia promedio según el día de la semana (lunes a domingo, solo los que tienen clases). */
  private calcularSerieSemana(filas: FilaDetalle30d[]): PuntoSemana[] {
    const nombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const acumulado = nombres.map(() => ({ asistidas: 0, total: 0 }));

    for (const fila of filas) {
      if (!fila.fecha) continue;
      const dia = new Date(fila.fecha + 'T12:00:00').getDay(); // 0 = domingo
      const indice = (dia + 6) % 7; // 0 = lunes
      acumulado[indice].total++;
      if (fila.estado !== 'ausente') acumulado[indice].asistidas++;
    }

    return nombres
      .map((etiqueta, i) => ({
        etiqueta,
        total: acumulado[i].total,
        porcentaje: acumulado[i].total ? Math.round((100 * acumulado[i].asistidas) / acumulado[i].total) : 0
      }))
      .filter((p) => p.total > 0);
  }

  /** Puntual / tardanza / ausente por grupo (100 % apilado). */
  private calcularComposicion(filas: FilaDetalle30d[], grupos: GrupoConResponsableNombre[]): ComposicionGrupo[] {
    return grupos
      .map((g) => {
        const propias = filas.filter((f) => f.grupo_id === g.id);
        const total = propias.length;
        const cuenta = (estado: FilaDetalle30d['estado']): number => propias.filter((f) => f.estado === estado).length;
        const puntual = cuenta('puntual');
        const tardanza = cuenta('tardanza');
        const ausente = cuenta('ausente');
        const pct = (n: number): number => (total ? (100 * n) / total : 0);
        return {
          id: g.id,
          nombre: g.nombre,
          total,
          puntual,
          tardanza,
          ausente,
          pPuntual: pct(puntual),
          pTardanza: pct(tardanza),
          pAusente: pct(ausente),
          pAsistencia: Math.round(pct(puntual + tardanza))
        };
      })
      .filter((c) => c.total > 0);
  }
}
