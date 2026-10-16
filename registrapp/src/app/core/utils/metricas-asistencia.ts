// Fase 5.1 — Mismas fórmulas que las vistas SQL (v_resumen_persona/v_resumen_grupo),
// usadas acá para agregar en el cliente cuando se necesita un rango de fechas
// (las vistas son resúmenes históricos, sin parámetro de fecha).

export type EstadoAsistencia = 'puntual' | 'tardanza' | 'ausente';

export interface FilaDetalleAsistencia {
  sesion_id: string;
  institucion_id: string;
  grupo_id: string;
  grupo: string;
  inicio: string;
  fecha: string;
  usuario_id: string;
  nombre_completo: string;
  registrado_en: string | null;
  estado: EstadoAsistencia;
}

export interface ResumenMetricas {
  sesionesTotal: number;
  asistidas: number;
  tardanzas: number;
  porcentajeAsistencia: number | null;
  porcentajeTardanza: number | null;
  porcentajeAusentismo: number | null;
}

/** Redondea a 1 decimal, igual que las vistas SQL (round(..., 1)). */
function redondear1(valor: number): number {
  return Math.round(valor * 10) / 10;
}

export function calcularMetricas(filas: { estado: EstadoAsistencia }[]): ResumenMetricas {
  const total = filas.length;
  const asistidas = filas.filter((f) => f.estado !== 'ausente').length;
  const tardanzas = filas.filter((f) => f.estado === 'tardanza').length;

  if (total === 0) {
    return { sesionesTotal: 0, asistidas: 0, tardanzas: 0, porcentajeAsistencia: null, porcentajeTardanza: null, porcentajeAusentismo: null };
  }

  const porcentajeAsistencia = redondear1((100 * asistidas) / total);

  return {
    sesionesTotal: total,
    asistidas,
    tardanzas,
    porcentajeAsistencia,
    porcentajeTardanza: redondear1((100 * tardanzas) / total),
    porcentajeAusentismo: redondear1(100 - porcentajeAsistencia)
  };
}

export interface FilaResumenGrupo extends ResumenMetricas {
  grupoId: string;
  grupo: string;
  miembrosTotal: number;
}

export interface FilaResumenPersona extends ResumenMetricas {
  usuarioId: string;
  grupoId: string;
  grupo: string;
  nombreCompleto: string;
}

export function agruparPorGrupo(filas: FilaDetalleAsistencia[]): FilaResumenGrupo[] {
  const porGrupo = new Map<string, FilaDetalleAsistencia[]>();
  for (const fila of filas) {
    const lista = porGrupo.get(fila.grupo_id) ?? [];
    lista.push(fila);
    porGrupo.set(fila.grupo_id, lista);
  }

  return Array.from(porGrupo.entries()).map(([grupoId, filasGrupo]) => ({
    grupoId,
    grupo: filasGrupo[0].grupo,
    miembrosTotal: new Set(filasGrupo.map((f) => f.usuario_id)).size,
    ...calcularMetricas(filasGrupo)
  }));
}

export function agruparPorPersona(filas: FilaDetalleAsistencia[]): FilaResumenPersona[] {
  const porPersona = new Map<string, FilaDetalleAsistencia[]>();
  for (const fila of filas) {
    const lista = porPersona.get(fila.usuario_id) ?? [];
    lista.push(fila);
    porPersona.set(fila.usuario_id, lista);
  }

  return Array.from(porPersona.entries()).map(([usuarioId, filasPersona]) => ({
    usuarioId,
    grupoId: filasPersona[0].grupo_id,
    grupo: filasPersona[0].grupo,
    nombreCompleto: filasPersona[0].nombre_completo,
    ...calcularMetricas(filasPersona)
  }));
}

// Umbrales configurables (spec 5.2): ≥90% verde, 75-89% ámbar, <75% rojo.
const UMBRAL_VERDE = 90;
const UMBRAL_AMBAR = 75;

export type NivelAsistencia = 'bueno' | 'regular' | 'bajo';

export function nivelAsistencia(porcentaje: number | null): NivelAsistencia | null {
  if (porcentaje === null) return null;
  if (porcentaje >= UMBRAL_VERDE) return 'bueno';
  if (porcentaje >= UMBRAL_AMBAR) return 'regular';
  return 'bajo';
}
