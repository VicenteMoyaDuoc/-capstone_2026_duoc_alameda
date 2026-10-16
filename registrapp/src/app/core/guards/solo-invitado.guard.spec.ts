import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthFake, crearAuthFake, usuarioDePrueba } from '../testing/auth-fake';
import { soloInvitadoGuard } from './solo-invitado.guard';

describe('soloInvitadoGuard', () => {
  let auth: AuthFake;
  let router: Router;

  beforeEach(() => {
    auth = crearAuthFake();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }]
    });
    router = TestBed.inject(Router);
  });

  function ejecutar(): Promise<boolean | UrlTree> {
    const route = {} as ActivatedRouteSnapshot;
    const state = {} as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => soloInvitadoGuard(route, state)) as Promise<boolean | UrlTree>;
  }

  it('permite el acceso a /login cuando no hay sesión activa', async () => {
    const resultado = await ejecutar();
    expect(resultado).toBe(true);
  });

  it('redirige a /onboarding/institucion si la sesión está activa pero sin institución', async () => {
    auth.sinPerfil.set(true);
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/onboarding/institucion');
  });

  it('redirige a su home a un usuario ya logueado (no debe ver el login de nuevo)', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'miembro' }));
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/miembro');
  });

  it('redirige a /cambiar-password si el usuario logueado todavía debe cambiarla', async () => {
    auth.currentUser.set(usuarioDePrueba({ debe_cambiar_password: true }));
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/cambiar-password');
  });
});
