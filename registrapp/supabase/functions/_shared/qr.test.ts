// Fase 3.5 — Pruebas unitarias de firma y verificación del token del QR.
// Ejecutar con: deno test supabase/functions/_shared/qr.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { firmarToken, generarJti, verificarToken, type PayloadToken } from './qr.ts';

const SECRETO = 'secreto-de-prueba-de-al-menos-32-bytes-de-largo';
const OTRO_SECRETO = 'otro-secreto-completamente-distinto-de-32-bytes';

function payloadDePrueba(overrides: Partial<PayloadToken> = {}): PayloadToken {
  const ahora = Math.floor(Date.now() / 1000);
  return { v: 1, sid: 'sesion-123', iat: ahora, exp: ahora + 60, jti: generarJti(), ...overrides };
}

Deno.test('token válido se verifica correctamente', async () => {
  const payload = payloadDePrueba();
  const token = await firmarToken(payload, SECRETO);
  const resultado = await verificarToken(token, SECRETO);

  assert(resultado.ok);
  assertEquals(resultado.payload.sid, payload.sid);
  assertEquals(resultado.payload.jti, payload.jti);
});

Deno.test('firma alterada se rechaza como QR_INVALIDO', async () => {
  const token = await firmarToken(payloadDePrueba(), SECRETO);
  const [v, payloadB64, firmaB64] = token.split('.');
  const firmaAlterada = firmaB64.slice(0, -1) + (firmaB64.at(-1) === 'A' ? 'B' : 'A');
  const tokenAlterado = `${v}.${payloadB64}.${firmaAlterada}`;

  const resultado = await verificarToken(tokenAlterado, SECRETO);

  assert(!resultado.ok);
  assertEquals(resultado.code, 'QR_INVALIDO');
});

Deno.test('payload alterado invalida la firma', async () => {
  const token = await firmarToken(payloadDePrueba({ sid: 'sesion-123' }), SECRETO);
  const [v, , firmaB64] = token.split('.');

  const payloadFalsificado = base64UrlCodificarJson({ v: 1, sid: 'sesion-OTRA', iat: 1, exp: 9999999999, jti: 'x' });
  const tokenFalsificado = `${v}.${payloadFalsificado}.${firmaB64}`;

  const resultado = await verificarToken(tokenFalsificado, SECRETO);

  assert(!resultado.ok);
  assertEquals(resultado.code, 'QR_INVALIDO');
});

Deno.test('token vencido (fuera del margen de gracia) se rechaza como QR_EXPIRADO', async () => {
  const ahora = Math.floor(Date.now() / 1000);
  const payload = payloadDePrueba({ iat: ahora - 120, exp: ahora - 60 });
  const token = await firmarToken(payload, SECRETO);

  const resultado = await verificarToken(token, SECRETO);

  assert(!resultado.ok);
  assertEquals(resultado.code, 'QR_EXPIRADO');
});

Deno.test('token dentro del margen de gracia de 5s todavía es válido', async () => {
  const ahora = Math.floor(Date.now() / 1000);
  const payload = payloadDePrueba({ iat: ahora - 60, exp: ahora - 3 });
  const token = await firmarToken(payload, SECRETO);

  const resultado = await verificarToken(token, SECRETO);

  assert(resultado.ok);
});

Deno.test('token firmado con otra clave (otra sesión/entorno) se rechaza', async () => {
  const token = await firmarToken(payloadDePrueba(), SECRETO);

  const resultado = await verificarToken(token, OTRO_SECRETO);

  assert(!resultado.ok);
  assertEquals(resultado.code, 'QR_INVALIDO');
});

Deno.test('token con formato inválido se rechaza como QR_INVALIDO', async () => {
  const resultado = await verificarToken('esto-no-es-un-token', SECRETO);

  assert(!resultado.ok);
  assertEquals(resultado.code, 'QR_INVALIDO');
});

function base64UrlCodificarJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
