import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Rol, Usuario } from '../models/models';

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

  /**
   * Inicia sesión. Devuelve el usuario si tiene perfil completo, o `null` si la
   * sesión quedó activa pero sin fila en `usuarios` (el componente debe llevarlo
   * a /onboarding/institucion revisando `sinPerfil()`).
   */
  async login(email: string, password: string): Promise<Usuario | null> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      throw new Error('Correo o contraseña incorrectos.');
    }

    let usuario: Usuario | null;
    try {
      usuario = await this.buscarUsuario(data.user.id);
    } catch (err) {
      console.error('Error al cargar el perfil del usuario:', err);
      throw new Error('No pudimos verificar tu cuenta. Revisa tu conexión e intenta de nuevo.');
    }

    if (!usuario) {
      this.sinPerfil.set(true);
      this.currentUser.set(null);
      return null;
    }

    if (!usuario.activo) {
      await this.supabase.auth.signOut();
      this.currentUser.set(null);
      this.sinPerfil.set(false);
      throw new Error('Tu cuenta está desactivada. Contacta a tu administrador.');
    }

    this.currentUser.set(usuario);
    this.sinPerfil.set(false);
    return usuario;
  }

  async logout(): Promise<void> {
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
