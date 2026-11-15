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
              Promise.resolve(filaUsuario ? { data: filaUsuario, error: null } : { data: null, error: { message: 'no encontrado', code: 'PGRST116' } })
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

describe('AuthService — idempotencia y glosas del login', () => {
  const errorAuth = (mensaje: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(mensaje), extra);
  const credencialesMalas = errorAuth('Invalid login credentials', { code: 'invalid_credentials', status: 400 });

  beforeEach(() => spyOn(console, 'error')); // el detalle técnico va a la consola

  it('dos inicios de sesión iguales a la vez (doble clic) hacen UNA sola llamada y comparten resultado', async () => {
    const usuario = usuarioDePrueba();
    const { servicio, supabaseFake } = configurar({ filaUsuario: usuario });

    const [a, b] = await Promise.all([servicio.login('x@test.com', 'clave12345'), servicio.login('x@test.com', 'clave12345')]);

    expect(supabaseFake.client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(a).toEqual(usuario);
    expect(b).toEqual(usuario);
  });

  it('repetir el mismo inicio de sesión exitoso enseguida no crea otra sesión', async () => {
    const { servicio, supabaseFake } = configurar({ filaUsuario: usuarioDePrueba() });

    await servicio.login('x@test.com', 'clave12345');
    await servicio.login('x@test.com', 'clave12345');

    expect(supabaseFake.client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('el correo se normaliza: mayúsculas y espacios no cuentan como otro intento', async () => {
    const { servicio, supabaseFake } = configurar({ filaUsuario: usuarioDePrueba() });

    await Promise.all([servicio.login('X@Test.com ', 'clave12345'), servicio.login('x@test.com', 'clave12345')]);

    expect(supabaseFake.client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it('credenciales distintas NO se mezclan: cada una llama al servidor', async () => {
    const { servicio, supabaseFake } = configurar({ filaUsuario: usuarioDePrueba() });

    await Promise.all([servicio.login('x@test.com', 'clave12345'), servicio.login('x@test.com', 'otra-clave-99')]);

    expect(supabaseFake.client.auth.signInWithPassword).toHaveBeenCalledTimes(2);
  });

  it('una contraseña incorrecta nunca se acepta por haber iniciado sesión antes con otra', async () => {
    const { servicio, supabaseFake } = configurar({ filaUsuario: usuarioDePrueba() });
    await servicio.login('x@test.com', 'clave12345');

    supabaseFake.client.auth.signInWithPassword.and.resolveTo({ data: { user: null }, error: credencialesMalas });

    await expectAsync(servicio.login('x@test.com', 'clave-equivocada')).toBeRejectedWithError('Correo o contraseña incorrectos.');
  });

  it('un intento fallido no se guarda: el usuario puede corregir y volver a intentar', async () => {
    const { servicio, supabaseFake } = configurar({ filaUsuario: usuarioDePrueba() });
    const llamada = supabaseFake.client.auth.signInWithPassword;

    llamada.and.resolveTo({ data: { user: null }, error: credencialesMalas });
    await expectAsync(servicio.login('x@test.com', 'mala')).toBeRejected();

    llamada.and.resolveTo({ data: { user: { id: 'auth-1' } }, error: null });
    const usuario = await servicio.login('x@test.com', 'mala');

    expect(llamada).toHaveBeenCalledTimes(2);
    expect(usuario).not.toBeNull();
  });

  it('tras 5 contraseñas incorrectas seguidas bloquea el formulario sin llamar al servidor', async () => {
    const { servicio, supabaseFake } = configurar();
    const llamada = supabaseFake.client.auth.signInWithPassword;
    llamada.and.resolveTo({ data: { user: null }, error: credencialesMalas });

    for (let i = 0; i < 5; i++) {
      await expectAsync(servicio.login('x@test.com', 'mala' + i)).toBeRejectedWithError('Correo o contraseña incorrectos.');
    }
    expect(llamada).toHaveBeenCalledTimes(5);

    await expectAsync(servicio.login('x@test.com', 'mala-6')).toBeRejectedWithError(
      /Demasiados intentos fallidos\. Espera \d+ segundos e inténtalo de nuevo\./
    );
    expect(llamada).toHaveBeenCalledTimes(5); // el sexto intento ni siquiera salió
  });

  it('un error de red muestra la glosa de conexión, no el mensaje técnico', async () => {
    const { servicio } = configurar({ signIn: { data: { user: null }, error: errorAuth('Failed to fetch', { name: 'AuthRetryableFetchError', status: 0 }) } });

    await expectAsync(servicio.login('x@test.com', 'clave12345')).toBeRejectedWithError(
      'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'
    );
  });

  it('una clave de API inválida no se le explica al usuario', async () => {
    const { servicio } = configurar({ signIn: { data: { user: null }, error: errorAuth('Invalid API key', { status: 401 }) } });

    await expectAsync(servicio.login('x@test.com', 'clave12345')).toBeRejectedWithError(
      'El servicio no está disponible por el momento. Intenta de nuevo en unos minutos.'
    );
  });

  it('un correo sin confirmar y una cuenta bloqueada tienen su propia glosa', async () => {
    const sinConfirmar = configurar({ signIn: { data: { user: null }, error: errorAuth('Email not confirmed', { code: 'email_not_confirmed' }) } });
    await expectAsync(sinConfirmar.servicio.login('a@test.com', 'clave12345')).toBeRejectedWithError(
      'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.'
    );
  });
});
