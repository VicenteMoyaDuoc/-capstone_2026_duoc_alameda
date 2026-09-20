-- Registrapp — Semanas 1-2 — Datos de prueba (institución 1, ya aplicado)
--
-- Usuarios creados en Supabase Studio -> Authentication -> Users:
--   admin@registrapp.test        -> administrador -> ebfdd001-cf69-4445-915d-485a058e96cf
--   responsable@registrapp.test  -> responsable   -> 941ff400-3ee5-49a8-b706-ac0d2da7ac0b
--   miembro1@registrapp.test     -> miembro       -> 2af37eee-996c-42f4-b773-c0cafa9cc481
--   miembro2@registrapp.test     -> miembro       -> 57f3f704-9645-49fc-a9ce-4bcda22bf79d
--   miembro3@registrapp.test     -> miembro       -> 7afc86ae-ee1c-4df2-b571-726cfd14bdc8

-- 1. Institución
insert into instituciones (id, nombre, tipo)
values ('11111111-1111-1111-1111-111111111111', 'Colegio Demo Registrapp', 'educativa');

-- 2. Grupo (sin responsable todavía, se asigna en el paso 4)
insert into grupos (id, institucion_id, nombre)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '4to Medio A');

-- 3. Usuarios
insert into usuarios (id, institucion_id, grupo_id, nombre_completo, rol) values
  ('ebfdd001-cf69-4445-915d-485a058e96cf', '11111111-1111-1111-1111-111111111111', null,                                   'Admin Demo',        'administrador'),
  ('941ff400-3ee5-49a8-b706-ac0d2da7ac0b', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Responsable Demo',  'responsable'),
  ('2af37eee-996c-42f4-b773-c0cafa9cc481', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Miembro Uno',       'miembro'),
  ('57f3f704-9645-49fc-a9ce-4bcda22bf79d', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Miembro Dos',       'miembro'),
  ('7afc86ae-ee1c-4df2-b571-726cfd14bdc8', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Miembro Tres',      'miembro');

-- 4. Ahora que el usuario responsable existe, se lo asigna como responsable del grupo.
update grupos
set responsable_id = '941ff400-3ee5-49a8-b706-ac0d2da7ac0b'
where id = '22222222-2222-2222-2222-222222222222';
