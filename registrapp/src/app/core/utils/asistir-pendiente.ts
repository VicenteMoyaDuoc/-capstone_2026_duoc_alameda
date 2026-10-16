// Permite retomar el registro de asistencia después de pasar por /login
// cuando se abrió /asistir#t=... sin sesión iniciada.
const CLAVE = 'registrapp_asistir_token_pendiente';

export function guardarTokenPendiente(token: string): void {
  sessionStorage.setItem(CLAVE, token);
}

export function hayTokenPendiente(): boolean {
  return sessionStorage.getItem(CLAVE) !== null;
}

/** Lee el token pendiente y lo elimina (de un solo uso). */
export function tomarTokenPendiente(): string | null {
  const token = sessionStorage.getItem(CLAVE);
  sessionStorage.removeItem(CLAVE);
  return token;
}
