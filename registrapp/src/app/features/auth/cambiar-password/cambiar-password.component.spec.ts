import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { AuthFake, crearAuthFake, usuarioDePrueba } from '../../../core/testing/auth-fake';
import { guardarTokenPendiente, tomarTokenPendiente } from '../../../core/utils/asistir-pendiente';
import { CambiarPasswordComponent } from './cambiar-password.component';

function crearSupabaseFake(error: { message: string } | null = null) {
  return {
    client: {
      auth: {
        updateUser: jasmine.createSpy('updateUser').and.resolveTo({ error })
      }
    }
  };
}

describe('CambiarPasswordComponent', () => {
  let auth: AuthFake;

  beforeEach(() => {
    tomarTokenPendiente();
    auth = crearAuthFake();
  });

  function configurar(supabaseError: { message: string } | null = null) {
    const supabaseFake = crearSupabaseFake(supabaseError);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: SupabaseService, useValue: supabaseFake }
      ]
    });
    const fixture = TestBed.createComponent(CambiarPasswordComponent);
    const componente = fixture.componentInstance;
    componente.form.setValue({ password: 'clave-nueva-123', confirmacion: 'clave-nueva-123' });
    return { fixture, componente, supabaseFake, router: TestBed.inject(Router) };
  }

  // Defecto encontrado en Fase 6.1: tras un cambio de contraseña obligatorio (primer ingreso),
  // el token de asistencia pendiente (guardado al abrir /asistir#t=... sin sesión) se perdía
  // porque este componente navegaba directo a la ruta del rol sin revisar hayTokenPendiente().
  // La propia ruta /asistir es quien consume el token (de un solo uso) al cargar.
  it('navega a /asistir en vez de a su rol si el usuario venía de escanear un QR', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'miembro', debe_cambiar_password: true }));
    guardarTokenPendiente('token-de-prueba');
    const { componente, router } = configurar();
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    await componente.guardar();

    expect(navigateSpy).toHaveBeenCalledWith('/asistir');
  });

  it('navega a la ruta del rol cuando no hay ningún token pendiente', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'responsable', debe_cambiar_password: true }));
    const { componente, router } = configurar();
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    await componente.guardar();

    expect(navigateSpy).toHaveBeenCalledWith('/responsable');
  });

  it('marca debe_cambiar_password en false tras guardar', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'miembro', debe_cambiar_password: true }));
    const { componente, router } = configurar();
    spyOn(router, 'navigateByUrl').and.resolveTo(true);

    await componente.guardar();

    expect(auth.currentUser()?.debe_cambiar_password).toBeFalse();
  });

  it('muestra un mensaje de error y no navega si Supabase rechaza la actualización', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'miembro', debe_cambiar_password: true }));
    const { componente, router } = configurar({ message: 'fallo' });
    const navigateSpy = spyOn(router, 'navigateByUrl').and.resolveTo(true);

    await componente.guardar();

    expect(componente.error()).toBe('No se pudo actualizar la contraseña. Intenta nuevamente.');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('no envía el formulario si las contraseñas no coinciden', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'miembro' }));
    const { componente, supabaseFake } = configurar();
    componente.form.setValue({ password: 'clave-nueva-123', confirmacion: 'otra-clave-456' });

    await componente.guardar();

    expect(supabaseFake.client.auth.updateUser).not.toHaveBeenCalled();
  });
});
