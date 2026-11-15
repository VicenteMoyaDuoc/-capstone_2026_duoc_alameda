# Catálogo de rechazos y errores

> Generado a partir de [`catalogo-errores.ts`](src/app/core/errores/catalogo-errores.ts), que es la **fuente de verdad**.
> Si cambias una glosa o agregas un código allí, actualiza esta tabla.

## Cómo funciona

1. **El usuario solo ve la glosa.** Los mensajes técnicos (de Supabase, PostgreSQL, la red o las Edge Functions) nunca llegan a la pantalla.
2. Todo error se **clasifica** en un código interno (`clasificarError`) y se convierte en un `ErrorApp`, cuyo `message` *es* la glosa. Mostrar `error.message` en una pantalla ya no puede filtrar detalles técnicos.
3. El detalle técnico queda **solo en la consola** del navegador como `[CODIGO] error original`, para soporte. No incluye contraseñas ni datos personales.
4. Las pantallas usan un atajo: `glosaDe(error)` devuelve el texto listo para mostrar.

```ts
try {
  await servicio.hacerAlgo();
} catch (error) {
  this.mensaje.set(glosaDe(error)); // solo la glosa
}
```

Para respuestas de las Edge Functions (`{ ok: false, code, message }`) se usa `errorDeFuncion`: se toma el `code` del servidor y se muestra la glosa del catálogo, **no** el `message` del servidor.

## Agregar un error nuevo

1. Sumar el código a `CodigoError` y su entrada a `CATALOGO` (categoría, glosa, si es reintentable).
2. Enseñarle a `clasificarError` cuándo aplica (código de Postgres, de Supabase Auth, estado HTTP o texto).
3. Agregar un caso en [`catalogo-errores.spec.ts`](src/app/core/errores/catalogo-errores.spec.ts).

Una prueba automática verifica que **ninguna glosa contenga jerga técnica** (supabase, postgres, jwt, rls, sql, token, uuid…).

## Inicio de sesión idempotente

Repetir el *mismo* inicio de sesión no produce efectos repetidos ([`auth.service.ts`](src/app/core/services/auth.service.ts)):

| Situación | Qué pasa |
|---|---|
| Doble clic o Enter repetido mientras el primer intento sigue en curso | Una sola llamada al servidor; ambos reciben el mismo resultado |
| Repetir el mismo inicio de sesión exitoso dentro de 3 s | Devuelve el resultado ya obtenido, sin crear otra sesión |
| Mismas credenciales con el correo en otras mayúsculas o con espacios | Se trata como el mismo intento (el correo se normaliza) |
| Credenciales distintas | Cada una llama al servidor; nunca se mezclan |
| Una contraseña incorrecta tras haber entrado con otra | Siempre se rechaza: no se reutiliza un éxito anterior con otra contraseña |
| Intento fallido | **No se guarda:** el usuario puede corregir y reintentar |
| 5 contraseñas incorrectas seguidas | Bloqueo del formulario por 30 s, sin llamar al servidor (`AUTH_BLOQUEO_TEMPORAL`) |

Las credenciales no se retienen en memoria: el intento se identifica con una huella (hash) del correo y la contraseña.
El bloqueo temporal es solo una ayuda de la interfaz: la protección real contra fuerza bruta la hace el límite de intentos de Supabase.

## Autenticación y cuenta

| Código | Glosa (lo que ve el usuario) | Cuándo ocurre | ¿Reintentable? |
|---|---|---|---|
| `AUTH_CREDENCIALES` | Correo o contraseña incorrectos. | Contraseña incorrecta o correo que no existe. Es la misma glosa en ambos casos, para no revelar si el correo está registrado | Sí |
| `AUTH_CORREO_NO_CONFIRMADO` | Tu correo aún no está confirmado. Revisa tu bandeja de entrada. | La cuenta existe pero su correo no se confirmó | No |
| `AUTH_CUENTA_BLOQUEADA` | Tu cuenta está bloqueada. Contacta a tu administrador. | Supabase marcó al usuario como bloqueado (`banned`) | No |
| `AUTH_CUENTA_DESACTIVADA` | Tu cuenta está desactivada. Contacta a tu administrador. | El administrador desactivó la cuenta (`usuarios.activo = false`) | No |
| `AUTH_DEMASIADOS_INTENTOS` | Demasiados intentos. Espera unos minutos e inténtalo de nuevo. | El servidor limitó las peticiones (HTTP 429) | Sí |
| `AUTH_BLOQUEO_TEMPORAL` | Demasiados intentos fallidos. Espera {segundos} segundos e inténtalo de nuevo. | La propia app: 5 contraseñas incorrectas seguidas bloquean el formulario 30 s (se duplica en cada tanda, tope 5 min) | Sí |
| `AUTH_SESION_EXPIRADA` | Tu sesión expiró. Vuelve a iniciar sesión. | La sesión caducó o el token ya no es válido | No |
| `AUTH_PERFIL_NO_VERIFICABLE` | No pudimos verificar tu cuenta. Revisa tu conexión e intenta de nuevo. | La contraseña fue correcta, pero falló la consulta del perfil del usuario | Sí |
| `AUTH_YA_TIENE_INSTITUCION` | Tu cuenta ya pertenece a una institución. | Intentó crear una institución teniendo ya una | No |
| `AUTH_CORREO_REGISTRADO` | Ese correo ya está registrado. | Al crear un usuario o registrarse con un correo ya usado | No |
| `AUTH_CLAVE_DEBIL` | La contraseña no cumple los requisitos de seguridad. Elige una más larga y variada. | La contraseña no cumple la política de Supabase | No |
| `AUTH_REGISTRO_DESHABILITADO` | El registro de cuentas no está disponible por ahora. | El proyecto de Supabase tiene desactivados los registros | No |

## Conexión y servicio

| Código | Glosa (lo que ve el usuario) | Cuándo ocurre | ¿Reintentable? |
|---|---|---|---|
| `RED_SIN_CONEXION` | No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo. | No hay internet o el servidor no responde | Sí |
| `SERVICIO_NO_DISPONIBLE` | El servicio no está disponible por el momento. Intenta de nuevo en unos minutos. | Error 5xx del servidor; error interno de la base de datos (códigos de PostgreSQL 08, 53, 54, 55, 57, 58, XX o PGRST000-003); o falta una tabla o migración | Sí |
| `CONFIGURACION_INVALIDA` | El servicio no está disponible por el momento. Intenta de nuevo en unos minutos. | Clave de API o URL de Supabase incorrectas. Se muestra la misma glosa que "servicio no disponible": una mala configuración no se le explica al usuario | No |
| `ERROR_INTERNO` | Ocurrió un error. Intenta nuevamente. | Cualquier error que no se pudo clasificar | Sí |

## Permisos

| Código | Glosa (lo que ve el usuario) | Cuándo ocurre | ¿Reintentable? |
|---|---|---|---|
| `PERMISO_DENEGADO` | No tienes permiso para realizar esta acción. | La seguridad de la base de datos (RLS) o una función niega la acción | No |

## Datos

| Código | Glosa (lo que ve el usuario) | Cuándo ocurre | ¿Reintentable? |
|---|---|---|---|
| `NO_ENCONTRADO` | No encontramos lo que buscabas. Puede que ya no exista. | El registro pedido ya no existe | No |
| `DATOS_INVALIDOS` | Revisa los datos ingresados. | Un dato no cumple una regla (largo, formato, referencia) | No |
| `REGISTRO_DUPLICADO` | Ya existe un registro igual. | Duplicado sin una regla de negocio más específica | No |

## Reglas del negocio

| Código | Glosa (lo que ve el usuario) | Cuándo ocurre | ¿Reintentable? |
|---|---|---|---|
| `SOLICITUD_DUPLICADA` | Ya enviaste una solicitud igual que sigue pendiente. | El profesor ya tiene una solicitud pendiente igual | No |
| `SOLICITUD_YA_RESUELTA` | Esta solicitud ya fue resuelta. | El administrador intentó resolver una solicitud que ya estaba aprobada o rechazada | No |
| `ASIGNATURA_DUPLICADA` | Ya existe una asignatura con ese nombre en el curso. | Ya hay una asignatura con ese nombre en el curso | No |
| `GRUPO_DUPLICADO` | Ya existe un curso o departamento con ese nombre. | Ya hay un curso o departamento con ese nombre | No |
| `RESPONSABLE_INVALIDO` | El responsable elegido no es válido: debe ser un profesor activo de la misma institución. | El responsable no es un profesor activo de la misma institución | No |
| `ADMIN_UNICO_NO_DESACTIVABLE` | No puedes desactivar al único administrador de la institución. | Intento de desactivar al único administrador | No |
| `AUTODESACTIVACION` | No puedes desactivar tu propia cuenta. | El administrador intentó desactivar su propia cuenta | No |
| `USUARIO_NO_ENCONTRADO` | El usuario indicado no existe. | El usuario indicado no existe | No |

## Códigos que devuelven las Edge Functions

| Código del servidor | Código del catálogo |
|---|---|
| `correo_duplicado` | `AUTH_CORREO_REGISTRADO` |
| `demasiados_intentos` | `AUTH_DEMASIADOS_INTENTOS` |
| `datos_invalidos`, `grupo_inactivo`, `grupo_invalido`, `asignatura_inactiva` | `DATOS_INVALIDOS` |
| `no_autenticado` | `AUTH_SESION_EXPIRADA` |
| `no_autorizado`, `sin_permiso` | `PERMISO_DENEGADO` |
| `no_encontrado`, `no_encontrada` | `NO_ENCONTRADO` |
| `ya_tiene_institucion` | `AUTH_YA_TIENE_INSTITUCION` |
| `accion_invalida` | `ADMIN_UNICO_NO_DESACTIVABLE`, `AUTODESACTIVACION` o `DATOS_INVALIDOS`, según el caso |
| `error_interno`, `json_invalido`, `metodo_no_permitido` | `ERROR_INTERNO` |

## Fuera del catálogo

El registro de asistencia por QR (`AsistenciaError`) tiene sus propios códigos y textos (QR vencido, fuera de horario, ubicación requerida o imprecisa, fuera de la sede o de la sala, etc.), que muestra la pantalla de resultado de asistencia. Las pantallas de registro, recuperar y restablecer contraseña conservan sus mensajes propios.
