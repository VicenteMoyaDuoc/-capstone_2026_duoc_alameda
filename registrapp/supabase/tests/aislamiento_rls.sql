-- Fase 1.4 — Pruebas de aislamiento entre instituciones y roles
-- Ampliadas en la Fase 6.1 con sesiones_asistencia, asistencias y las vistas de reportes.
-- Ampliadas en la Fase 4 (ampliación) con asignaturas por curso: sesiones simultáneas por
-- asignatura, el trigger de integridad del responsable, y el aislamiento entre dos profesores
-- que dictan asignaturas distintas en el mismo curso.
--
-- Ejecutar manualmente en el SQL Editor de Supabase (después de aplicar todas
-- las migraciones). Todo el script corre dentro de una transacción que
-- termina en ROLLBACK: no deja ningún dato de prueba en la base real, sin
-- importar si las pruebas pasan o fallan.

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- ───────────────────────── datos de prueba: 2 instituciones ─────────────────────────

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data)
values
  ('a0000000-0000-0000-0000-00000000000a', 'test-admin-a@rls.test', 'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}'),
  ('a0000000-0000-0000-0000-00000000000b', 'test-resp-a@rls.test',  'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}'),
  ('a0000000-0000-0000-0000-00000000000c', 'test-miem-a@rls.test',  'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}'),
  ('b0000000-0000-0000-0000-00000000000a', 'test-admin-b@rls.test', 'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}'),
  ('b0000000-0000-0000-0000-00000000000c', 'test-miem-b@rls.test',  'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}');

insert into public.instituciones (id, nombre, tipo) values
  ('aaaa0000-0000-0000-0000-000000000001', 'Institucion Test A', 'educativa'),
  ('bbbb0000-0000-0000-0000-000000000001', 'Institucion Test B', 'educativa');

insert into public.grupos (id, institucion_id, nombre) values
  ('aaaa0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001', 'Grupo Test A'),
  ('bbbb0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-000000000001', 'Grupo Test B');

insert into public.usuarios (id, institucion_id, grupo_id, nombre_completo, email, rol) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaa0000-0000-0000-0000-000000000001', null,                                   'Admin A',       'test-admin-a@rls.test', 'administrador'),
  ('a0000000-0000-0000-0000-00000000000b', 'aaaa0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002', 'Responsable A', 'test-resp-a@rls.test',  'responsable'),
  ('a0000000-0000-0000-0000-00000000000c', 'aaaa0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002', 'Miembro A',     'test-miem-a@rls.test',  'miembro'),
  ('b0000000-0000-0000-0000-00000000000a', 'bbbb0000-0000-0000-0000-000000000001', null,                                   'Admin B',       'test-admin-b@rls.test', 'administrador'),
  ('b0000000-0000-0000-0000-00000000000c', 'bbbb0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000002', 'Miembro B',     'test-miem-b@rls.test',  'miembro');

update public.grupos set responsable_id = 'a0000000-0000-0000-0000-00000000000b'
where id = 'aaaa0000-0000-0000-0000-000000000002';

-- ───────────────────────── datos de prueba: sesiones y asistencias (Fase 6.1) ─────────────────────────
-- Una sesión ya terminada por institución, cada una con una asistencia de su propio miembro.
--
-- OJO: now() devuelve el mismo instante durante toda la transacción (hora de
-- inicio de la transacción), igual que usuarios.created_at. Por eso inicio no
-- se puede "atrasar" respecto a now(): la vista v_asistencia_detalle exige
-- u.created_at <= s.inicio, y un inicio en el pasado quedaría antes de la
-- creación de los usuarios de prueba. Se usa inicio = now() y se cierra en el
-- futuro (expira_en/cerrada_en) para que la sesión además cuente como terminada.
insert into public.sesiones_asistencia (id, institucion_id, grupo_id, creada_por, inicio, expira_en, cerrada_en, tolerancia_min, qr_ttl_seg) values
  ('aaaa0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-00000000000b', now(), now() + interval '90 minutes', now() + interval '90 minutes', 10, 60),
  ('bbbb0000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-00000000000a', now(), now() + interval '90 minutes', now() + interval '90 minutes', 10, 60);

insert into public.asistencias (id, institucion_id, sesion_id, grupo_id, usuario_id, estado, origen) values
  ('aaaa0000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000003',
   'aaaa0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000c', 'puntual', 'manual'),
  ('bbbb0000-0000-0000-0000-000000000004', 'bbbb0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-000000000003',
   'bbbb0000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000c', 'puntual', 'manual');

-- ───────────────────────── 1-3: Admin A no ve nada de la institución B ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';

select is((select count(*) from public.grupos where institucion_id = 'bbbb0000-0000-0000-0000-000000000001'),
  0::bigint, 'Admin A no ve grupos de la institucion B');

select is((select count(*) from public.usuarios where institucion_id = 'bbbb0000-0000-0000-0000-000000000001'),
  0::bigint, 'Admin A no ve usuarios de la institucion B');

select is((select count(*) from public.instituciones where id = 'bbbb0000-0000-0000-0000-000000000001'),
  0::bigint, 'Admin A no ve la institucion B');

reset role;

-- ───────────────────────── 4: Miembro solo ve su propia fila ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000c"}';

select is((select count(*) from public.usuarios), 1::bigint,
  'Miembro A solo ve una fila en usuarios (la suya)');

select is((select id from public.usuarios limit 1), 'a0000000-0000-0000-0000-00000000000c'::uuid,
  'La fila que ve el miembro A es la suya');

reset role;

-- ───────────────────────── 5: Responsable ve a los miembros de su grupo ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000b"}';

select ok((select count(*) from public.usuarios where id = 'a0000000-0000-0000-0000-00000000000c') = 1,
  'Responsable A ve al miembro de su propio grupo');

select is((select count(*) from public.usuarios where institucion_id = 'bbbb0000-0000-0000-0000-000000000001'),
  0::bigint, 'Responsable A no ve usuarios de la institucion B');

reset role;

-- ───────────────────────── 6: Nadie (ni el admin) inserta directo en usuarios ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';

select throws_ok(
  $$ insert into public.usuarios (id, institucion_id, nombre_completo, email, rol)
     values (gen_random_uuid(), 'aaaa0000-0000-0000-0000-000000000001', 'Intruso', 'intruso@rls.test', 'miembro') $$,
  '42501',
  null,
  'Nadie puede insertar directo en usuarios (ni el admin): solo Edge Functions'
);

reset role;

-- ───────────────────────── 7: Un usuario no puede cambiarse su propio rol ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000c"}';

update public.usuarios set rol = 'administrador' where id = 'a0000000-0000-0000-0000-00000000000c';

reset role;

-- Verificado como postgres (fuera de RLS): el rol real no cambió.
select is((select rol from public.usuarios where id = 'a0000000-0000-0000-0000-00000000000c'),
  'miembro', 'El intento de auto-ascenderse a administrador no tuvo efecto (no hay policy de update)');

-- ───────────────────────── 8-10: un miembro solo ve sus propias sesiones/asistencias ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000c"}';

select is((select count(*) from public.sesiones_asistencia), 1::bigint,
  'Miembro A solo ve las sesiones de su propio grupo');

select is((select count(*) from public.asistencias), 1::bigint,
  'Miembro A solo ve su propia fila de asistencia (no la del miembro B)');

select is((select usuario_id from public.asistencias limit 1), 'a0000000-0000-0000-0000-00000000000c'::uuid,
  'La asistencia que ve el miembro A es la suya, no la de otro miembro');

reset role;

-- ───────────────────────── 11-12: un responsable solo ve sus propias sesiones/asistencias ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000b"}';

select is((select count(*) from public.sesiones_asistencia), 1::bigint,
  'Responsable A solo ve la sesion de su propio grupo');

select is((select count(*) from public.asistencias where institucion_id = 'bbbb0000-0000-0000-0000-000000000001'), 0::bigint,
  'Responsable A no ve asistencias de la institucion B');

reset role;

-- ───────────────────────── 13: nadie inserta directo en asistencias (ni el responsable) ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000b"}';

select throws_ok(
  $$ insert into public.asistencias (institucion_id, sesion_id, grupo_id, usuario_id, estado, origen)
     values ('aaaa0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000003',
             'aaaa0000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000c', 'puntual', 'manual') $$,
  '42501',
  null,
  'Nadie puede insertar directo en asistencias (ni el responsable): solo Edge Functions'
);

reset role;

-- ───────────────────────── 14-15: las vistas de reportes (Fase 5) también respetan RLS ─────────────────────────
-- security_invoker = true: si esto fallara, una vista saltaría la seguridad y expondría otra institución.

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';

select is((select count(*) from public.v_asistencia_detalle), 1::bigint,
  'v_asistencia_detalle respeta RLS: Admin A solo ve el detalle de su institucion, no el de la B');

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000c"}';

select is((select count(*) from public.v_asistencia_detalle), 1::bigint,
  'v_asistencia_detalle respeta RLS: Miembro A solo ve su propia fila, no la del resto del grupo');

reset role;

-- ───────────────────────── 16-17: v_resumen_grupo también respeta RLS ─────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';

select is((select count(*) from public.v_resumen_grupo), 1::bigint,
  'v_resumen_grupo respeta RLS: Admin A solo ve el resumen de su propio grupo');

select is((select porcentaje_asistencia from public.v_resumen_grupo limit 1), 100.0,
  'El % de asistencia del grupo A es 100% (1 de 1 presente), calculado solo con sus propios datos');

reset role;

-- ───────────────────────── Fase 4 (ampliación) — asignaturas por curso ─────────────────────────
-- Un curso con 2 asignaturas, cada una con su propio profesor y su propia sesión abierta al
-- mismo tiempo. Verifica: (a) el índice único permite 2 sesiones abiertas por curso si son de
-- asignaturas distintas, pero no 2 para la misma asignatura; (b) el trigger de integridad;
-- (c) cada profesor solo ve lo suyo (su asignatura, el curso al que pertenece, sus miembros,
-- su propia sesión), nunca la asignatura/sesión del otro profesor; (d) el miembro ve ambas
-- asignaturas de su propio curso.

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role, raw_app_meta_data, raw_user_meta_data)
values
  ('c0000000-0000-0000-0000-00000000a001', 'test-admin-c@asig.test', 'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}'),
  ('c0000000-0000-0000-0000-00000000a002', 'test-resp1-c@asig.test', 'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}'),
  ('c0000000-0000-0000-0000-00000000a003', 'test-resp2-c@asig.test', 'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}'),
  ('c0000000-0000-0000-0000-00000000a004', 'test-miem1-c@asig.test', 'x', now(), now(), now(), 'authenticated', 'authenticated', '{}', '{}');

insert into public.instituciones (id, nombre, tipo) values
  ('cccc0000-0000-0000-0000-00000000a005', 'Institucion Test Asignaturas', 'educativa');

insert into public.grupos (id, institucion_id, nombre) values
  ('cccc0000-0000-0000-0000-00000000a006', 'cccc0000-0000-0000-0000-00000000a005', 'Curso Test');

insert into public.usuarios (id, institucion_id, grupo_id, nombre_completo, email, rol) values
  ('c0000000-0000-0000-0000-00000000a001', 'cccc0000-0000-0000-0000-00000000a005', null, 'Admin C', 'test-admin-c@asig.test', 'administrador'),
  ('c0000000-0000-0000-0000-00000000a002', 'cccc0000-0000-0000-0000-00000000a005', null, 'Responsable Uno', 'test-resp1-c@asig.test', 'responsable'),
  ('c0000000-0000-0000-0000-00000000a003', 'cccc0000-0000-0000-0000-00000000a005', null, 'Responsable Dos', 'test-resp2-c@asig.test', 'responsable'),
  ('c0000000-0000-0000-0000-00000000a004', 'cccc0000-0000-0000-0000-00000000a005', 'cccc0000-0000-0000-0000-00000000a006', 'Miembro Uno', 'test-miem1-c@asig.test', 'miembro');

insert into public.asignaturas (id, institucion_id, grupo_id, nombre, responsable_id) values
  ('cccc0000-0000-0000-0000-00000000a007', 'cccc0000-0000-0000-0000-00000000a005', 'cccc0000-0000-0000-0000-00000000a006', 'Matematicas', 'c0000000-0000-0000-0000-00000000a002'),
  ('cccc0000-0000-0000-0000-00000000a008', 'cccc0000-0000-0000-0000-00000000a005', 'cccc0000-0000-0000-0000-00000000a006', 'Historia', 'c0000000-0000-0000-0000-00000000a003');

insert into public.sesiones_asistencia (id, institucion_id, grupo_id, asignatura_id, creada_por, inicio, expira_en, tolerancia_min, qr_ttl_seg) values
  ('cccc0000-0000-0000-0000-00000000a009', 'cccc0000-0000-0000-0000-00000000a005', 'cccc0000-0000-0000-0000-00000000a006', 'cccc0000-0000-0000-0000-00000000a007', 'c0000000-0000-0000-0000-00000000a002', now(), now() + interval '90 minutes', 10, 60),
  ('cccc0000-0000-0000-0000-00000000a010', 'cccc0000-0000-0000-0000-00000000a005', 'cccc0000-0000-0000-0000-00000000a006', 'cccc0000-0000-0000-0000-00000000a008', 'c0000000-0000-0000-0000-00000000a003', now(), now() + interval '90 minutes', 10, 60);

select is((select count(*) from public.sesiones_asistencia where grupo_id = 'cccc0000-0000-0000-0000-00000000a006' and cerrada_en is null),
  2::bigint, 'Dos sesiones abiertas simultaneas en el mismo curso (una por asignatura)');

select throws_ok(
  $$insert into public.sesiones_asistencia (institucion_id, grupo_id, asignatura_id, creada_por, inicio, expira_en, tolerancia_min, qr_ttl_seg)
    values ('cccc0000-0000-0000-0000-00000000a005', 'cccc0000-0000-0000-0000-00000000a006', 'cccc0000-0000-0000-0000-00000000a007', 'c0000000-0000-0000-0000-00000000a002', now(), now() + interval '90 minutes', 10, 60)$$,
  '23505',
  null,
  'No se puede abrir una segunda sesion para la misma asignatura'
);

select throws_ok(
  $$insert into public.asignaturas (institucion_id, grupo_id, nombre, responsable_id)
    values ('cccc0000-0000-0000-0000-00000000a005', 'cccc0000-0000-0000-0000-00000000a006', 'Arte', 'c0000000-0000-0000-0000-00000000a004')$$,
  '23514',
  'El usuario asignado como responsable debe tener rol "responsable".',
  'El trigger rechaza asignar un miembro como responsable de una asignatura'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000a002"}';

select is((select count(*) from public.asignaturas), 1::bigint, 'Responsable 1 solo ve su propia asignatura (Matematicas)');
select is((select count(*) from public.grupos where id = 'cccc0000-0000-0000-0000-00000000a006'), 1::bigint, 'Responsable 1 ve el curso via la asignatura que dicta');
select is((select count(*) from public.usuarios where rol = 'miembro'), 1::bigint, 'Responsable 1 ve a los miembros del curso aunque no sea su responsable_id directo');
select is((select count(*) from public.sesiones_asistencia), 1::bigint, 'Responsable 1 solo ve la sesion de su propia asignatura');

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000a004"}';

select is((select count(*) from public.asignaturas), 2::bigint, 'El miembro ve las 2 asignaturas de su curso');

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000a003"}';

select is((select count(*) from public.asignaturas), 1::bigint, 'Responsable 2 solo ve su propia asignatura (Historia)');
select is((select nombre from public.sesiones_asistencia s join public.asignaturas a on a.id = s.asignatura_id limit 1), 'Historia', 'Responsable 2 solo ve la sesion de Historia, no la de Matematicas');

reset role;

select * from finish();

rollback;
