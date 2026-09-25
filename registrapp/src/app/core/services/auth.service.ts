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

  constructor() {
    this.supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        this.cargarUsuario(session.user.id);
      } else {
        this.currentUser.set(null);
        this.cargando.set(false);
      }
    });
  }

  async login(email: string, password: string): Promise<Usuario> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      throw new Error(error?.message ?? 'No se pudo iniciar sesión.');
    }

    const usuario = await this.buscarUsuario(data.user.id);

    if (!usuario) {
      await this.supabase.auth.signOut();
      this.currentUser.set(null);
      throw new Error('Tu cuenta no tiene un perfil de Registrapp asociado. Contacta al administrador.');
    }

    this.currentUser.set(usuario);
    return usuario;
  }

  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
    this.currentUser.set(null);
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

  private async cargarUsuario(authUserId: string): Promise<void> {
    const usuario = await this.buscarUsuario(authUserId);

    if (!usuario) {
      await this.supabase.auth.signOut();
      this.currentUser.set(null);
      this.cargando.set(false);
      return;
    }

    this.currentUser.set(usuario);
    this.cargando.set(false);
  }

  private async buscarUsuario(authUserId: string): Promise<Usuario | null> {
    const { data, error } = await this.supabase.from('usuarios').select('*').eq('id', authUserId).single();

    if (error || !data) {
      return null;
    }

    return data as Usuario;
  }
}
