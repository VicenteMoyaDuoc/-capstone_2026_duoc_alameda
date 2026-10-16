import { Component, inject, signal } from '@angular/core';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { calcularMetricas, type FilaDetalleAsistencia } from '../../../core/utils/metricas-asistencia';

interface FilaGrupo {
  id: string;
  nombre: string;
  responsable: string;
  miembros: number;
  porcentajeAsistencia: number | null;
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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [SkeletonModule, TableModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  readonly totalGrupos = signal(0);
  readonly totalMiembros = signal(0);
  readonly totalResponsables = signal(0);
  readonly sesionesHoy = signal(0);
  readonly porcentajeAsistencia30d = signal<number | null>(null);

  readonly filasGrupos = signal<FilaGrupo[]>([]);

  constructor() {
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
      this.supabase.from('v_asistencia_detalle').select('estado').eq('institucion_id', institucionId).gte('fecha', hace30DiasFecha)
    ]);

    if (grupos.error) {
      this.error.set('No se pudo cargar el dashboard: ' + grupos.error.message);
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

    const metricas30d = calcularMetricas((detalle30d.data as Pick<FilaDetalleAsistencia, 'estado'>[] | null) ?? []);
    this.porcentajeAsistencia30d.set(metricas30d.porcentajeAsistencia);

    const filas = (grupos.data as unknown as GrupoConResponsableNombre[]) ?? [];
    this.filasGrupos.set(
      filas.map((g) => ({
        id: g.id,
        nombre: g.nombre,
        responsable: g.responsable?.nombre_completo ?? 'Sin asignar',
        miembros: conteoMiembrosPorGrupo[g.id] ?? 0,
        porcentajeAsistencia: porcentajePorGrupo[g.id] ?? null
      }))
    );

    this.cargando.set(false);
  }
}
