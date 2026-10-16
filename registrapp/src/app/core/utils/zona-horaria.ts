// D-10: todo se guarda en UTC; se muestra y filtra en America/Santiago.

const ZONA = 'America/Santiago';

function offsetMinutos(fecha: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const partes = Object.fromEntries(dtf.formatToParts(fecha).map((p) => [p.type, p.value]));
  const comoUtc = Date.UTC(+partes['year'], +partes['month'] - 1, +partes['day'], +partes['hour'], +partes['minute'], +partes['second']);
  return (comoUtc - fecha.getTime()) / 60000;
}

function medianocheSantiagoUtc(anio: number, mes: number, dia: number): Date {
  const pruebaUtc = Date.UTC(anio, mes, dia, 0, 0, 0);
  const offset = offsetMinutos(new Date(pruebaUtc));
  return new Date(pruebaUtc - offset * 60000);
}

/** Rango [desde, hasta) en UTC (ISO) del día calendario indicado, según America/Santiago. */
export function rangoDiaSantiagoUtc(fecha: Date): { desde: string; hasta: string } {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth();
  const dia = fecha.getDate();
  return {
    desde: medianocheSantiagoUtc(anio, mes, dia).toISOString(),
    hasta: medianocheSantiagoUtc(anio, mes, dia + 1).toISOString()
  };
}

/** Fecha (solo año/mes/día, en hora local del navegador) correspondiente a "hoy" en America/Santiago. */
export function hoyEnSantiago(): Date {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
  const partes = Object.fromEntries(dtf.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return new Date(+partes['year'], +partes['month'] - 1, +partes['day']);
}
