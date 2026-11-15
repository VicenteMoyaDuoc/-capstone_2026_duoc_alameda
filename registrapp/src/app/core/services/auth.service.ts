import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Rol, Usuario } from '../models/models';
import { rolFalsoActivo, usuarioDevPorRol } from '../dev/dev-datos';
import { ErrorApp, aErrorApp } from '../errores/catalogo-errores';

/** Ventana en la que repetir el mismo inicio de sesión exitoso devuelve el resultado ya obtenido. */
const VENTANA_IDEMPOTENCIA_MS = 3000;
const INTENTOS_ANTES_DE_BLOQUEO = 5;
const BLOQUEO_BASE_MS = 30_000;
const BLOQUEO_MAXIMO_MS = 300_000;

/** Huella corta (cyrb53) de un texto, para identificar "las mismas credenciales" sin retenerlas. */
function huellaDe(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);

  readonly currentUser = signal<Usuario | null>(null);
  readonly cargando = signal(true);
  /** Hay una sesión de Supabase Auth activa, pero todavía no existe su fila en `usuarios`. */
  readonly sinPerfil = signal(false);

  constructor() {
    // Solo desarrollo (environment.development.ts): sesión simulada para trabajar el front sin credenciales.
    const rolFalso = rolFalsoActivo();
    if (rolFalso) {
      console.warn(`[AuthService] Sesión FALSA activa como "${rolFalso}" (devRolFalso).`);
      this.currentUser.set(usuarioDevPorRol(rolFalso));
      this.cargando.set(false);
      return;
    }

    this.supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        this.cargarUsuario(session.user.id);
      } else {
        this.currentUser.set(null);
        this.sinPerfil.set(false);
        this.cargando.set(false);
      }
    });
  }

  // ───────────── Inicio de sesión idempotente ─────────────
  //
  // Idempotencia: repetir el MISMO inicio de sesión (doble clic, Enter repetido, reintento automático)
  // produce una sola llamada al servidor y todos reciben el mismo resultado:
  //   · mientras hay uno en curso con las mismas credenciales, se devuelve esa misma promesa;
  //   · si acaba de resultar bien, repetirlo dentro de unos segundos devuelve el resultado sin crear otra sesión.
  // Los intentos fallidos NO se guardan: el usuario puede corregir y reintentar.

  private readonly loginsEnCurso = new Map<string, Promise<Usuario | null>>();
  private ultimoLoginExitoso: { huella: string; hasta: number; usuario: Usuario | null } | null = null;
  private intentosFallidos = 0;
  private bloqueadoHasta = 0;

  /**
   * Inicia sesión. Devuelve el usuario si tiene perfil completo, o `null` si la
   * sesión quedó activa pero sin fila en `usuarios` (el componente debe llevarlo
   * a /onboarding/institucion revisando `sinPerfil()`).
   *
   * Cualquier fallo se lanza como `ErrorApp`: su `message` es la glosa del catálogo, sin detalles técnicos.
   */
  async login(email: string, password: string): Promise<Usuario | null> {
    const correo = email.trim().toLowerCase();
    // La huella evita guardar la contraseña en memoria como clave del mapa.
    const huella = huellaDe(`${correo}\u0000${password}`);

    const reciente = this.ultimoLoginExitoso;
    if (reciente && reciente.huella === huella && Date.now() < reciente.hasta && (reciente.usuario === null || this.currentUser())) {
      return reciente.usuario;
    }

    const enCurso = this.loginsEnCurso.get(huella);
    if (enCurso) return enCurso;

    const restante = Math.ceil((this.bloqueadoHasta - Date.now()) / 1000);
    if (restante > 0) {
      throw new ErrorApp('AUTH_BLOQUEO_TEMPORAL', { segundos: restante });
    }

    const promesa = this.ejecutarLogin(correo, password, huella).finally(() => this.loginsEnCurso.delete(huella));
    this.loginsEnCurso.set(huella, promesa);
    return promesa;
  }

  private async ejecutarLogin(email: string, password: string, huella: string): Promise<Usuario | null> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      const errorApp = aErrorApp(error, 'AUTH_CREDENCIALES');
      if (errorApp.codigo === 'AUTH_CREDENCIALES') this.registrarIntentoFallido();
      throw errorApp;
    }

    let usuario: Usuario | null;
    try {
      usuario = await this.buscarUsuario(data.user.id);
    } catch (err) {
      throw aErrorApp(err, 'AUTH_PERFIL_NO_VERIFICABLE');
    }

    if (usuario && !usuario.activo) {
      await this.supabase.auth.signOut();
      this.currentUser.set(null);
      this.sinPerfil.set(false);
      throw new ErrorApp('AUTH_CUENTA_DESACTIVADA');
    }

    this.intentosFallidos = 0;
    this.bloqueadoHasta = 0;

    if (!usuario) {
      this.sinPerfil.set(true);
      this.currentUser.set(null);
    } else {
      this.currentUser.set(usuario);
      this.sinPerfil.set(false);
    }

    this.ultimoLoginExitoso = { huella, hasta: Date.now() + VENTANA_IDEMPOTENCIA_MS, usuario };
    return usuario;
  }

  /** 5 contraseñas incorrectas seguidas bloquean el formulario 30 s (se duplica en cada nueva tanda, tope 5 min). */
  private registrarIntentoFallido(): void {
    this.intentosFallidos++;
    if (this.intentosFallidos % INTENTOS_ANTES_DE_BLOQUEO === 0) {
      const tanda = this.intentosFallidos / INTENTOS_ANTES_DE_BLOQUEO;
      const espera = Math.min(BLOQUEO_BASE_MS * 2 ** (tanda - 1), BLOQUEO_MAXIMO_MS);
      this.bloqueadoHasta = Date.now() + espera;
    }
  }

  async logout(): Promise<void> {
    this.ultimoLoginExitoso = null;
    await this.supabase.auth.signOut();
    this.currentUser.set(null);
    this.sinPerfil.set(false);
    await this.router.navigateByUrl('/login');
  }

  rutaSegunRol(rol: Rol): string {
    switch (rol) {
      case 'administrador':
        return '/admin';
      case 'responsable':
        return '/responsable';
      case 'miembro':
        return '/miembro';
    }
  }

  /** Ruta a la que debe ir el usuario autenticado según su estado actual. */
  rutaSegunEstado(usuario: Usuario): string {
    if (usuario.debe_cambiar_password) {
      return '/cambiar-password';
    }
    return this.rutaSegunRol(usuario.rol);
  }

  /** Refresca localmente el usuario actual tras cambiar su contraseña. */
  async marcarPasswordCambiada(): Promise<void> {
    await this.supabase.rpc('marcar_password_cambiada');
    const actual = this.currentUser();
    if (actual) {
      this.currentUser.set({ ...actual, debe_cambiar_password: false });
    }
  }

  /** Recarga la fila de `usuarios` del usuario autenticado (por ejemplo tras crear su institución). */
  async recargarUsuarioActual(): Promise<void> {
    const { data } = await this.supabase.auth.getUser();
    if (data.user) {
      await this.cargarUsuario(data.user.id);
    }
  }

  private async cargarUsuario(authUserId: string): Promise<void> {
    let usuario: Usuario | null;
    try {
      usuario = await this.buscarUsuario(authUserId);
    } catch (err) {
      // Error real (red, RLS, etc.), no "esta cuenta no tiene institución": no se debe
      // mandar a onboarding. Se deja sin sesión para que vuelva a intentar desde /login.
      console.error('Error al cargar el perfil del usuario:', err);
      this.currentUser.set(null);
      this.sinPerfil.set(false);
      this.cargando.set(false);
      return;
    }

    if (!usuario) {
      this.sinPerfil.set(true);
      this.currentUser.set(null);
      this.cargando.set(false);
      return;
    }

    if (!usuario.activo) {
      await this.supabase.auth.signOut();
      this.currentUser.set(null);
      this.sinPerfil.set(false);
      this.cargando.set(false);
      return;
    }

    this.currentUser.set(usuario);
    this.sinPerfil.set(false);
    this.cargando.set(false);
  }

  /** Lanza si la consulta falló por un motivo real (red, RLS, etc.); solo devuelve `null`
   *  cuando Postgres confirma que no existe ninguna fila (PGRST116: "0 rows"). */
  private async buscarUsuario(authUserId: string): Promise<Usuario | null> {
    const { data, error } = await this.supabase.from('usuarios').select('*').eq('id', authUserId).single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as Usuario;
  }
}
