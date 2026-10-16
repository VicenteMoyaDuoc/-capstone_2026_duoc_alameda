import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthFake, crearAuthFake, usuarioDePrueba } from '../testing/auth-fake';
import { onboardingGuard } from './onboarding.guard';

describe('onboardingGuard', () => {
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
    return TestBed.runInInjectionContext(() => onboardingGuard(route, state)) as Promise<boolean | UrlTree>;
  }

  it('permite el acceso solo si la sesión está activa pero sin fila en usuarios', async () => {
    auth.sinPerfil.set(true);
    const resultado = await ejecutar();
    expect(resultado).toBe(true);
  });

  it('redirige a /login si no hay ninguna sesión', async () => {
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login');
  });

  it('redirige a su propio home si el usuario ya tiene institución (no debe volver a crear una)', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'administrador' }));
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/admin');
  });
});
