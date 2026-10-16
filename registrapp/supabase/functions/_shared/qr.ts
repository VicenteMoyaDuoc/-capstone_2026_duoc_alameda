// Fase 3.1 — Token del QR: v1.<payload_base64url>.<firma_base64url>
// Firmado con HMAC-SHA256 (Web Crypto) y verificado con crypto.subtle.verify
// (comparación de tiempo constante), nunca con ===.

export interface PayloadToken {
  v: 1;
  sid: string;
  iat: number;
  exp: number;
  jti: string;
}

export type ResultadoVerificacion =
  | { ok: true; payload: PayloadToken }
  | { ok: false; code: 'QR_INVALIDO' | 'QR_EXPIRADO' };

const GRACIA_SEG = 5;

function base64UrlCodificar(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodificar(texto: string): Uint8Array {
  const normalizado = texto.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = normalizado.padEnd(normalizado.length + ((4 - (normalizado.length % 4)) % 4), '=');
  const binario = atob(relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function comoBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer as ArrayBuffer;
}

function textoABytes(texto: string): ArrayBuffer {
  return new TextEncoder().encode(texto).buffer as ArrayBuffer;
}

async function importarClave(secreto: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', textoABytes(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ]);
}

export function generarJti(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return base64UrlCodificar(bytes);
}

export async function firmarToken(payload: PayloadToken, secreto: string): Promise<string> {
  const payloadB64 = base64UrlCodificar(new Uint8Array(textoABytes(JSON.stringify(payload))));
  const clave = await importarClave(secreto);
  const firma = await crypto.subtle.sign('HMAC', clave, textoABytes(payloadB64));
  const firmaB64 = base64UrlCodificar(new Uint8Array(firma));
  return `v1.${payloadB64}.${firmaB64}`;
}

export async function verificarToken(token: string, secreto: string): Promise<ResultadoVerificacion> {
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') {
    return { ok: false, code: 'QR_INVALIDO' };
  }

  const [, payloadB64, firmaB64] = partes;

  let payload: PayloadToken;
  try {
    const json = new TextDecoder().decode(base64UrlDecodificar(payloadB64));
    payload = JSON.parse(json);
  } catch {
    return { ok: false, code: 'QR_INVALIDO' };
  }

  if (
    payload.v !== 1 ||
    typeof payload.sid !== 'string' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number' ||
    typeof payload.jti !== 'string'
  ) {
    return { ok: false, code: 'QR_INVALIDO' };
  }

  let firmaValida: boolean;
  try {
    const clave = await importarClave(secreto);
    firmaValida = await crypto.subtle.verify(
      'HMAC',
      clave,
      comoBufferSource(base64UrlDecodificar(firmaB64)),
      textoABytes(payloadB64)
    );
  } catch {
    return { ok: false, code: 'QR_INVALIDO' };
  }

  if (!firmaValida) {
    return { ok: false, code: 'QR_INVALIDO' };
  }

  const ahoraSeg = Date.now() / 1000;
  if (ahoraSeg > payload.exp + GRACIA_SEG) {
    return { ok: false, code: 'QR_EXPIRADO' };
  }

  return { ok: true, payload };
}
