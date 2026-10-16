import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthFake, crearAuthFake, usuarioDePrueba } from '../testing/auth-fake';
import { cambiarPasswordGuard } from './cambiar-password.guard';

describe('cambiarPasswordGuard', () => {
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
    return TestBed.runInInjectionContext(() => cambiarPasswordGuard(route, state)) as Promise<boolean | UrlTree>;
  }

  it('redirige a /onboarding/institucion si la sesión no tiene fila en usuarios', async () => {
    auth.sinPerfil.set(true);
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/onboarding/institucion');
  });

  it('redirige a /login si no hay sesión', async () => {
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login');
  });

  it('permite el acceso solo si debe_cambiar_password es true', async () => {
    auth.currentUser.set(usuarioDePrueba({ debe_cambiar_password: true }));
    const resultado = await ejecutar();
    expect(resultado).toBe(true);
  });

  it('redirige a su home si ya cambió la contraseña (no debe volver a esta pantalla)', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'responsable', debe_cambiar_password: false }));
    const resultado = await ejecutar();
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/responsable');
  });
});
