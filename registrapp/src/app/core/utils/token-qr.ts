// Fase 6.1 — extracción pura del token del QR desde una URL, separada de los
// componentes para poder probarla sin TestBed ni navegador real.

/** Extrae el token de un fragmento de URL (#t=... o ...&t=...). */
export function extraerTokenDeHash(hash: string): string | null {
  const coincidencia = /[#&]t=([^&]+)/.exec(hash);
  return coincidencia ? decodeURIComponent(coincidencia[1]) : null;
}

/** Extrae el token solo si la URL completa es de la propia app (mismo origen, ruta /asistir). */
export function extraerTokenDeUrlPropia(texto: string, origenPropio: string): string | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }

  if (url.origin !== origenPropio || url.pathname !== '/asistir') {
    return null;
  }

  return extraerTokenDeHash(url.hash);
}
