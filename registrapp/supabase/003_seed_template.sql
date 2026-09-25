-- Registrapp — Semanas 1-2 — Datos de prueba (plantilla)
--
-- No se puede crear un usuario de Supabase Auth solo con SQL (la contraseña
-- se maneja aparte). Por eso el orden es:
--
--   1. Crea los usuarios de prueba en Supabase Studio -> Authentication -> Users
--      -> "Add user" (email + password), UNO por cada fila de la tabla de abajo.
--   2. Copia el UUID que Supabase le asigna a cada uno (columna "User UID").
--   3. Reemplaza los placeholders <UUID_...> de este archivo por esos UUID reales.
--   4. Ejecuta este archivo completo en el SQL Editor.
--
-- Usuarios de prueba sugeridos:
--   admin@registrapp.test        -> administrador
--   responsable@registrapp.test  -> responsable
--   miembro1@registrapp.test     -> miembro
--   miembro2@registrapp.test     -> miembro
--   miembro3@registrapp.test     -> miembro

-- 1. Institución
insert into instituciones (id, nombre, tipo)
values ('11111111-1111-1111-1111-111111111111', 'Colegio Demo Registrapp', 'educativa');

-- 2. Grupo (sin responsable todavía, se asigna en el paso 4)
insert into grupos (id, institucion_id, nombre)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '4to Medio A');

-- 3. Usuarios (reemplaza cada <UUID_...> por el id real de auth.users)
insert into usuarios (id, institucion_id, grupo_id, nombre_completo, rol) values
  ('<UUID_ADMIN>',        '11111111-1111-1111-1111-111111111111', null,                                   'Admin Demo',        'administrador'),
  ('<UUID_RESPONSABLE>',  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Responsable Demo',  'responsable'),
  ('<UUID_MIEMBRO_1>',    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Miembro Uno',       'miembro'),
  ('<UUID_MIEMBRO_2>',    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Miembro Dos',       'miembro'),
  ('<UUID_MIEMBRO_3>',    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Miembro Tres',      'miembro');

-- 4. Ahora que el usuario responsable existe, se lo asigna como responsable del grupo.
update grupos
set responsable_id = '<UUID_RESPONSABLE>'
where id = '22222222-2222-2222-2222-222222222222';

-- Para probar el aislamiento entre instituciones (checklist de la semana 1-2):
-- repite este archivo con una segunda institución y usuarios distintos,
-- inicia sesión con un usuario de cada institución y confirma que uno no ve
-- los datos del otro.
