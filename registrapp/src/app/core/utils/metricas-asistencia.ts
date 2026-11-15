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
  /** Asignatura de la sesión; null = sesión de grupo completo. Opcionales: las vistas antiguas no las traen. */
  asignatura_id?: string | null;
  asignatura?: string | null;
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

export const SIN_ASIGNATURA = 'Sin asignatura';

export function nombreAsignatura(fila: Pick<FilaDetalleAsistencia, 'asignatura'>): string {
  return fila.asignatura ?? SIN_ASIGNATURA;
}

export interface FilaResumenAsignatura extends ResumenMetricas {
  clave: string;
  asignaturaId: string | null;
  asignatura: string;
  grupoId: string;
  grupo: string;
  miembrosTotal: number;
  /** sesiones distintas (no filas): una sesión de 30 alumnos cuenta 1 */
  clases: number;
}

/** Una fila por (grupo, asignatura). */
export function agruparPorAsignatura(filas: FilaDetalleAsistencia[]): FilaResumenAsignatura[] {
  const mapa = new Map<string, FilaDetalleAsistencia[]>();
  for (const fila of filas) {
    const clave = `${fila.grupo_id}|${fila.asignatura_id ?? 'sin'}`;
    const lista = mapa.get(clave) ?? [];
    lista.push(fila);
    mapa.set(clave, lista);
  }

  return Array.from(mapa.entries())
    .map(([clave, lista]) => ({
      clave,
      asignaturaId: lista[0].asignatura_id ?? null,
      asignatura: nombreAsignatura(lista[0]),
      grupoId: lista[0].grupo_id,
      grupo: lista[0].grupo,
      miembrosTotal: new Set(lista.map((f) => f.usuario_id)).size,
      clases: new Set(lista.map((f) => f.sesion_id)).size,
      ...calcularMetricas(lista)
    }))
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.asignatura.localeCompare(b.asignatura));
}

export interface ColumnaMatriz {
  clave: string;
  nombre: string;
}

export interface FilaMatriz {
  usuarioId: string;
  nombreCompleto: string;
  grupo: string;
  celdas: Record<string, number | null>;
  total: number | null;
}

export interface MatrizPersonaAsignatura {
  columnas: ColumnaMatriz[];
  filas: FilaMatriz[];
}

/** Cada alumno (fila) contra cada asignatura (columna), con su % de asistencia en esa asignatura. */
export function matrizPersonaAsignatura(filas: FilaDetalleAsistencia[]): MatrizPersonaAsignatura {
  const nombres = new Set<string>();
  const porPersona = new Map<string, FilaDetalleAsistencia[]>();

  for (const fila of filas) {
    nombres.add(nombreAsignatura(fila));
    const lista = porPersona.get(fila.usuario_id) ?? [];
    lista.push(fila);
    porPersona.set(fila.usuario_id, lista);
  }

  const columnas = [...nombres].sort((a, b) => a.localeCompare(b)).map((nombre) => ({ clave: nombre, nombre }));

  const filasMatriz = [...porPersona.values()]
    .map((lista) => {
      const celdas: Record<string, number | null> = {};
      for (const columna of columnas) {
        const delAsignatura = lista.filter((f) => nombreAsignatura(f) === columna.clave);
        celdas[columna.clave] = delAsignatura.length ? calcularMetricas(delAsignatura).porcentajeAsistencia : null;
      }
      return {
        usuarioId: lista[0].usuario_id,
        nombreCompleto: lista[0].nombre_completo,
        grupo: lista[0].grupo,
        celdas,
        total: calcularMetricas(lista).porcentajeAsistencia
      };
    })
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nombreCompleto.localeCompare(b.nombreCompleto));

  return { columnas, filas: filasMatriz };
}

export interface PuntoSerie {
  fecha: string;
  etiqueta: string;
  porcentaje: number;
  total: number;
}

/** % de asistencia por fecha (solo días con clases). */
export function serieDiaria(filas: FilaDetalleAsistencia[]): PuntoSerie[] {
  const porFecha = new Map<string, FilaDetalleAsistencia[]>();
  for (const fila of filas) {
    const lista = porFecha.get(fila.fecha) ?? [];
    lista.push(fila);
    porFecha.set(fila.fecha, lista);
  }
  return [...porFecha.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, lista]) => ({
      fecha,
      etiqueta: `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`,
      porcentaje: calcularMetricas(lista).porcentajeAsistencia ?? 0,
      total: lista.length
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
