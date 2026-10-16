import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthFake, crearAuthFake, usuarioDePrueba } from '../testing/auth-fake';
import { homeRedirectGuard } from './home-redirect.guard';

describe('homeRedirectGuard', () => {
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
    return TestBed.runInInjectionContext(() => homeRedirectGuard(route, state)) as Promise<boolean | UrlTree>;
  }

  it('redirige a /login si no hay sesión', async () => {
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login');
  });

  it('redirige a /onboarding/institucion si la sesión no tiene institución todavía', async () => {
    auth.sinPerfil.set(true);
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/onboarding/institucion');
  });

  it('redirige a /cambiar-password si corresponde', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'miembro', debe_cambiar_password: true }));
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/cambiar-password');
  });

  it('redirige cada rol a su propio home', async () => {
    const destinos: Record<string, string> = { administrador: '/admin', responsable: '/responsable', miembro: '/miembro' };
    for (const [rol, destino] of Object.entries(destinos)) {
      auth.currentUser.set(usuarioDePrueba({ rol: rol as 'administrador' | 'responsable' | 'miembro' }));
      const resultado = await ejecutar();
      expect(router.serializeUrl(resultado as UrlTree)).toBe(destino);
    }
  });
});
