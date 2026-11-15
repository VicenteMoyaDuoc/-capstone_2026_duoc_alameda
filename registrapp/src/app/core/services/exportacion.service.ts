import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { nombreAsignatura, type FilaDetalleAsistencia, type FilaResumenAsignatura, type FilaResumenGrupo, type FilaResumenPersona } from '../utils/metricas-asistencia';

(pdfMake as unknown as { vfs: unknown }).vfs = pdfFonts;

export interface MetaReporte {
  institucionNombre: string;
  grupoNombre: string;
  asignaturaNombre: string;
  /** false en empresas: no hay asignaturas, así que se omite de las exportaciones */
  conAsignaturas: boolean;
  desde: string;
  hasta: string;
  generadoPor: string;
  generadoEn: Date;
}

/** Fase 5.3 — si un texto empieza con =, +, - o @, Excel podría interpretarlo como fórmula. */
function sanitizarTexto(valor: string): string {
  return /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
}

function formatearFechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}-${mes}-${anio}`;
}

function formatearHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

function formatearFechaHoraCorta(fecha: Date): string {
  return fecha.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago'
  });
}

function formatearPorcentaje(valor: number | null): string {
  return valor === null ? '—' : `${valor.toFixed(1)}%`;
}

function nombreArchivoBase(meta: MetaReporte): string {
  const grupo = meta.grupoNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'todos';
  return `asistencia_${grupo}_${meta.desde}_${meta.hasta}`;
}

const ESTADO_TEXTO: Record<string, string> = { puntual: 'Puntual', tardanza: 'Tardanza', ausente: 'Ausente' };

@Injectable({
  providedIn: 'root'
})
export class ExportacionService {
  exportarExcel(
    resumenGrupo: FilaResumenGrupo[],
    resumenAsignatura: FilaResumenAsignatura[],
    resumenPersona: FilaResumenPersona[],
    detalle: FilaDetalleAsistencia[],
    meta: MetaReporte
  ): void {
    const libro = XLSX.utils.book_new();

    // Solo en instituciones educativas: las empresas no tienen asignaturas.
    const bloqueAsignatura: (string | number)[][] = meta.conAsignaturas
      ? [
          [],
          ['Resumen por asignatura'],
          ['Grupo', 'Asignatura', 'Clases', 'Miembros', 'Asistidas', 'Tardanzas', '% Asistencia', '% Tardanza', '% Ausentismo'],
          ...resumenAsignatura.map((r) => [
            sanitizarTexto(r.grupo),
            sanitizarTexto(r.asignatura),
            r.clases,
            r.miembrosTotal,
            r.asistidas,
            r.tardanzas,
            formatearPorcentaje(r.porcentajeAsistencia),
            formatearPorcentaje(r.porcentajeTardanza),
            formatearPorcentaje(r.porcentajeAusentismo)
          ])
        ]
      : [];

    const filasResumen: (string | number)[][] = [
      ['Reporte de asistencia'],
      ['Institución', sanitizarTexto(meta.institucionNombre)],
      ['Grupo', sanitizarTexto(meta.grupoNombre)],
      ...(meta.conAsignaturas ? [['Asignatura', sanitizarTexto(meta.asignaturaNombre)]] : []),
      ['Desde', formatearFechaCorta(meta.desde)],
      ['Hasta', formatearFechaCorta(meta.hasta)],
      ['Generado por', sanitizarTexto(meta.generadoPor)],
      ['Generado el', formatearFechaHoraCorta(meta.generadoEn)],
      [],
      ['Resumen por grupo'],
      ['Grupo', 'Sesiones', 'Miembros', 'Asistidas', 'Tardanzas', '% Asistencia', '% Tardanza', '% Ausentismo'],
      ...resumenGrupo.map((r) => [
        sanitizarTexto(r.grupo),
        r.sesionesTotal,
        r.miembrosTotal,
        r.asistidas,
        r.tardanzas,
        formatearPorcentaje(r.porcentajeAsistencia),
        formatearPorcentaje(r.porcentajeTardanza),
        formatearPorcentaje(r.porcentajeAusentismo)
      ]),
      ...bloqueAsignatura,
      [],
      ['Resumen por persona'],
      ['Grupo', 'Nombre', 'Sesiones', 'Asistidas', 'Tardanzas', '% Asistencia', '% Tardanza', '% Ausentismo'],
      ...resumenPersona.map((r) => [
        sanitizarTexto(r.grupo),
        sanitizarTexto(r.nombreCompleto),
        r.sesionesTotal,
        r.asistidas,
        r.tardanzas,
        formatearPorcentaje(r.porcentajeAsistencia),
        formatearPorcentaje(r.porcentajeTardanza),
        formatearPorcentaje(r.porcentajeAusentismo)
      ])
    ];

    const hojaResumen = XLSX.utils.aoa_to_sheet(filasResumen);
    XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');

    const filasDetalle: (string | number)[][] = [
      ['Fecha', 'Hora sesión', 'Grupo', ...(meta.conAsignaturas ? ['Asignatura'] : []), 'Nombre', 'Estado', 'Hora de registro'],
      ...detalle.map((d) => [
        formatearFechaCorta(d.fecha),
        formatearHora(d.inicio),
        sanitizarTexto(d.grupo),
        ...(meta.conAsignaturas ? [sanitizarTexto(nombreAsignatura(d))] : []),
        sanitizarTexto(d.nombre_completo),
        ESTADO_TEXTO[d.estado] ?? d.estado,
        formatearHora(d.registrado_en)
      ])
    ];

    const hojaDetalle = XLSX.utils.aoa_to_sheet(filasDetalle);
    XLSX.utils.book_append_sheet(libro, hojaDetalle, 'Detalle');

    XLSX.writeFile(libro, `${nombreArchivoBase(meta)}.xlsx`);
  }

  exportarPdf(
    resumenGrupo: FilaResumenGrupo[],
    resumenAsignatura: FilaResumenAsignatura[],
    resumenPersona: FilaResumenPersona[],
    detalle: FilaDetalleAsistencia[],
    meta: MetaReporte
  ): void {
    const anchoCompleto = (n: number) => Array(n).fill('*');

    const tablaResumenGrupo = {
      table: {
        headerRows: 1,
        widths: anchoCompleto(7),
        body: [
          ['Grupo', 'Sesiones', 'Miembros', 'Asistidas', 'Tardanzas', '% Asist.', '% Tard.'],
          ...resumenGrupo.map((r) => [
            r.grupo,
            String(r.sesionesTotal),
            String(r.miembrosTotal),
            String(r.asistidas),
            String(r.tardanzas),
            formatearPorcentaje(r.porcentajeAsistencia),
            formatearPorcentaje(r.porcentajeTardanza)
          ])
        ]
      },
      layout: 'lightHorizontalLines'
    };

    const tablaResumenAsignatura = {
      table: {
        headerRows: 1,
        widths: anchoCompleto(7),
        body: [
          ['Grupo', 'Asignatura', 'Clases', 'Miembros', 'Asistidas', 'Tardanzas', '% Asist.'],
          ...resumenAsignatura.map((r) => [
            r.grupo,
            r.asignatura,
            String(r.clases),
            String(r.miembrosTotal),
            String(r.asistidas),
            String(r.tardanzas),
            formatearPorcentaje(r.porcentajeAsistencia)
          ])
        ]
      },
      layout: 'lightHorizontalLines'
    };

    const tablaResumenPersona = {
      table: {
        headerRows: 1,
        widths: anchoCompleto(6),
        body: [
          ['Grupo', 'Nombre', 'Sesiones', 'Asistidas', 'Tardanzas', '% Asist.'],
          ...resumenPersona.map((r) => [
            r.grupo,
            r.nombreCompleto,
            String(r.sesionesTotal),
            String(r.asistidas),
            String(r.tardanzas),
            formatearPorcentaje(r.porcentajeAsistencia)
          ])
        ]
      },
      layout: 'lightHorizontalLines'
    };

    const tablaDetalle = {
      table: {
        headerRows: 1,
        widths: anchoCompleto(meta.conAsignaturas ? 6 : 5),
        body: [
          ['Fecha', 'Grupo', ...(meta.conAsignaturas ? ['Asignatura'] : []), 'Nombre', 'Estado', 'Hora registro'],
          ...detalle.map((d) => [
            formatearFechaCorta(d.fecha),
            d.grupo,
            ...(meta.conAsignaturas ? [nombreAsignatura(d)] : []),
            d.nombre_completo,
            ESTADO_TEXTO[d.estado] ?? d.estado,
            formatearHora(d.registrado_en)
          ])
        ]
      },
      layout: 'lightHorizontalLines'
    };

    const docDefinicion = {
      pageMargins: [32, 70, 32, 40] as [number, number, number, number],
      header: {
        text: 'Registrapp — Reporte de asistencia',
        margin: [32, 24, 32, 0] as [number, number, number, number],
        fontSize: 9,
        color: '#666666'
      },
      footer: (actual: number, total: number) => ({
        text: `Página ${actual} de ${total}`,
        alignment: 'center' as const,
        fontSize: 8,
        margin: [0, 0, 0, 10] as [number, number, number, number]
      }),
      content: [
        { text: 'Reporte de asistencia', style: 'titulo' },
        { text: `Institución: ${meta.institucionNombre}`, margin: [0, 8, 0, 0] as [number, number, number, number] },
        { text: `Grupo: ${meta.grupoNombre}` },
        ...(meta.conAsignaturas ? [{ text: `Asignatura: ${meta.asignaturaNombre}` }] : []),
        { text: `Período: ${formatearFechaCorta(meta.desde)} a ${formatearFechaCorta(meta.hasta)}` },
        {
          text: `Generado por ${meta.generadoPor} el ${formatearFechaHoraCorta(meta.generadoEn)}`,
          margin: [0, 0, 0, 16] as [number, number, number, number]
        },
        { text: 'Resumen por grupo', style: 'subtitulo' },
        tablaResumenGrupo,
        ...(meta.conAsignaturas
          ? [
              { text: 'Resumen por asignatura', style: 'subtitulo', margin: [0, 16, 0, 4] as [number, number, number, number] },
              tablaResumenAsignatura
            ]
          : []),
        { text: 'Resumen por persona', style: 'subtitulo', margin: [0, 16, 0, 4] as [number, number, number, number] },
        tablaResumenPersona,
        { text: 'Detalle', style: 'subtitulo', margin: [0, 16, 0, 4] as [number, number, number, number] },
        tablaDetalle
      ],
      styles: {
        titulo: { fontSize: 16, bold: true },
        subtitulo: { fontSize: 12, bold: true }
      },
      defaultStyle: { fontSize: 8 }
    };

    pdfMake.createPdf(docDefinicion).download(`${nombreArchivoBase(meta)}.pdf`);
  }
}
