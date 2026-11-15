# Cómo conectar registrApp a un proyecto de Supabase

Guía paso a paso para dejar la app funcionando contra **tu propio** proyecto de Supabase.
Sirve tanto para un proyecto nuevo como para cambiar de proyecto más adelante.

> **Resumen rápido:** la app solo necesita dos datos de Supabase, la **URL del proyecto** y la
> **clave pública** (publishable / anon). Se pegan en los archivos de la carpeta
> [`src/environments/`](src/environments/). Todo lo demás (tablas, usuarios, funciones) se prepara
> en Supabase con los archivos de la carpeta [`supabase/`](supabase/).

---

## 1. Dónde se cambian las variables de entorno

La app lee la configuración de dos archivos. **Hay que actualizar los dos** si quieres que
desarrollo y producción apunten al mismo proyecto.

| Archivo | Cuándo se usa | Comando que lo usa |
|---|---|---|
| [`src/environments/environment.development.ts`](src/environments/environment.development.ts) | Desarrollo local | `npm start` / `ng serve` |
| [`src/environments/environment.ts`](src/environments/environment.ts) | Producción | `ng build` (y todo lo que se publique) |

Angular reemplaza `environment.ts` por `environment.development.ts` solo en la configuración de
desarrollo (ver `fileReplacements` en [`angular.json`](angular.json)).

Cada archivo tiene esta forma:

```ts
export const environment = {
  production: false,                       // true solo en environment.ts
  devRolFalso: null,                       // ver sección 9; déjalo en null
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabaseKey: 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx'
};
```

| Variable | Qué es | De dónde sale |
|---|---|---|
| `supabaseUrl` | Dirección de tu proyecto | Supabase → **Project Settings → API → Project URL** |
| `supabaseKey` | Clave **pública** del proyecto | Supabase → **Project Settings → API Keys → publishable** (o la `anon public` en proyectos antiguos) |
| `devRolFalso` | Sesión simulada solo para diseñar el front | No viene de Supabase. Debe quedar en `null` |

⚠️ **Nunca** pegues aquí la clave `service_role` ni la `secret`. Esas dan acceso total a la base de
datos y no deben estar en el código del navegador. La clave *publishable* sí es segura en el
front, porque la protección real la ponen las políticas RLS de las tablas.

---

## 2. Crear el proyecto en Supabase

1. Entra a <https://supabase.com/dashboard> y crea un proyecto nuevo (**New project**).
2. Ponle un nombre, elige una región cercana y guarda la **contraseña de la base de datos**
   (Supabase no la vuelve a mostrar).
3. En las opciones de seguridad de la creación, deja marcadas **Enable Data API** y
   **Automatically expose new tables**. Los scripts de este proyecto no hacen `grant` explícito de
   las tablas y dependen de que Supabase les dé permisos por defecto a los usuarios autenticados.
   La seguridad real la ponen las políticas RLS que crean los scripts.
4. Espera a que el estado del proyecto sea **Healthy** (1 o 2 minutos).

El identificador del proyecto aparece en su URL: `https://<identificador>.supabase.co`.

## 3. Ajustes de autenticación (opcional, recomendado en pruebas)

En **Authentication → Sign In / Providers → Email**, desactiva **Confirm email** si quieres poder
registrarte desde `/registro` sin necesitar un correo real. Guarda los cambios.

## 4. Crear las tablas y reglas de seguridad

1. En Supabase abre **SQL Editor → New query**.
2. Abre [`supabase/setup_nuevo_proyecto.sql`](supabase/setup_nuevo_proyecto.sql), copia **todo** el contenido, pégalo y pulsa **Run**.
3. Debe terminar en **Success**.

Ese archivo reúne el esquema base, las políticas RLS, las funciones de seguridad, el realtime, las
vistas de reportes y las asignaturas.

> ❗ Ejecútalo **una sola vez** en un proyecto vacío. Si lo repites verás
> `relation "instituciones" already exists`; no rompe nada (el editor revierte todo), pero no
> hace falta.

**Si ya tenías el proyecto armado antes del 12-11-2026**, no repitas el archivo grande. Ejecuta, una
por una y en este orden, solo estas migraciones:

1. [`20261112_09_reportes_por_asignatura.sql`](supabase/migrations/20261112_09_reportes_por_asignatura.sql):
   sin ella Reportes no puede filtrar ni desglosar por asignatura.
2. [`20261112_10_solicitudes_asignatura.sql`](supabase/migrations/20261112_10_solicitudes_asignatura.sql):
   crea las solicitudes de asignaturas (el profesor pide, el administrador aprueba o rechaza). Sin ella,
   las pantallas de Solicitudes no funcionan.
3. [`20261112_11_solicitudes_consultas.sql`](supabase/migrations/20261112_11_solicitudes_consultas.sql):
   agrega los mensajes del profesor al administrador y las respuestas. Se puede ejecutar aunque ya hayas
   ejecutado la 10. Sin ella, los mensajes y las respuestas no funcionan.
4. [`20261114_12_geolocalizacion.sql`](supabase/migrations/20261114_12_geolocalizacion.sql):
   agrega la verificación de ubicación (proximidad a la sede o exacta en la sala). Sin ella, esa
   sección de la pantalla Institución avisa que falta. Para dejar configurada la sede Alameda de
   Duoc UC, ejecuta después [`setup_geolocalizacion_alameda.sql`](supabase/setup_geolocalizacion_alameda.sql).
   La verificación se aplica al registrar asistencia, así que también requiere publicar las Edge Functions.

## 5. Crear tu usuario administrador

Un usuario necesita dos cosas: existir en **Auth** (correo + contraseña) y tener una fila en la
tabla `usuarios` con su rol.

1. **Authentication → Users → Add user → Create new user**. Escribe tu correo y una contraseña, y
   marca **Auto Confirm User**.
2. Abre [`supabase/setup_admin.sql`](supabase/setup_admin.sql) y cambia el correo de la línea
   `v_email` por el que acabas de crear. Opcionalmente cambia el nombre del administrador.
3. Pega el contenido en una consulta nueva del SQL Editor y pulsa **Run**.

Qué hace: crea la institución de prueba "Colegio Demo Registrapp" y deja a tu usuario como
**administrador** de ella.

Para comprobarlo:

```sql
select u.email, u.rol, i.nombre as institucion
from public.usuarios u left join public.instituciones i on i.id = u.institucion_id;
```

Debe aparecer tu correo con rol `administrador`.

### 5.1 Usuarios de ejemplo para ver todos los perfiles (opcional)

Para entrar como profesor (o jefe de área) y como alumno (o empleado), y para que el Dashboard y
Reportes tengan datos, ejecuta
[`supabase/setup_usuarios_demo.sql`](supabase/setup_usuarios_demo.sql) después del paso 5.

1. Revisa las dos variables de arriba del script: el correo de tu administrador y la contraseña
   de los usuarios de ejemplo (por defecto `Demo12345`; cámbiala si quieres).
2. Pégalo en el SQL Editor y pulsa **Run**.

Crea, dentro de la institución de tu administrador (educativa o empresa, según cómo la creaste):

| Institución educativa | Empresa | Rol |
|---|---|---|
| `profesor@registrapp.cl` | `jefe@registrapp.cl` | Responsable |
| `alumno1@registrapp.cl` … `alumno4@registrapp.cl` | `empleado1@registrapp.cl` … `empleado4@registrapp.cl` | Miembro |

Todos con la contraseña de la variable. También crea un curso (o departamento), dos asignaturas (solo
en educativas) y 10 clases terminadas con asistencias, y se puede ejecutar más de una vez sin duplicar
nada.

> Los usuarios se crean con SQL directamente en Auth. Es un atajo pensado para pruebas y no necesita
> las Edge Functions. Si en el futuro Supabase cambia el esquema interno de `auth`, el script
> podría necesitar ajustes. En ese caso, crea los usuarios con **Add user** y usa
> `setup_admin.sql` como referencia para su fila en `usuarios`.

## 6. Pegar URL y clave en los archivos de entorno

1. En Supabase: **Project Settings → API** (URL) y **API Keys** (clave publishable).
2. Edita **los dos** archivos de la sección 1 con esos valores.
3. Guarda. Si `ng serve` está corriendo, recompila solo.

Para cambiar de proyecto en el futuro basta repetir este paso con la nueva URL y clave.

## 7. Publicar las funciones (Edge Functions)

Las siguientes acciones **no funcionan** hasta publicar las 5 funciones de
[`supabase/functions/`](supabase/functions/): crear usuarios, crear la institución desde el
onboarding, iniciar y cerrar sesiones de asistencia, y registrar asistencia por QR.

Con el login, el dashboard y los reportes (lectura) no hace falta.

Necesitas la [CLI de Supabase](https://supabase.com/docs/guides/cli) (puedes usarla con `npx`):

```bash
npx supabase login                                    # abre el navegador para autorizar
npx supabase link --project-ref <identificador>       # te pide la contraseña de la base de datos
npx supabase functions deploy crear-institucion
npx supabase functions deploy crear-usuario
npx supabase functions deploy actualizar-usuario
npx supabase functions deploy sesion-asistencia
npx supabase functions deploy registrar-asistencia
```

Antes, cambia `project_id` en [`supabase/config.toml`](supabase/config.toml) por el
identificador de tu proyecto (hoy apunta al proyecto original).

Las funciones usan la `service_role` internamente, pero Supabase se la entrega automáticamente: no
tienes que configurarla a mano ni ponerla en el código.

## 8. Probar que todo funciona

```bash
npm install        # solo la primera vez
npm start          # abre http://localhost:4200
```

1. Entra a `http://localhost:4200/login` con el correo y la contraseña del paso 5.
2. Debe llevarte a `/admin/dashboard`.
3. Si ya publicaste las funciones, crea un curso y un usuario para probarlas.

Si ya tenías una sesión abierta, el login te llevará directo al panel (Supabase guarda la sesión en
el navegador). Para ver el login, cierra sesión o usa una ventana de incógnito.

## 9. Sesión simulada para diseñar el front (opcional)

Para trabajar el diseño sin credenciales, la app puede simular un usuario con datos ficticios que
viven solo en memoria (carpeta [`src/app/core/dev/`](src/app/core/dev/)). No se conecta a Supabase.

- **Activar sin tocar archivos:** abre la consola del navegador (F12) y ejecuta
  `localStorage.setItem('devRolFalso','administrador'); location.reload()`
  (también sirve `'responsable'` o `'miembro'`).
- **Desactivar:** `localStorage.removeItem('devRolFalso'); location.reload()`.
- **Ver la app como empresa** (departamentos, empleados, jornadas, sin asignaturas):
  `localStorage.setItem('devTipo','corporativa'); location.reload()`. Para volver a institución
  educativa: `localStorage.removeItem('devTipo'); location.reload()`.
- **Activar para todos los arranques:** poner un rol en `devRolFalso` de
  `environment.development.ts`. No lo dejes así al compartir el código.

En producción esta función nunca se activa (`environment.ts` y `production: true`).

## 10. Variables de las pruebas E2E (Playwright)

Solo si vas a correr `npm run e2e`. Copia [`.env.e2e.example`](.env.e2e.example) a `.env.e2e` y
completa:

| Variable | Qué es |
|---|---|
| `SUPABASE_URL` | La URL del proyecto (la misma de `supabaseUrl`) |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave `service_role`. **Es secreta**: solo para tu máquina, jamás se sube al repositorio |
| `E2E_BASE_URL` | Opcional. Si no se define, Playwright levanta `ng serve` en `localhost:4300` |

---

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Invalid API key` | La clave está mal copiada (un carácter de más o de menos) | Vuelve a copiarla con el botón de copiar del dashboard y pégala completa |
| Tras el login aparece **"Crea tu institución"** | Tu usuario existe en Auth pero no tiene fila en `usuarios` | Ejecuta `setup_admin.sql` con el correo correcto |
| Ese formulario dice "Ocurrió un error" | La función `crear-institucion` no está publicada | Sección 7 |
| `Correo o contraseña incorrectos` | Error de tecleo, o el usuario se creó con otro correo | Revisa **Authentication → Users** |
| `relation "instituciones" already exists` | Ejecutaste `setup_nuevo_proyecto.sql` dos veces | No hace falta repetirlo; ejecuta solo `setup_admin.sql` |
| `permission denied for table …` al consultar sin sesión | Es lo esperado: RLS niega el acceso anónimo | Inicia sesión |
| Reportes no muestra asignaturas | Falta la migración `20261112_09` | Sección 4 |
| Las pantallas de Solicitudes dan error | Falta la migración `20261112_10` o `20261112_11` | Sección 4 |
| Un build de producción usa el proyecto equivocado | `environment.ts` sin actualizar | Sección 1 y 6 |
| `localhost:4200` te lleva directo al dashboard | Hay una sesión guardada en el navegador | Cerrar sesión o ventana de incógnito |

## Checklist final

- [ ] Proyecto creado y en estado Healthy
- [ ] `setup_nuevo_proyecto.sql` ejecutado (o solo la migración 09 si el proyecto ya existía)
- [ ] Usuario creado en Auth y `setup_admin.sql` ejecutado con su correo
- [ ] `supabaseUrl` y `supabaseKey` actualizados en **`environment.development.ts`** y **`environment.ts`**
- [ ] `project_id` actualizado en `supabase/config.toml`
- [ ] Las 5 funciones publicadas
- [ ] `devRolFalso` en `null`
- [ ] Login probado en `http://localhost:4200/login`
