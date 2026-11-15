import { CATALOGO, ErrorApp, aErrorApp, clasificarError, errorDeFuncion, glosaDe, type CodigoError } from './catalogo-errores';

/** Imita los errores de las librerías: un Error con propiedades extra (code, status, name). */
function errorCrudo(mensaje: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(mensaje), extra);
}

describe('Catálogo de errores', () => {
  beforeEach(() => spyOn(console, 'error')); // el detalle técnico va a la consola; no ensucia la salida de las pruebas

  describe('clasificarError', () => {
    const casos: [string, unknown, CodigoError][] = [
      ['credenciales inválidas (código de Auth)', errorCrudo('Invalid login credentials', { code: 'invalid_credentials', status: 400 }), 'AUTH_CREDENCIALES'],
      ['credenciales inválidas (solo texto)', errorCrudo('Invalid login credentials'), 'AUTH_CREDENCIALES'],
      ['correo sin confirmar', errorCrudo('Email not confirmed', { code: 'email_not_confirmed' }), 'AUTH_CORREO_NO_CONFIRMADO'],
      ['usuario bloqueado', errorCrudo('User is banned', { code: 'user_banned' }), 'AUTH_CUENTA_BLOQUEADA'],
      ['límite de intentos del servidor', errorCrudo('rate limit', { code: 'over_request_rate_limit', status: 429 }), 'AUTH_DEMASIADOS_INTENTOS'],
      ['429 sin código', errorCrudo('Too many requests', { status: 429 }), 'AUTH_DEMASIADOS_INTENTOS'],
      ['sin conexión (AuthRetryableFetchError)', errorCrudo('Failed to fetch', { name: 'AuthRetryableFetchError', status: 0 }), 'RED_SIN_CONEXION'],
      ['sin conexión (fetch)', new TypeError('Failed to fetch'), 'RED_SIN_CONEXION'],
      ['error 500 que la librería de Auth envuelve como AuthRetryableFetchError', errorCrudo('FATAL: algo interno', { name: 'AuthRetryableFetchError', status: 500 }), 'SERVICIO_NO_DISPONIBLE'],
      ['error 503 (AuthRetryableFetchError)', errorCrudo('unavailable', { name: 'AuthRetryableFetchError', status: 503 }), 'SERVICIO_NO_DISPONIBLE'],
      ['clave de API inválida', errorCrudo('Invalid API key', { status: 401 }), 'CONFIGURACION_INVALIDA'],
      ['servidor caído', errorCrudo('Bad gateway', { status: 502 }), 'SERVICIO_NO_DISPONIBLE'],
      ['sesión vencida', errorCrudo('JWT expired', { code: 'PGRST301' }), 'AUTH_SESION_EXPIRADA'],
      ['RLS niega el acceso', errorCrudo('permission denied for table usuarios', { code: '42501' }), 'PERMISO_DENEGADO'],
      ['solicitud pendiente repetida', errorCrudo('duplicate key value violates unique constraint "uq_solicitud_pendiente"', { code: '23505' }), 'SOLICITUD_DUPLICADA'],
      ['asignatura repetida', errorCrudo('duplicate key value violates unique constraint "uq_asignatura_nombre_por_grupo"', { code: '23505' }), 'ASIGNATURA_DUPLICADA'],
      ['curso repetido', errorCrudo('duplicate key value violates unique constraint "uq_grupo_nombre_por_institucion"', { code: '23505' }), 'GRUPO_DUPLICADO'],
      ['solicitud ya resuelta', errorCrudo('Esta solicitud ya fue resuelta.', { code: '23514' }), 'SOLICITUD_YA_RESUELTA'],
      ['responsable inválido (trigger)', errorCrudo('El responsable debe pertenecer a la misma institución.', { code: '23514' }), 'RESPONSABLE_INVALIDO'],
      ['no existe (PostgREST)', errorCrudo('Row not found', { code: 'PGRST116' }), 'NO_ENCONTRADO'],
      ['falta una migración (tabla inexistente)', errorCrudo('relation "solicitudes" does not exist', { code: '42P01' }), 'SERVICIO_NO_DISPONIBLE'],
      ['error interno de PostgreSQL (XX000)', errorCrudo('connection to server at "10.2.3.4" failed', { code: 'XX000' }), 'SERVICIO_NO_DISPONIBLE'],
      ['demasiadas conexiones (53300)', errorCrudo('too many connections', { code: '53300' }), 'SERVICIO_NO_DISPONIBLE'],
      ['consulta cancelada por tiempo (57014)', errorCrudo('canceling statement due to statement timeout', { code: '57014' }), 'SERVICIO_NO_DISPONIBLE'],
      ['PostgREST sin conexión a la base (PGRST000)', errorCrudo('Could not connect with the database', { code: 'PGRST000' }), 'SERVICIO_NO_DISPONIBLE'],
      ['un código de datos NO se confunde con infraestructura (22P02)', errorCrudo('invalid input syntax for type uuid', { code: '22P02' }), 'DATOS_INVALIDOS'],
      ['error desconocido', errorCrudo('algo raro'), 'ERROR_INTERNO'],
      ['valor que no es un Error', 'texto suelto', 'ERROR_INTERNO'],
      ['null', null, 'ERROR_INTERNO']
    ];

    for (const [nombre, error, esperado] of casos) {
      it(`${nombre} → ${esperado}`, () => {
        expect(clasificarError(error)).toBe(esperado);
      });
    }

    it('un ErrorApp conserva su código', () => {
      expect(clasificarError(new ErrorApp('AUTH_CUENTA_DESACTIVADA'))).toBe('AUTH_CUENTA_DESACTIVADA');
    });

    it('traduce los códigos de las Edge Functions', () => {
      expect(clasificarError(null, 'correo_duplicado')).toBe('AUTH_CORREO_REGISTRADO');
      expect(clasificarError(null, 'sin_permiso')).toBe('PERMISO_DENEGADO');
      expect(clasificarError(null, 'no_autenticado')).toBe('AUTH_SESION_EXPIRADA');
      expect(clasificarError(null, 'ya_tiene_institucion')).toBe('AUTH_YA_TIENE_INSTITUCION');
    });
  });

  describe('el usuario solo ve la glosa', () => {
    it('el mensaje de un ErrorApp es la glosa del catálogo, no el texto técnico', () => {
      const tecnico = errorCrudo('FATAL: password authentication failed for user "postgres" (host 10.0.0.5)', { status: 500 });
      const error = aErrorApp(tecnico);

      expect(error.message).toBe(CATALOGO['SERVICIO_NO_DISPONIBLE'].glosa);
      expect(error.message).not.toContain('postgres');
      expect(error.message).not.toContain('10.0.0.5');
    });

    it('guarda el detalle técnico aparte (para soporte) y lo deja en la consola', () => {
      const tecnico = errorCrudo('detalle interno', { code: '42501' });
      const error = aErrorApp(tecnico);

      expect(error.detalleTecnico).toBe(tecnico);
      expect(console.error).toHaveBeenCalledWith('[PERMISO_DENEGADO]', tecnico);
    });

    it('glosaDe devuelve solo texto listo para mostrar', () => {
      expect(glosaDe(errorCrudo('Invalid API key', { status: 401 }))).toBe(CATALOGO['CONFIGURACION_INVALIDA'].glosa);
      expect(glosaDe(new TypeError('Cannot read properties of undefined'))).toBe(CATALOGO['ERROR_INTERNO'].glosa);
    });

    it('un error de configuración no se explica al usuario: usa la misma glosa que "servicio no disponible"', () => {
      expect(CATALOGO['CONFIGURACION_INVALIDA'].glosa).toBe(CATALOGO['SERVICIO_NO_DISPONIBLE'].glosa);
    });

    it('el código por defecto solo se usa cuando el error no se puede clasificar', () => {
      expect(aErrorApp(errorCrudo('???'), 'AUTH_CREDENCIALES').codigo).toBe('AUTH_CREDENCIALES');
      expect(aErrorApp(errorCrudo('x', { code: '42501' }), 'AUTH_CREDENCIALES').codigo).toBe('PERMISO_DENEGADO');
    });

    it('reemplaza {segundos} en la glosa del bloqueo temporal', () => {
      expect(new ErrorApp('AUTH_BLOQUEO_TEMPORAL', { segundos: 30 }).message).toBe(
        'Demasiados intentos fallidos. Espera 30 segundos e inténtalo de nuevo.'
      );
    });

    it('ninguna glosa del catálogo contiene jerga técnica', () => {
      const jerga = /supabase|postgres|postgrest|jwt|rls|sql|token|uuid|constraint|exception|stack|undefined|null/i;
      for (const [codigo, entrada] of Object.entries(CATALOGO)) {
        expect(jerga.test(entrada.glosa)).withContext(`glosa de ${codigo}`).toBeFalse();
      }
    });
  });

  describe('errorDeFuncion (Edge Functions)', () => {
    it('usa el código del servidor y muestra la glosa del catálogo, no el message del servidor', async () => {
      const error = await errorDeFuncion(null, { code: 'correo_duplicado', message: 'duplicate key users_email_key' });
      expect(error.codigo).toBe('AUTH_CORREO_REGISTRADO');
      expect(error.message).toBe('Ese correo ya está registrado.');
    });

    it('distingue las acciones inválidas por su texto', async () => {
      const unico = await errorDeFuncion(null, { code: 'accion_invalida', message: 'No puedes desactivar al único administrador de la institución.' });
      const propia = await errorDeFuncion(null, { code: 'accion_invalida', message: 'No puedes desactivar tu propia cuenta.' });
      expect(unico.codigo).toBe('ADMIN_UNICO_NO_DESACTIVABLE');
      expect(propia.codigo).toBe('AUTODESACTIVACION');
    });

    it('lee el cuerpo JSON de una respuesta de error HTTP', async () => {
      const respuesta = new Response(JSON.stringify({ ok: false, code: 'sin_permiso', message: 'Solo un administrador puede crear usuarios.' }), { status: 403 });
      const error = await errorDeFuncion({ context: respuesta });
      expect(error.codigo).toBe('PERMISO_DENEGADO');
    });

    it('sin cuerpo legible usa el código por defecto', async () => {
      const error = await errorDeFuncion({ context: new Response('no es json', { status: 500 }) }, null, 'ERROR_INTERNO');
      expect(error.codigo).toBe('ERROR_INTERNO');
    });
  });
});
