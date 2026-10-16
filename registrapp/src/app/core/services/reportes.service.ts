import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { FilaDetalleAsistencia } from '../utils/metricas-asistencia';

export interface FiltrosReporte {
  grupoId: string | null;
  usuarioId: string | null;
  desde: string;
  hasta: string;
}

const TAMANO_PAGINA = 1000;

@Injectable({
  providedIn: 'root'
})
export class ReportesService {
  private readonly supabase = inject(SupabaseService).client;

  private consultaFiltrada(filtros: FiltrosReporte) {
    let q = this.supabase
      .from('v_asistencia_detalle')
      .select('*', { count: 'exact' })
      .gte('fecha', filtros.desde)
      .lte('fecha', filtros.hasta);

    if (filtros.grupoId) q = q.eq('grupo_id', filtros.grupoId);
    if (filtros.usuarioId) q = q.eq('usuario_id', filtros.usuarioId);
    return q;
  }

  /**
   * Trae TODAS las filas que cumplen los filtros, paginando en bloques de 1000
   * (límite por defecto de PostgREST). Se usa para exportar y para calcular los
   * resúmenes por grupo/persona del período completo (no solo la página visible).
   */
  async obtenerTodo(filtros: FiltrosReporte, alAvanzar?: (traidas: number, total: number) => void): Promise<FilaDetalleAsistencia[]> {
    const todas: FilaDetalleAsistencia[] = [];
    let desde = 0;
    let total = Infinity;

    while (desde < total) {
      const { data, error, count } = await this.consultaFiltrada(filtros)
        .order('fecha', { ascending: true })
        .range(desde, desde + TAMANO_PAGINA - 1);

      if (error) throw new Error('No se pudieron cargar los datos: ' + error.message);

      const lote = (data as FilaDetalleAsistencia[]) ?? [];
      todas.push(...lote);
      total = count ?? todas.length;
      desde += TAMANO_PAGINA;

      alAvanzar?.(todas.length, total);

      if (lote.length === 0) break;
    }

    return todas;
  }
}
