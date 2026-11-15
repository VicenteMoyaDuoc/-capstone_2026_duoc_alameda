// Pruebas de la verificación de ubicación.
// Ejecutar con: deno test supabase/functions/_shared/geo.test.ts

import { assert, assertAlmostEquals, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { datosGeoRespuesta, distanciaM, evaluarUbicacion, resolverGeoDeSesion, type ConfigGeoInstitucion, type PuntoReferencia } from './geo.ts';

// Duoc UC, sede Alameda (Av. España 8)
const SEDE = { lat: -33.4489437, lng: -70.6700844 };
const sedeRef: PuntoReferencia = { ...SEDE, radioM: 300 };
const salaRef: PuntoReferencia = { ...SEDE, radioM: 40 };

/** Punto desplazado `metros` hacia el norte de la sede (1° de latitud ≈ 111 195 m). */
function alNorte(metros: number): { lat: number; lng: number } {
  return { lat: SEDE.lat + metros / 111_195, lng: SEDE.lng };
}

Deno.test('distanciaM: mismo punto es 0 y 1° de latitud son ~111 km', () => {
  assertEquals(distanciaM(SEDE.lat, SEDE.lng, SEDE.lat, SEDE.lng), 0);
  assertAlmostEquals(distanciaM(0, 0, 1, 0), 111_195, 50);
});

Deno.test('distanciaM: 100 m al norte miden ~100 m', () => {
  const p = alNorte(100);
  assertAlmostEquals(distanciaM(SEDE.lat, SEDE.lng, p.lat, p.lng), 100, 0.5);
});

Deno.test('off: siempre acepta, incluso sin ubicación', () => {
  assertEquals(evaluarUbicacion('off', sedeRef, undefined), { ok: true, distanciaM: null });
});

Deno.test('sin punto de referencia configurado no se bloquea a nadie', () => {
  assertEquals(evaluarUbicacion('proximidad', null, undefined), { ok: true, distanciaM: null });
});

Deno.test('proximidad: exige ubicación', () => {
  const v = evaluarUbicacion('proximidad', sedeRef, undefined);
  assert(!v.ok && v.code === 'UBICACION_REQUERIDA');
});

Deno.test('proximidad: dentro del campus se acepta y fuera se rechaza', () => {
  assert(evaluarUbicacion('proximidad', sedeRef, { ...alNorte(150), precision: 20 }).ok);
  const lejos = evaluarUbicacion('proximidad', sedeRef, { ...alNorte(2000), precision: 20 });
  assert(!lejos.ok && lejos.code === 'FUERA_DE_RANGO');
});

Deno.test('proximidad: se perdona el error del GPS, con tope de 100 m', () => {
  // a 380 m con ±80 m de error: 380 − 80 = 300 → entra
  assert(evaluarUbicacion('proximidad', sedeRef, { ...alNorte(380), precision: 80 }).ok);
  // a 500 m con ±5000 m de error: el crédito se topa en 100 → 400 > 300 → no entra
  const v = evaluarUbicacion('proximidad', sedeRef, { ...alNorte(500), precision: 5000 });
  assert(!v.ok && v.code === 'FUERA_DE_RANGO');
});

Deno.test('exacta: dentro de la sala y con buena precisión se acepta', () => {
  const v = evaluarUbicacion('exacta', salaRef, { ...alNorte(25), precision: 10 });
  assert(v.ok);
  assertAlmostEquals(v.distanciaM as number, 25, 0.5);
});

Deno.test('exacta: a 60 m (otra sala o pasillo lejano) se rechaza', () => {
  const v = evaluarUbicacion('exacta', salaRef, { ...alNorte(60), precision: 10 });
  assert(!v.ok && v.code === 'FUERA_DE_RANGO');
});

Deno.test('exacta: GPS impreciso (>35 m) se rechaza aunque esté cerca', () => {
  const v = evaluarUbicacion('exacta', salaRef, { ...alNorte(5), precision: 80 });
  assert(!v.ok && v.code === 'UBICACION_IMPRECISA');
});

Deno.test('exacta: no se perdona el error del GPS (a diferencia de proximidad)', () => {
  const v = evaluarUbicacion('exacta', salaRef, { ...alNorte(45), precision: 30 });
  assert(!v.ok && v.code === 'FUERA_DE_RANGO');
});

const configBase: ConfigGeoInstitucion = {
  geo_modo: 'off',
  sede_lat: SEDE.lat,
  sede_lng: SEDE.lng,
  radio_proximidad_m: 300,
  radio_exacto_m: 40
};

Deno.test('sesión en modo off: no guarda punto', () => {
  const r = resolverGeoDeSesion(configBase, undefined);
  assertEquals(r, { ok: true, sesion: { geo_modo: 'off', geo_lat: null, geo_lng: null, geo_radio_m: null } });
});

Deno.test('sesión en proximidad: el centro es la sede y no necesita ubicación del profesor', () => {
  const r = resolverGeoDeSesion({ ...configBase, geo_modo: 'proximidad' }, undefined);
  assertEquals(r, { ok: true, sesion: { geo_modo: 'proximidad', geo_lat: SEDE.lat, geo_lng: SEDE.lng, geo_radio_m: 300 } });
});

Deno.test('sesión en proximidad sin sede configurada: no bloquea la clase', () => {
  const r = resolverGeoDeSesion({ ...configBase, geo_modo: 'proximidad', sede_lat: null, sede_lng: null }, undefined);
  assert(r.ok && r.sesion.geo_modo === 'off');
});

Deno.test('sesión exacta: exige la ubicación del profesor', () => {
  const r = resolverGeoDeSesion({ ...configBase, geo_modo: 'exacta' }, undefined);
  assert(!r.ok && r.code === 'UBICACION_REQUERIDA');
});

Deno.test('sesión exacta: el centro es donde está el profesor', () => {
  const profe = { ...alNorte(80), precision: 12 };
  const r = resolverGeoDeSesion({ ...configBase, geo_modo: 'exacta' }, profe);
  assertEquals(r, { ok: true, sesion: { geo_modo: 'exacta', geo_lat: profe.lat, geo_lng: profe.lng, geo_radio_m: 40 } });
});

Deno.test('sesión exacta: profesor con GPS impreciso o fuera de la sede no puede iniciar', () => {
  const impreciso = resolverGeoDeSesion({ ...configBase, geo_modo: 'exacta' }, { ...alNorte(10), precision: 90 });
  assert(!impreciso.ok && impreciso.code === 'UBICACION_IMPRECISA');

  const fuera = resolverGeoDeSesion({ ...configBase, geo_modo: 'exacta' }, { ...alNorte(5000), precision: 10 });
  assert(!fuera.ok && fuera.code === 'FUERA_DE_RANGO');
});

Deno.test('datos para el mapa: en proximidad incluye la sede; en exacta no revela el punto del profesor', () => {
  const ref = { lat: -33.4489, lng: -70.6701, radioM: 300 };
  assertEquals(datosGeoRespuesta('proximidad', ref, 120), {
    modo: 'proximidad',
    distancia_m: 120,
    sede: { lat: -33.4489, lng: -70.6701, radio_m: 300 }
  });
  assertEquals(datosGeoRespuesta('exacta', ref, 12), { modo: 'exacta', distancia_m: 12 });
  assertEquals(datosGeoRespuesta('proximidad', null, null), { modo: 'proximidad', distancia_m: null });
});
