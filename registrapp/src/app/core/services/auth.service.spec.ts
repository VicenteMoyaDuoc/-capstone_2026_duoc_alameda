import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { usuarioDePrueba } from '../testing/auth-fake';
import type { Usuario } from '../models/models';

interface OpcionesFake {
  signIn?: { data: { user: { id: string } | null }; error: Error | null };
  filaUsuario?: Usuario | null;
}

function crearSupabaseFake(opciones: OpcionesFake = {}) {
  const filaUsuario = opciones.filaUsuario;

  return {
    client: {
      auth: {
        onAuthStateChange: jasmine.createSpy('onAuthStateChange'),
        signInWithPassword: jasmine
          .createSpy('signInWithPassword')
          .and.resolveTo(opciones.signIn ?? { data: { user: { id: 'auth-1' } }, error: null }),
        signOut: jasmine.createSpy('signOut').and.resolveTo({ error: null })
      },
      from: jasmine.createSpy('from').and.returnValue({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(filaUsuario ? { data: filaUsuario, error: null } : { data: null, error: { message: 'no encontrado' } })
          })
        })
      })
    }
  };
}

function configurar(opciones: OpcionesFake = {}): { servicio: AuthService; supabaseFake: ReturnType<typeof crearSupabaseFake> } {
  const supabaseFake = crearSupabaseFake(opciones);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SupabaseService, useValue: supabaseFake }]
  });
  return { servicio: TestBed.inject(AuthService), supabaseFake };
}

describe('AuthService', () => {
  describe('login', () => {
    it('lanza un error genérico si Supabase rechaza las credenciales (no revela si el correo existe)', async () => {
      const { servicio } = configurar({ signIn: { data: { user: null }, error: new Error('invalid_credentials') } });
      await expectAsync(servicio.login('x@test.com', 'mala')).toBeRejectedWithError('Correo o contraseña incorrectos.');
    });

    it('devuelve null y marca sinPerfil cuando la sesión no tiene fila en usuarios (debe ir a onboarding)', async () => {
      const { servicio } = configurar({ filaUsuario: null });
      const resultado = await servicio.login('x@test.com', 'clave12345');
      expect(resultado).toBeNull();
      expect(servicio.sinPerfil()).toBeTrue();
      expect(servicio.currentUser()).toBeNull();
    });

    it('lanza un error y cierra la sesión si la cuenta está desactivada', async () => {
      const inactivo = usuarioDePrueba({ activo: false });
      const { servicio, supabaseFake } = configurar({ filaUsuario: inactivo });

      await expectAsync(servicio.login('x@test.com', 'clave12345')).toBeRejectedWithError(
        'Tu cuenta está desactivada. Contacta a tu administrador.'
      );
      expect(supabaseFake.client.auth.signOut).toHaveBeenCalled();
      expect(servicio.currentUser()).toBeNull();
    });

    it('devuelve el usuario y lo deja en currentUser cuando el login es exitoso', async () => {
      const activo = usuarioDePrueba({ activo: true });
      const { servicio } = configurar({ filaUsuario: activo });

      const resultado = await servicio.login('x@test.com', 'clave12345');

      expect(resultado).toEqual(activo);
      expect(servicio.currentUser()).toEqual(activo);
      expect(servicio.sinPerfil()).toBeFalse();
    });
  });

  describe('rutaSegunRol', () => {
    it('mapea cada rol a su propia ruta', () => {
      const { servicio } = configurar();
      expect(servicio.rutaSegunRol('administrador')).toBe('/admin');
      expect(servicio.rutaSegunRol('responsable')).toBe('/responsable');
      expect(servicio.rutaSegunRol('miembro')).toBe('/miembro');
    });
  });

  describe('rutaSegunEstado', () => {
    it('manda a /cambiar-password si el usuario debe cambiar la contraseña, sin importar su rol', () => {
      const { servicio } = configurar();
      const usuario = usuarioDePrueba({ rol: 'administrador', debe_cambiar_password: true });
      expect(servicio.rutaSegunEstado(usuario)).toBe('/cambiar-password');
    });

    it('manda a la ruta de su rol si ya cambió la contraseña', () => {
      const { servicio } = configurar();
      const usuario = usuarioDePrueba({ rol: 'responsable', debe_cambiar_password: false });
      expect(servicio.rutaSegunEstado(usuario)).toBe('/responsable');
    });
  });

  describe('logout', () => {
    it('limpia el usuario actual y navega a /login', async () => {
      const { servicio, supabaseFake } = configurar({ filaUsuario: usuarioDePrueba() });
      await servicio.login('x@test.com', 'clave12345');

      const router = TestBed.inject(Router);
      const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);

      await servicio.logout();

      expect(supabaseFake.client.auth.signOut).toHaveBeenCalled();
      expect(servicio.currentUser()).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith('/login');
    });
  });
});
