/**
 * Catálogo de rechazos y errores de la app.
 *
 * Regla de oro: **el usuario solo ve la glosa** (el texto claro de este catálogo). Los mensajes técnicos
 * (de Supabase, PostgREST, la red o las Edge Functions) nunca llegan a la pantalla: se clasifican en un
 * código interno, se dejan en la consola para soporte (`registrarError`) y se muestra la glosa del código.
 *
 * Para agregar un error nuevo: 1) sumar el código a `CodigoError`, 2) darle su glosa en `CATALOGO`,
 * 3) enseñarle a `clasificarError` cuándo aplica. La tabla completa está en CATALOGO-ERRORES.md.
 */

export type CodigoError =
  // ── Autenticación ──
  | 'AUTH_CREDENCIALES'
  | 'AUTH_CORREO_NO_CONFIRMADO'
  | 'AUTH_CUENTA_BLOQUEADA'
  | 'AUTH_CUENTA_DESACTIVADA'
  | 'AUTH_DEMASIADOS_INTENTOS'
  | 'AUTH_BLOQUEO_TEMPORAL'
  | 'AUTH_SESION_EXPIRADA'
  | 'AUTH_PERFIL_NO_VERIFICABLE'
  | 'AUTH_YA_TIENE_INSTITUCION'
  | 'AUTH_CORREO_REGISTRADO'
  | 'AUTH_CLAVE_DEBIL'
  | 'AUTH_REGISTRO_DESHABILITADO'
  // ── Conexión y servicio ──
  | 'RED_SIN_CONEXION'
  | 'SERVICIO_NO_DISPONIBLE'
  | 'CONFIGURACION_INVALIDA'
  | 'ERROR_INTERNO'
  // ── Permisos y datos ──
  | 'PERMISO_DENEGADO'
  | 'NO_ENCONTRADO'
  | 'DATOS_INVALIDOS'
  | 'REGISTRO_DUPLICADO'
  // ── Reglas del negocio ──
  | 'SOLICITUD_DUPLICADA'
  | 'SOLICITUD_YA_RESUELTA'
  | 'ASIGNATURA_DUPLICADA'
  | 'GRUPO_DUPLICADO'
  | 'RESPONSABLE_INVALIDO'
  | 'ADMIN_UNICO_NO_DESACTIVABLE'
  | 'AUTODESACTIVACION'
  | 'USUARIO_NO_ENCONTRADO';

export type CategoriaError = 'autenticacion' | 'conexion' | 'permiso' | 'datos' | 'negocio';

export interface EntradaCatalogo {
  categoria: CategoriaError;
  /** Texto que ve el usuario. Puede llevar {segundos}, que se reemplaza al crear el error. */
  glosa: string;
  /** true: tiene sentido que el usuario vuelva a intentarlo tal cual (red caída, servicio ocupado). */
  reintentable: boolean;
}

const GLOSA_SERVICIO = 'El servicio no está disponible por el momento. Intenta de nuevo en unos minutos.';

export const CATALOGO: Record<CodigoError, EntradaCatalogo> = {
  // ── Autenticación ──
  AUTH_CREDENCIALES: { categoria: 'autenticacion', glosa: 'Correo o contraseña incorrectos.', reintentable: true },
  AUTH_CORREO_NO_CONFIRMADO: {
    categoria: 'autenticacion',
    glosa: 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.',
    reintentable: false
  },
  AUTH_CUENTA_BLOQUEADA: {
    categoria: 'autenticacion',
    glosa: 'Tu cuenta está bloqueada. Contacta a tu administrador.',
    reintentable: false
  },
  AUTH_CUENTA_DESACTIVADA: {
    categoria: 'autenticacion',
    glosa: 'Tu cuenta está desactivada. Contacta a tu administrador.',
    reintentable: false
  },
  AUTH_DEMASIADOS_INTENTOS: {
    categoria: 'autenticacion',
    glosa: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    reintentable: true
  },
  AUTH_BLOQUEO_TEMPORAL: {
    categoria: 'autenticacion',
    glosa: 'Demasiados intentos fallidos. Espera {segundos} segundos e inténtalo de nuevo.',
    reintentable: true
  },
  AUTH_SESION_EXPIRADA: { categoria: 'autenticacion', glosa: 'Tu sesión expiró. Vuelve a iniciar sesión.', reintentable: false },
  AUTH_PERFIL_NO_VERIFICABLE: {
    categoria: 'autenticacion',
    glosa: 'No pudimos verificar tu cuenta. Revisa tu conexión e intenta de nuevo.',
    reintentable: true
  },
  AUTH_YA_TIENE_INSTITUCION: { categoria: 'autenticacion', glosa: 'Tu cuenta ya pertenece a una institución.', reintentable: false },
  AUTH_CORREO_REGISTRADO: { categoria: 'autenticacion', glosa: 'Ese correo ya está registrado.', reintentable: false },
  AUTH_CLAVE_DEBIL: {
    categoria: 'autenticacion',
    glosa: 'La contraseña no cumple los requisitos de seguridad. Elige una más larga y variada.',
    reintentable: false
  },
  AUTH_REGISTRO_DESHABILITADO: {
    categoria: 'autenticacion',
    glosa: 'El registro de cuentas no está disponible por ahora.',
    reintentable: false
  },

  // ── Conexión y servicio ──
  RED_SIN_CONEXION: {
    categoria: 'conexion',
    glosa: 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
    reintentable: true
  },
  SERVICIO_NO_DISPONIBLE: { categoria: 'conexion', glosa: GLOSA_SERVICIO, reintentable: true },
  // Misma glosa que SERVICIO_NO_DISPONIBLE: una clave o URL mal configurada no se le explica al usuario.
  CONFIGURACION_INVALIDA: { categoria: 'conexion', glosa: GLOSA_SERVICIO, reintentable: false },
  ERROR_INTERNO: { categoria: 'conexion', glosa: 'Ocurrió un error. Intenta nuevamente.', reintentable: true },

  // ── Permisos y datos ──
  PERMISO_DENEGADO: { categoria: 'permiso', glosa: 'No tienes permiso para realizar esta acción.', reintentable: false },
  NO_ENCONTRADO: { categoria: 'datos', glosa: 'No encontramos lo que buscabas. Puede que ya no exista.', reintentable: false },
  DATOS_INVALIDOS: { categoria: 'datos', glosa: 'Revisa los datos ingresados.', reintentable: false },
  REGISTRO_DUPLICADO: { categoria: 'datos', glosa: 'Ya existe un registro igual.', reintentable: false },

  // ── Reglas del negocio ──
  SOLICITUD_DUPLICADA: { categoria: 'negocio', glosa: 'Ya enviaste una solicitud igual que sigue pendiente.', reintentable: false },
  SOLICITUD_YA_RESUELTA: { categoria: 'negocio', glosa: 'Esta solicitud ya fue resuelta.', reintentable: false },
  ASIGNATURA_DUPLICADA: { categoria: 'negocio', glosa: 'Ya existe una asignatura con ese nombre en el curso.', reintentable: false },
  GRUPO_DUPLICADO: { categoria: 'negocio', glosa: 'Ya existe un curso o departamento con ese nombre.', reintentable: false },
  RESPONSABLE_INVALIDO: {
    categoria: 'negocio',
    glosa: 'El responsable elegido no es válido: debe ser un profesor activo de la misma institución.',
    reintentable: false
  },
  ADMIN_UNICO_NO_DESACTIVABLE: {
    categoria: 'negocio',
    glosa: 'No puedes desactivar al único administrador de la institución.',
    reintentable: false
  },
  AUTODESACTIVACION: { categoria: 'negocio', glosa: 'No puedes desactivar tu propia cuenta.', reintentable: false },
  USUARIO_NO_ENCONTRADO: { categoria: 'negocio', glosa: 'El usuario indicado no existe.', reintentable: false }
};

/** Error de la app: su `message` ES la glosa, así que mostrarlo en pantalla nunca filtra detalles técnicos. */
export class ErrorApp extends Error {
  readonly categoria: CategoriaError;
  readonly reintentable: boolean;

  constructor(
    readonly codigo: CodigoError,
    opciones: { segundos?: number; detalleTecnico?: unknown } = {}
  ) {
    const entrada = CATALOGO[codigo];
    super(entrada.glosa.replace('{segundos}', String(opciones.segundos ?? '')));
    this.name = 'ErrorApp';
    this.categoria = entrada.categoria;
    this.reintentable = entrada.reintentable;
    this.detalleTecnico = opciones.detalleTecnico;
  }

  /** Solo para soporte: nunca se muestra al usuario. */
  readonly detalleTecnico?: unknown;
}

// ───────────────────────── clasificación ─────────────────────────

interface ErrorCrudo {
  name?: string;
  message?: string;
  code?: string | number;
  status?: number;
  details?: string;
  hint?: string;
}

/** Códigos que devuelven las Edge Functions (`{ ok: false, code, message }`) → código del catálogo. */
const CODIGOS_SERVIDOR: Record<string, CodigoError> = {
  correo_duplicado: 'AUTH_CORREO_REGISTRADO',
  demasiados_intentos: 'AUTH_DEMASIADOS_INTENTOS',
  datos_invalidos: 'DATOS_INVALIDOS',
  json_invalido: 'ERROR_INTERNO',
  metodo_no_permitido: 'ERROR_INTERNO',
  no_autenticado: 'AUTH_SESION_EXPIRADA',
  no_autorizado: 'PERMISO_DENEGADO',
  sin_permiso: 'PERMISO_DENEGADO',
  no_encontrado: 'NO_ENCONTRADO',
  no_encontrada: 'NO_ENCONTRADO',
  ya_tiene_institucion: 'AUTH_YA_TIENE_INSTITUCION',
  grupo_inactivo: 'DATOS_INVALIDOS',
  grupo_invalido: 'DATOS_INVALIDOS',
  asignatura_inactiva: 'DATOS_INVALIDOS',
  error_interno: 'ERROR_INTERNO'
};

/** Convierte cualquier error (Supabase Auth, PostgREST, red, Edge Function) en un código del catálogo. */
export function clasificarError(error: unknown, codigoServidor?: string): CodigoError {
  if (error instanceof ErrorApp) return error.codigo;

  const e = (error ?? {}) as ErrorCrudo;
  const texto = `${e.message ?? ''} ${e.details ?? ''} ${e.hint ?? ''}`.toLowerCase();
  const codigo = String(e.code ?? codigoServidor ?? '');
  const status = typeof e.status === 'number' ? e.status : undefined;

  // Códigos de las Edge Functions
  if (codigoServidor && CODIGOS_SERVIDOR[codigoServidor]) {
    if (codigoServidor === 'accion_invalida') return 'DATOS_INVALIDOS';
    return CODIGOS_SERVIDOR[codigoServidor];
  }
  if (codigoServidor === 'accion_invalida') {
    if (texto.includes('único administrador')) return 'ADMIN_UNICO_NO_DESACTIVABLE';
    if (texto.includes('propia cuenta')) return 'AUTODESACTIVACION';
    return 'DATOS_INVALIDOS';
  }

  // El servidor respondió con un error 5xx. Ojo: la librería de Auth también lanza `AuthRetryableFetchError`
  // para los 5xx, así que hay que mirar el estado ANTES de concluir que fue un problema de red.
  if (status !== undefined && status >= 500) return 'SERVICIO_NO_DISPONIBLE';

  // Sin respuesta del servidor: red caída o servidor inalcanzable
  if (
    ((e.name === 'AuthRetryableFetchError' || e.name === 'FunctionsFetchError') && (status === undefined || status === 0)) ||
    status === 0 ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_name_not_resolved/.test(texto)
  ) {
    return 'RED_SIN_CONEXION';
  }

  // Supabase Auth
  switch (codigo) {
    case 'invalid_credentials':
      return 'AUTH_CREDENCIALES';
    case 'email_not_confirmed':
      return 'AUTH_CORREO_NO_CONFIRMADO';
    case 'user_banned':
      return 'AUTH_CUENTA_BLOQUEADA';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return 'AUTH_DEMASIADOS_INTENTOS';
    case 'user_already_exists':
    case 'email_exists':
      return 'AUTH_CORREO_REGISTRADO';
    case 'weak_password':
      return 'AUTH_CLAVE_DEBIL';
    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'AUTH_REGISTRO_DESHABILITADO';
    case 'session_expired':
    case 'session_not_found':
    case 'refresh_token_not_found':
    case 'bad_jwt':
    case 'PGRST301':
      return 'AUTH_SESION_EXPIRADA';
  }

  if (/invalid login credentials/.test(texto)) return 'AUTH_CREDENCIALES';
  if (/email not confirmed/.test(texto)) return 'AUTH_CORREO_NO_CONFIRMADO';
  if (/user is banned/.test(texto)) return 'AUTH_CUENTA_BLOQUEADA';
  if (/user already registered/.test(texto)) return 'AUTH_CORREO_REGISTRADO';
  if (/jwt expired|session.*expired/.test(texto)) return 'AUTH_SESION_EXPIRADA';
  if (/invalid api key|no api key|apikey/.test(texto)) return 'CONFIGURACION_INVALIDA';

  // PostgreSQL / PostgREST
  switch (codigo) {
    case '42501':
      return 'PERMISO_DENEGADO';
    case '23505':
      if (texto.includes('uq_solicitud_pendiente') || texto.includes('solicitud')) return 'SOLICITUD_DUPLICADA';
      if (texto.includes('uq_asignatura') || texto.includes('asignatura')) return 'ASIGNATURA_DUPLICADA';
      if (texto.includes('uq_grupo') || texto.includes('grupo')) return 'GRUPO_DUPLICADO';
      return 'REGISTRO_DUPLICADO';
    case '23514':
      if (texto.includes('ya fue resuelta')) return 'SOLICITUD_YA_RESUELTA';
      if (texto.includes('responsable')) return 'RESPONSABLE_INVALIDO';
      return 'DATOS_INVALIDOS';
    case '23503':
    case '22P02':
    case '23502':
      return 'DATOS_INVALIDOS';
    case 'P0002':
    case 'PGRST116':
      return 'NO_ENCONTRADO';
    // tabla o vista inexistente (p. ej. falta ejecutar una migración): no se le explica al usuario
    case '42P01':
    case 'PGRST205':
    case 'PGRST200':
    case 'PGRST202':
      return 'SERVICIO_NO_DISPONIBLE';
  }

  // Errores de infraestructura de PostgreSQL / PostgREST. La librería de datos NO incluye el estado HTTP
  // dentro del error, solo su código: 08 (conexión), 53 (recursos), 54, 55, 57 (cancelada/apagado),
  // 58 (sistema), XX (error interno) y PGRST000-003 (sin conexión a la base de datos o esquema no cargado).
  if (/^(08|53|54|55|57|58|XX)/.test(codigo) || /^PGRST00[0-3]$/.test(codigo)) return 'SERVICIO_NO_DISPONIBLE';

  // Estado HTTP
  if (status === 429) return 'AUTH_DEMASIADOS_INTENTOS';
  if (status === 401) return 'AUTH_SESION_EXPIRADA';
  if (status === 403) return 'PERMISO_DENEGADO';
  if (status === 404) return 'NO_ENCONTRADO';
  if (status !== undefined && status >= 500) return 'SERVICIO_NO_DISPONIBLE';

  return 'ERROR_INTERNO';
}

/**
 * Deja el detalle técnico en la consola, para soporte. No incluye datos personales ni contraseñas:
 * solo el código interno y el error original tal como lo entregó la librería.
 */
export function registrarError(codigo: CodigoError, original: unknown): void {
  console.error(`[${codigo}]`, original);
}

/** Convierte cualquier error en un `ErrorApp` (su `message` es la glosa) y registra el detalle técnico. */
export function aErrorApp(error: unknown, porDefecto: CodigoError = 'ERROR_INTERNO', codigoServidor?: string): ErrorApp {
  if (error instanceof ErrorApp) return error;

  let codigo = clasificarError(error, codigoServidor);
  if (codigo === 'ERROR_INTERNO') codigo = porDefecto;

  registrarError(codigo, error);
  return new ErrorApp(codigo, { detalleTecnico: error });
}

/** Atajo para las pantallas: devuelve solo la glosa lista para mostrar. */
export function glosaDe(error: unknown, porDefecto: CodigoError = 'ERROR_INTERNO'): string {
  return aErrorApp(error, porDefecto).message;
}

/**
 * Para respuestas de Edge Functions: lee `{ code, message }` del cuerpo del error (si lo trae) y devuelve
 * el `ErrorApp` correspondiente. El `message` del servidor no se muestra: se muestra la glosa del catálogo.
 */
export async function errorDeFuncion(error: unknown, datos?: { code?: string; message?: string } | null, porDefecto: CodigoError = 'ERROR_INTERNO'): Promise<ErrorApp> {
  let cuerpo: { code?: string; message?: string } | null = datos ?? null;

  if (!cuerpo && error && typeof error === 'object' && 'context' in error) {
    try {
      cuerpo = await (error as { context: Response }).context.json();
    } catch {
      cuerpo = null; // sin cuerpo JSON legible
    }
  }

  const codigoServidor = cuerpo?.code;
  const errorConTexto = cuerpo?.message ? { message: cuerpo.message } : error;
  let codigo = clasificarError(errorConTexto, codigoServidor === 'accion_invalida' ? 'accion_invalida' : codigoServidor);

  // Códigos de servidor que dependen del texto (p. ej. accion_invalida)
  if (codigoServidor === 'accion_invalida') {
    const texto = (cuerpo?.message ?? '').toLowerCase();
    codigo = texto.includes('único administrador') ? 'ADMIN_UNICO_NO_DESACTIVABLE' : texto.includes('propia cuenta') ? 'AUTODESACTIVACION' : 'DATOS_INVALIDOS';
  }
  if (codigo === 'ERROR_INTERNO') codigo = porDefecto;

  registrarError(codigo, { codigoServidor, mensajeServidor: cuerpo?.message, original: error });
  return new ErrorApp(codigo, { detalleTecnico: cuerpo ?? error });
}
