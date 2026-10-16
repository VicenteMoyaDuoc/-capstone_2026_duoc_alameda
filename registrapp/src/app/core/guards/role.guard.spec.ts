import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AuthFake, crearAuthFake, usuarioDePrueba } from '../testing/auth-fake';
import { roleGuard } from './role.guard';

describe('roleGuard', () => {
  let auth: AuthFake;
  let router: Router;

  beforeEach(() => {
    auth = crearAuthFake();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }]
    });
    router = TestBed.inject(Router);
  });

  function ejecutar(rolRequerido?: string): Promise<boolean | UrlTree> {
    const route = { data: { rol: rolRequerido } } as unknown as ActivatedRouteSnapshot;
    const state = {} as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => roleGuard(route, state)) as Promise<boolean | UrlTree>;
  }

  it('redirige a /login si no hay ninguna sesión activa', async () => {
    const resultado = await ejecutar('administrador');
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/login');
  });

  it('redirige a /onboarding/institucion si la sesión no tiene fila en usuarios todavía', async () => {
    auth.sinPerfil.set(true);
    const resultado = await ejecutar('administrador');
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/onboarding/institucion');
  });

  it('redirige a /cambiar-password si el usuario debe cambiarla antes de continuar', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'administrador', debe_cambiar_password: true }));
    const resultado = await ejecutar('administrador');
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/cambiar-password');
  });

  it('permite el acceso cuando el rol del usuario coincide con el requerido', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'administrador' }));
    const resultado = await ejecutar('administrador');
    expect(resultado).toBe(true);
  });

  it('redirige a la ruta de su propio rol si el usuario no tiene el rol requerido', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'responsable' }));
    const resultado = await ejecutar('administrador');
    expect(router.serializeUrl(resultado as UrlTree)).toBe('/responsable');
  });

  it('permite el acceso a cada uno de los 3 roles en su propia ruta', async () => {
    for (const rol of ['administrador', 'responsable', 'miembro'] as const) {
      auth.currentUser.set(usuarioDePrueba({ rol }));
      const resultado = await ejecutar(rol);
      expect(resultado).toBe(true);
    }
  });

  it('permite el acceso si la ruta no exige un rol específico', async () => {
    auth.currentUser.set(usuarioDePrueba({ rol: 'miembro' }));
    const resultado = await ejecutar(undefined);
    expect(resultado).toBe(true);
  });
});
