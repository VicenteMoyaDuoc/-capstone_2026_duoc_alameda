# Registro de cambios — registrApp

Resumen de todo lo que se hizo en el proyecto durante este trabajo (noviembre de 2026).
Para conectar la app a Supabase, ver [`CONECTAR-SUPABASE.md`](CONECTAR-SUPABASE.md).

---

## 1. Base de datos y Supabase

Se creó un proyecto de Supabase nuevo (`prueba-registrApp`) y se dejó la app apuntando a él en
desarrollo.

| Archivo | Qué es |
|---|---|
| [`supabase/setup_nuevo_proyecto.sql`](supabase/setup_nuevo_proyecto.sql) | **Nuevo.** Un solo script con todo el esquema: tablas base, RLS, funciones de seguridad, realtime, vistas de reportes y asignaturas, más la migración de reportes por asignatura. Para un proyecto vacío |
| [`supabase/setup_admin.sql`](supabase/setup_admin.sql) | **Nuevo.** Crea la institución de prueba y deja a un usuario de Auth como administrador |
| [`supabase/setup_usuarios_demo.sql`](supabase/setup_usuarios_demo.sql) | **Nuevo.** Crea usuarios de ejemplo (profesor o jefe de área y 4 alumnos o empleados), un curso o departamento, asignaturas y 10 clases con asistencias, para ver todos los perfiles con datos |
| [`supabase/migrations/20261112_09_reportes_por_asignatura.sql`](supabase/migrations/20261112_09_reportes_por_asignatura.sql) | **Nuevo.** Agrega la asignatura a `v_asistencia_detalle` y crea `v_resumen_asignatura` |
| [`src/environments/environment.development.ts`](src/environments/environment.development.ts) | URL y clave del proyecto nuevo. Se agregó `devRolFalso` |
| [`src/environments/environment.ts`](src/environments/environment.ts) | Se agregó `devRolFalso: null`. **La URL sigue apuntando al proyecto original** |

## 2. Herramientas para diseñar sin credenciales

- **Sesión simulada + datos ficticios** en [`src/app/core/dev/`](src/app/core/dev/):
  - [`dev-datos.ts`](src/app/core/dev/dev-datos.ts): institución, 3 cursos, 8 asignaturas, profesores, alumnos, sesiones y asistencias de ejemplo.
  - [`supabase-fake.ts`](src/app/core/dev/supabase-fake.ts): cliente de Supabase falso, en memoria.
- Se activa con `localStorage.setItem('devRolFalso','administrador')` en la consola del navegador (también `'responsable'` o `'miembro'`), o con `devRolFalso` en `environment.development.ts`. **Nunca se activa en producción.**
- Para ver la app como **empresa**: `localStorage.setItem('devTipo','corporativa')` y recargar (departamentos, empleados y jornadas, sin asignaturas). Para volver: `localStorage.removeItem('devTipo')`.
- Cambios mínimos en [`auth.service.ts`](src/app/core/services/auth.service.ts) y [`supabase.service.ts`](src/app/core/services/supabase.service.ts) para usarlo.

## 3. Dashboard rediseñado

[`src/app/features/admin/dashboard/`](src/app/features/admin/dashboard/)

- Widgets en grilla de 12 columnas: asistencia (30 días) con barra contra la meta de 85 %, cuatro indicadores, **gráfico de línea** (tendencia diaria), **barra de distribución** puntual/tardanza/ausente con tabla, **barras verticales** por día de la semana, **barras apiladas** por curso y tabla de cursos.
- Responsivo según el ancho del propio panel; en móvil los indicadores van de a dos y los gráficos se apilan.
- Gráficos en SVG/CSS puro: no se agregó ninguna librería.
- Accesible: etiquetas con texto además del color, tablas ocultas para lectores de pantalla, foco por teclado en los gráficos.

## 4. Estilo cuadrado y profesional en todo el panel

- [`styles.scss`](src/styles.scss): radios de 2 px, sin sombras, clases reutilizables `.panel`, `.panel-cab` y `.panel-cuerpo`, títulos unificados. Ajustes de PrimeNG (paginador cuadrado, pestañas sobrias, tablas sin partir texto y con scroll propio).
- [`app.config.ts`](src/app/app.config.ts): el tema de PrimeNG usa bordes de 2 px.
- **Menú lateral** ([`admin-layout`](src/app/features/admin/admin-layout/)): cuadrado, de orilla a orilla, 232 px de ancho, tarjeta de usuario al pie sin recuadro redondeado.
- **Institución**: pasó de una tarjeta a dos paneles (Datos generales y Configuración de asistencia) de igual altura; el botón Guardar subió al encabezado.
- **Asistencia en vivo y Reportes**: se quitaron los márgenes propios que los desalineaban; los filtros van en una barra con borde y se apilan en móvil.
- **Cursos y Usuarios**: solo recibieron el estilo cuadrado; mantienen su estructura de lista con tabla.
- Se subió el límite de estilos por componente en [`angular.json`](angular.json) (de 3/5 kB a 8/12 kB).

## 5. Marca: logo e imágenes

- **Logo QR** como SVG limpio (basado en el diseño original, solo el QR): [`logo-qr-claro.svg`](public/logo-qr-claro.svg) para fondos claros y [`logo-qr-oscuro.svg`](public/logo-qr-oscuro.svg) para el menú lateral.
- **Favicon** nuevo: [`favicon.svg`](public/favicon.svg) (se mantiene `favicon.ico` de respaldo). Se enlaza en [`index.html`](src/index.html).
- El logo reemplaza al ícono genérico en el menú lateral, el login y el registro.


## 6. Login

[`src/app/features/auth/login/`](src/app/features/auth/login/)

- **Pantalla dividida** en escritorio: a la izquierda la foto del salón con el QR proyectado y una mano escaneándolo, con el logo encima; a la derecha el formulario.
- En móvil y tablet angosta (menos de 820 px) desaparece la foto: queda una cabecera oscura con la marca y el formulario. Probado hasta 280 px de ancho.
- La lógica del login no cambió.
- Las pantallas de **registro, recuperar y restablecer contraseña** conservan su diseño anterior.

## 6.5 Pantallas del alumno y del profesor

[`src/app/features/miembro/`](src/app/features/miembro/) y el marco compartido
[`marco-movil`](src/app/shared/components/marco-movil/), pensadas para el teléfono.

- **Marco común:** cabecera oscura con la marca, el avatar y el botón de salir, saludo dentro de la cabecera y **barra de navegación inferior** (Inicio, Escanear, Historial).
- **Inicio:** "Hola, {nombre}", curso, tarjeta **Tu asistencia** (porcentaje, barra contra la meta de 85 % y presentes, tardanzas y ausencias), botón principal verde "Escanear código QR" y los últimos registros con su estado.
- **Historial:** resumen de cuatro cifras, filtros (Todos, A tiempo, Tardanzas, Ausencias) y la lista con una barra de color por estado y la asignatura de cada clase.
- **Escanear:** tres pasos claros, botón "Abrir cámara" y un visor con esquinas verdes al escanear. La lógica de la cámara no cambió.
- El estilo es cuadrado, como el resto de la app. Las clases `.m-tarjeta` y `.m-pastilla` quedaron en [`styles.scss`](src/styles.scss).
- **Panel del profesor** ([`responsable/panel`](src/app/features/responsable/panel/)): mismo marco y estilo (cabecera oscura con "Hola, {nombre}", tarjetas cuadradas, botón "Iniciar clase" a todo el ancho, QR en tarjeta, últimas clases con pastillas de color). Se agregó una pestaña **Solicitudes**.
- El marco ([`marco-movil`](src/app/shared/components/marco-movil/)) acepta las pestañas como parámetro, así que sirve para ambos roles.

## 6.6 Solicitudes y mensajes (profesor → administrador)

**El administrador puede crear todo directamente:** cursos (*Cursos*), asignaturas (dentro de cada
curso → *Nueva asignatura*), usuarios (*Usuarios → Nuevo usuario*, que necesita la función
`crear-usuario` publicada) y la configuración de la institución.

**El profesor no crea asignaturas por su cuenta: las solicita. Y además puede escribirle al administrador.**
Siempre se elige el **curso** (o departamento), porque un profesor puede dar clases en varios: el selector
muestra todos los suyos.

| Tipo | Qué envía el profesor | Qué hace el administrador |
|---|---|---|
| **Nueva asignatura** (solo instituciones educativas) | Curso + nombre de la asignatura | **Aprueba** (la asignatura se crea sola en ese curso, con el profesor como responsable) o **rechaza**, con un comentario opcional |
| **Mensaje al administrador** (educativas y empresas) | Curso + asunto + mensaje (hasta 600 caracteres) | **Responde** con un texto |

- **Profesor:** `/responsable/solicitudes` (pestaña *Solicitudes*). Abajo, en *Mis solicitudes*, ve el estado de cada una (Pendiente, Aprobada, Rechazada o Respondida) y, debajo, la **respuesta del administrador**. Puede cancelar las pendientes.
- **Administrador:** `/admin/solicitudes` (menú *Solicitudes*, con insignia roja con las pendientes). **La respuesta se escribe justo debajo de cada solicitud**: una caja de texto con "Responder" (mensajes) o "Rechazar / Aprobar" (asignaturas). Pestañas *Pendientes* y *Resueltas*, donde queda guardada cada respuesta.
- Las empresas solo envían mensajes (no tienen asignaturas).
- Base de datos: migraciones [`20261112_10_solicitudes_asignatura.sql`](supabase/migrations/20261112_10_solicitudes_asignatura.sql) y [`20261112_11_solicitudes_consultas.sql`](supabase/migrations/20261112_11_solicitudes_consultas.sql) (tabla `solicitudes` con RLS; funciones `resolver_solicitud()` y `responder_solicitud()`, que solo ejecuta un administrador).
- Código: [`solicitudes.service.ts`](src/app/core/services/solicitudes.service.ts), [`admin/solicitudes`](src/app/features/admin/solicitudes/) y [`responsable/solicitudes`](src/app/features/responsable/solicitudes/).

## 6.7 Catálogo de errores (glosas) e inicio de sesión idempotente

Detalle completo en [`CATALOGO-ERRORES.md`](CATALOGO-ERRORES.md).

- **Catálogo central** ([`catalogo-errores.ts`](src/app/core/errores/catalogo-errores.ts)): 28 códigos internos, cada uno con su glosa en lenguaje claro, categoría y si es reintentable. **El usuario solo ve la glosa:** los mensajes técnicos de Supabase, PostgreSQL, la red o las Edge Functions se clasifican y quedan solo en la consola.
- Se aplicó a todas las pantallas que mostraban el mensaje del servidor tal cual: login, Dashboard, Cursos y asignaturas, Institución, Reportes, Usuarios, onboarding y Solicitudes (profesor y administrador), y a los servicios `administracion`, `reportes` y `solicitudes`.
- **Login con glosas propias:** contraseña incorrecta, correo sin confirmar, cuenta bloqueada, cuenta desactivada, sin conexión, servicio no disponible y demasiados intentos. Un error de configuración (clave de API) no se le explica al usuario.
- **Login idempotente:** doble clic o Enter repetido hacen una sola llamada; repetir un inicio de sesión exitoso en 3 s no crea otra sesión; un intento fallido no se guarda; credenciales distintas nunca se mezclan; y tras 5 contraseñas incorrectas seguidas el formulario se bloquea 30 s.
- **Pruebas automáticas** (53 en total, todas pasan): clasificación de errores, que ninguna glosa contenga jerga técnica, y el comportamiento idempotente del login. Se corrigió además una prueba que ya fallaba antes (simulaba "sin perfil" con un error sin el código `PGRST116`).
- **Logo en la pestaña del navegador:** el ícono de Angular salía porque el navegador prefería el `favicon.ico` original. Se reemplazó por el logo QR (`favicon.ico` con 3 tamaños, `favicon.svg`, `apple-touch-icon.png`).

## 6.8 Verificación de ubicación (sede Alameda de Duoc UC)

Al registrar la asistencia con el QR se puede exigir que el alumno esté en el lugar. Dos modos, elegibles en **Institución → Verificación de ubicación** (además de "Desactivada"):

| Modo | Qué exige | Centro del círculo | Radio por defecto |
|---|---|---|---|
| **Proximidad** | Estar en la sede (el campus) | Las coordenadas de la sede | 300 m |
| **Exacta** | Estar en la sala | Donde estaba el profesor al iniciar la clase | 40 m |

- **Sede Alameda precargada:** Av. España 8, Santiago (-33.4489437, -70.6700844, de OpenStreetMap). El botón "Usar sede Alameda" las carga; "Usar mi ubicación actual" toma el GPS (conviene hacerlo parado en la entrada). El script [`setup_geolocalizacion_alameda.sql`](supabase/setup_geolocalizacion_alameda.sql) deja la institución en modo proximidad con esas coordenadas.
- **La validación la hace el servidor** (Edge Function `registrar-asistencia`), no el navegador. La regla se copia a cada clase al iniciarla, así que cambiar la configuración no altera clases ya abiertas.
- **Proximidad** perdona el error del GPS del alumno (hasta 100 m). **Exacta** no lo perdona y rechaza a quien tenga una señal con más de 35 m de error ("acércate a una ventana e intenta de nuevo"). En exacta, el profesor debe tener el GPS activo al iniciar la clase y estar dentro de la sede.
- **Solo se pide permiso de ubicación cuando la clase lo exige**: la app intenta sin GPS y, si el servidor responde `UBICACION_REQUERIDA`, lee el GPS (esperando hasta 12 s en exacta para que se afine) y repite. En instituciones que no lo usan, el navegador nunca pregunta.
- **Privacidad:** de cada asistencia solo se guarda la distancia al punto y la precisión del GPS; **no se guardan las coordenadas del alumno**.
- Mensajes nuevos: ubicación requerida, ubicación imprecisa y fuera de rango (distinto para sede y sala). Un rechazo por ubicación queda en la auditoría con la distancia.
- Si la sede o el modo no están configurados, **no se bloquea a nadie**. Si la migración 12 no se ha ejecutado, la pantalla Institución avisa y sigue guardando el resto de los datos.
- Base de datos: [`20261114_12_geolocalizacion.sql`](supabase/migrations/20261114_12_geolocalizacion.sql). Código: [`geo.ts`](supabase/functions/_shared/geo.ts) (+ `geo.test.ts`, 17 pruebas), [`ubicacion.service.ts`](src/app/core/services/ubicacion.service.ts), [`asistencia.service.ts`](src/app/core/services/asistencia.service.ts) y la pantalla [`instituciones`](src/app/features/admin/instituciones/).
- **Mapa en la pantalla Institución** ([`mapa-ubicacion`](src/app/shared/mapa-ubicacion/mapa-ubicacion.component.ts)): muestra la sede con su círculo de radio, y un clic en el mapa mueve la sede. Usa **Google Maps JavaScript API** si `googleMapsApiKey` está en `src/environments/environment*.ts`; con la clave vacía, o si Google la rechaza, usa **OpenStreetMap** (Leaflet, con selector Mapa/Satélite) y el mapa nunca queda en blanco. El servidor (`geo.ts` → `datosGeoRespuesta`) entrega la sede y la distancia al alumno solo en proximidad. Para activar Google: en Google Cloud Console crea un proyecto, activa la facturación y "Maps JavaScript API", crea una clave de API, restríngela por dominio (HTTP referrers: `localhost:4200/*` y tu dominio publicado) y a la API "Maps JavaScript API", y pégala en `googleMapsApiKey`. La clave va en el navegador, por eso la restricción por dominio es obligatoria.
- **Mapa para el alumno** (proximidad): al registrar asistencia, el alumno ve una etiqueta «Estás dentro/fuera del rango», la sede con su círculo, un punto verde «Tú» con una línea punteada hacia la sede, y la distancia ("Estás a 127 m del centro de la sede; permitido: 300 m"), tanto si queda dentro como si queda fuera. Fuera del radio no se registra. En modo exacta no se muestra el mapa para no revelar dónde está el profesor. Solo el navegador del alumno conoce su posición: el servidor guarda únicamente la distancia.
- **Probar sin servidor (modo desarrollo):** con `localStorage.setItem('devRolFalso','miembro')` el cliente de prueba simula `registrar-asistencia` con el mismo `geo.ts`. Abre `/asistir#t=DEMO` y cambia el GPS desde DevTools → Sensors → Location.
- **Limitación:** un alumno puede simular su posición con apps de GPS falso y un navegador no puede detectarlo. Esta verificación reduce el fraude, no lo elimina; el QR que rota cada pocos segundos cubre el resto. Solo funciona en HTTPS (o localhost).

## 7. Reportes por asignatura y nuevas vistas

[`src/app/features/admin/reportes/`](src/app/features/admin/reportes/)

- **Filtro de Asignatura** (se filtra según el curso elegido). Solo aparece en cuentas educativas.
- **Cuatro vistas, elegibles con un selector** ("Vista"), que **cambian según el tipo de cuenta**. La última elegida se recuerda en el navegador.

  | Cuenta educativa | Cuenta de empresa |
  |---|---|
  | **Resumen**: cifras generales, ranking por asignatura y asistencia por día | **Resumen**: cifras generales, ranking por departamento y asistencia por día |
  | **Por asignatura**: cada curso con su fila de total y debajo sus asignaturas | **Por departamento**: tabla por departamento |
  | **Por alumno**: cada alumno contra cada asignatura, con su % y el total | **Por empleado**: tabla por empleado |
  | **Detalle**: con la columna Asignatura | **Detalle**: sin columna de asignatura |

  Los textos también cambian (Curso/Departamento, Alumno/Empleado, Clase/Jornada). Se pasó de seis
  pestañas a cuatro vistas: la antigua "Por curso" quedó dentro de "Por asignatura" como fila de
  total de cada curso, y "Persona × asignatura" es ahora "Por alumno".
- **Exportación a Excel y PDF** ([`exportacion.service.ts`](src/app/core/services/exportacion.service.ts)): en cuentas educativas incluye el filtro de asignatura, un resumen por asignatura y la columna Asignatura; en empresas se omiten.
- Cálculos nuevos en [`metricas-asistencia.ts`](src/app/core/utils/metricas-asistencia.ts): `agruparPorAsignatura`, `matrizPersonaAsignatura`, `serieDiaria`. El filtro se envía en [`reportes.service.ts`](src/app/core/services/reportes.service.ts).

---

## Pendientes y cosas que conviene saber

1. **Ejecutar cuatro migraciones en Supabase** (SQL Editor), en este orden:
   [`20261112_09_reportes_por_asignatura.sql`](supabase/migrations/20261112_09_reportes_por_asignatura.sql)
   (sin ella, filtrar por asignatura en Reportes da error) y
   [`20261112_10_solicitudes_asignatura.sql`](supabase/migrations/20261112_10_solicitudes_asignatura.sql)
   (sin ella, las pantallas de Solicitudes no funcionan) y
   [`20261112_11_solicitudes_consultas.sql`](supabase/migrations/20261112_11_solicitudes_consultas.sql)
   (sin ella, no existen los mensajes ni las respuestas) y
   [`20261114_12_geolocalizacion.sql`](supabase/migrations/20261114_12_geolocalizacion.sql)
   (sin ella no existe la verificación de ubicación). Luego, opcional,
   [`setup_geolocalizacion_alameda.sql`](supabase/setup_geolocalizacion_alameda.sql) para dejar la sede Alameda configurada.
2. **Publicar las 5 funciones** de `supabase/functions/`. Sin ellas no funcionan: crear usuarios,
   crear la institución desde el onboarding, iniciar/cerrar sesiones de asistencia y registrar
   asistencia por QR.
3. **`environment.ts` (producción) y `supabase/config.toml`** siguen apuntando al proyecto original
   de Supabase. Hay que actualizarlos antes de publicar.
4. **Cómo se verificó.** El diseño y las vistas nuevas se revisaron con capturas en escritorio, tablet
   y móvil usando los datos ficticios de desarrollo. **No se probó contra datos reales** de tu
   Supabase ni se descargó un Excel o PDF real: la exportación compila, pero conviene probarla
   una vez con datos.
5. `npm install` reportó 83 vulnerabilidades en dependencias (3 críticas). No se tocó nada.
6. `ng build` muestra avisos que ya existían o son esperables: tamaño de estilos del dashboard
   (límite de aviso superado por 2.7 kB), y tres módulos que no son ESM (`pdfmake`, `qrcode`).
   No hay errores.
7. Los datos ficticios de `src/app/core/dev/` quedan incluidos en el código aunque no se usen
   (pesan unos kB). Si se quiere quitarlos del build de producción, es un cambio aparte.
5. **Clave de Google Maps** (`googleMapsApiKey` en `src/environments/`): está restringida a `localhost:4200`. Al publicar la app hay que agregar el dominio en Google Cloud → Credenciales → la clave → Sitios web; sin eso el mapa usa OpenStreetMap. Conviene tener una alerta de presupuesto en Facturación.
