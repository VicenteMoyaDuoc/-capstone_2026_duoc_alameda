// Verificación de ubicación para la asistencia. Lógica pura (sin red ni base de datos)
// para poder probarla con `deno test supabase/functions/_shared/geo.test.ts`.

export type ModoGeo = 'off' | 'proximidad' | 'exacta';

export interface Ubicacion {
  lat: number;
  lng: number;
  /** Radio de error del GPS en metros (coords.accuracy). */
  precision: number;
}

export interface PuntoReferencia {
  lat: number;
  lng: number;
  radioM: number;
}

export type CodigoGeo = 'UBICACION_REQUERIDA' | 'UBICACION_IMPRECISA' | 'FUERA_DE_RANGO';

export type VeredictoGeo = { ok: true; distanciaM: number | null } | { ok: false; code: CodigoGeo; distanciaM: number | null };

/** Modo "exacta": si el GPS dice tener un error mayor a esto, se pide intentar de nuevo. */
export const PRECISION_MAX_EXACTA_M = 35;

/** Modo "proximidad": cuánto error del GPS se le perdona al alumno, como máximo. */
export const CREDITO_PRECISION_MAX_M = 100;

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const redondear = (n: number): number => Math.round(n * 10) / 10;

/**
 * Decide si una ubicación cumple la regla de la sesión.
 * - off, o sesión sin punto de referencia configurado → se acepta (no se bloquea por mala configuración).
 * - exacta: la precisión del GPS debe ser buena y la distancia no puede superar el radio.
 * - proximidad: se descuenta el error del GPS (hasta 100 m) antes de comparar con el radio.
 */
export function evaluarUbicacion(modo: ModoGeo, referencia: PuntoReferencia | null, ubicacion: Ubicacion | undefined): VeredictoGeo {
  if (modo === 'off' || !referencia) return { ok: true, distanciaM: null };
  if (!ubicacion) return { ok: false, code: 'UBICACION_REQUERIDA', distanciaM: null };

  const d = redondear(distanciaM(ubicacion.lat, ubicacion.lng, referencia.lat, referencia.lng));

  if (modo === 'exacta') {
    if (ubicacion.precision > PRECISION_MAX_EXACTA_M) return { ok: false, code: 'UBICACION_IMPRECISA', distanciaM: d };
    return d <= referencia.radioM ? { ok: true, distanciaM: d } : { ok: false, code: 'FUERA_DE_RANGO', distanciaM: d };
  }

  const credito = Math.min(Math.max(ubicacion.precision, 0), CREDITO_PRECISION_MAX_M);
  return d - credito <= referencia.radioM ? { ok: true, distanciaM: d } : { ok: false, code: 'FUERA_DE_RANGO', distanciaM: d };
}

export interface ConfigGeoInstitucion {
  geo_modo: ModoGeo;
  sede_lat: number | null;
  sede_lng: number | null;
  radio_proximidad_m: number;
  radio_exacto_m: number;
}

export interface GeoDeSesion {
  geo_modo: ModoGeo;
  geo_lat: number | null;
  geo_lng: number | null;
  geo_radio_m: number | null;
}

export type ResolucionGeoSesion = { ok: true; sesion: GeoDeSesion } | { ok: false; code: CodigoGeo };

const SIN_GEO: GeoDeSesion = { geo_modo: 'off', geo_lat: null, geo_lng: null, geo_radio_m: null };

/**
 * Fija la regla de ubicación de una clase al iniciarla (la usa sesion-asistencia).
 * - proximidad: el centro es la sede.
 * - exacta: el centro es donde está el profesor ahora; por eso su ubicación es obligatoria,
 *   debe ser precisa y, si la sede está configurada, debe estar dentro de la sede.
 */
export function resolverGeoDeSesion(config: ConfigGeoInstitucion, ubicacionProfesor: Ubicacion | undefined): ResolucionGeoSesion {
  const sede =
    config.sede_lat !== null && config.sede_lng !== null
      ? { lat: config.sede_lat, lng: config.sede_lng, radioM: config.radio_proximidad_m }
      : null;

  if (config.geo_modo === 'off') return { ok: true, sesion: SIN_GEO };

  if (config.geo_modo === 'proximidad') {
    if (!sede) return { ok: true, sesion: SIN_GEO }; // sin sede no hay con qué comparar: no se bloquea la clase
    return { ok: true, sesion: { geo_modo: 'proximidad', geo_lat: sede.lat, geo_lng: sede.lng, geo_radio_m: sede.radioM } };
  }

  if (!ubicacionProfesor) return { ok: false, code: 'UBICACION_REQUERIDA' };
  if (ubicacionProfesor.precision > PRECISION_MAX_EXACTA_M) return { ok: false, code: 'UBICACION_IMPRECISA' };

  if (sede) {
    const dentroDeSede = evaluarUbicacion('proximidad', sede, ubicacionProfesor);
    if (!dentroDeSede.ok) return { ok: false, code: 'FUERA_DE_RANGO' };
  }

  return {
    ok: true,
    sesion: { geo_modo: 'exacta', geo_lat: ubicacionProfesor.lat, geo_lng: ubicacionProfesor.lng, geo_radio_m: config.radio_exacto_m }
  };
}

/** Texto que ve el usuario. `quien` distingue al alumno (registrar) del profesor (iniciar la clase). */
export function mensajeGeo(code: CodigoGeo, modo: ModoGeo, quien: 'alumno' | 'profesor'): string {
  switch (code) {
    case 'UBICACION_REQUERIDA':
      return 'Debes permitir el acceso a tu ubicación para continuar.';
    case 'UBICACION_IMPRECISA':
      return 'No se pudo precisar tu ubicación. Acércate a una ventana, espera unos segundos e intenta de nuevo.';
    case 'FUERA_DE_RANGO':
      if (quien === 'profesor') return 'Para iniciar la clase debes estar en la sede.';
      return modo === 'exacta'
        ? 'Estás lejos del lugar de la clase. Acércate a la sala y vuelve a intentarlo.'
        : 'Parece que no estás en la sede. Debes estar en el lugar para registrar tu asistencia.';
  }
}

/** Lo que el servidor le devuelve al alumno para mostrarle el mapa y la distancia. */
export interface DatosGeoRespuesta {
  modo: ModoGeo;
  distancia_m: number | null;
  /** Solo en proximidad: la sede es pública. En exacta no se envía, porque ese punto es donde está el profesor. */
  sede?: { lat: number; lng: number; radio_m: number };
}

export function datosGeoRespuesta(modo: ModoGeo, referencia: PuntoReferencia | null, distancia: number | null): DatosGeoRespuesta {
  const datos: DatosGeoRespuesta = { modo, distancia_m: distancia };
  if (modo === 'proximidad' && referencia) datos.sede = { lat: referencia.lat, lng: referencia.lng, radio_m: referencia.radioM };
  return datos;
}
