import { extraerTokenDeHash, extraerTokenDeUrlPropia } from './token-qr';

describe('extraerTokenDeHash', () => {
  it('extrae el token de un fragmento #t=...', () => {
    expect(extraerTokenDeHash('#t=abc123')).toBe('abc123');
  });

  it('extrae el token cuando hay otros parámetros antes con &', () => {
    expect(extraerTokenDeHash('#otro=1&t=abc123')).toBe('abc123');
  });

  it('decodifica caracteres especiales (el token es base64url con puntos)', () => {
    expect(extraerTokenDeHash('#t=v1.eyJ2IjoxfQ.firma')).toBe('v1.eyJ2IjoxfQ.firma');
  });

  it('decodifica un valor con codificación porcentual', () => {
    expect(extraerTokenDeHash('#t=a%2Bb')).toBe('a+b');
  });

  it('devuelve null si no hay fragmento', () => {
    expect(extraerTokenDeHash('')).toBeNull();
  });

  it('devuelve null si el fragmento no contiene t=', () => {
    expect(extraerTokenDeHash('#otro=valor')).toBeNull();
  });
});

describe('extraerTokenDeUrlPropia', () => {
  const ORIGEN = 'https://registrapp.example.com';

  it('extrae el token de una URL propia válida', () => {
    const url = `${ORIGEN}/asistir#t=v1.payload.firma`;
    expect(extraerTokenDeUrlPropia(url, ORIGEN)).toBe('v1.payload.firma');
  });

  it('rechaza una URL de otro origen (no llama al servidor con datos ajenos)', () => {
    const url = 'https://sitio-malicioso.com/asistir#t=v1.payload.firma';
    expect(extraerTokenDeUrlPropia(url, ORIGEN)).toBeNull();
  });

  it('rechaza una URL del propio origen pero con otra ruta', () => {
    const url = `${ORIGEN}/otra-ruta#t=v1.payload.firma`;
    expect(extraerTokenDeUrlPropia(url, ORIGEN)).toBeNull();
  });

  it('rechaza un texto que no es una URL válida', () => {
    expect(extraerTokenDeUrlPropia('esto no es una url', ORIGEN)).toBeNull();
  });

  it('devuelve null si la URL es propia pero no tiene token', () => {
    expect(extraerTokenDeUrlPropia(`${ORIGEN}/asistir`, ORIGEN)).toBeNull();
  });
});
