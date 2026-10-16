/** Desfase (ms) entre el reloj del servidor y el del navegador, para no depender del reloj del celular. */
export function calcularDesfaseServidor(servidorAhoraMs: number): number {
  return servidorAhoraMs - Date.now();
}

export function ahoraServidor(desfaseMs: number): number {
  return Date.now() + desfaseMs;
}

export function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

/** Formatea un total de segundos como mm:ss (o h:mm:ss si supera una hora). Nunca negativo. */
export function formatearDuracion(segundosTotales: number): string {
  const segundos = Math.max(0, Math.floor(segundosTotales));
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const segs = segundos % 60;

  if (horas > 0) {
    return `${horas}:${String(minutos).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
  }
  return `${minutos}:${String(segs).padStart(2, '0')}`;
}
