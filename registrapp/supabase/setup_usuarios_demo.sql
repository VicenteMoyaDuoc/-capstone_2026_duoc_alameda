-- Registrapp — Usuarios de ejemplo con datos de asistencia.
--
-- Crea, dentro de la institución de tu administrador:
--   · 1 curso (o departamento, si la institución es corporativa)
--   · 1 profesor (o jefe de área) como responsable de ese curso
--   · 4 alumnos (o empleados)
--   · 2 asignaturas (solo en instituciones educativas)
--   · 10 clases ya terminadas, con asistencias variadas, para que Dashboard y Reportes tengan datos
--
-- ANTES de ejecutar:
--   1. Ejecuta setup_nuevo_proyecto.sql y setup_admin.sql.
--   2. Revisa las dos variables de abajo (correo del administrador y contraseña de los usuarios de ejemplo).
--
-- Los usuarios se crean directamente en Auth con SQL, sin pasar por las Edge Functions, así que
-- funciona aunque aún no las hayas publicado. Es un atajo pensado para pruebas.
-- Se puede ejecutar más de una vez: no duplica usuarios ni clases.

create or replace function pg_temp.crear_usuario_auth(p_email text, p_password text) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is not null then
    return v_id;
  end if;

  v_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', lower(p_email),
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email), 'email_verified', true),
    'email', now(), now(), now()
  );

  return v_id;
end;
$$;

do $$
declare
  -- ───── EDITA ESTAS DOS LÍNEAS ─────
  v_admin_email text := 'admin@registrapp.cl';   -- correo de tu administrador
  v_password    text := 'Demo12345';             -- contraseña de TODOS los usuarios de ejemplo

  v_inst   uuid;
  v_tipo   text;
  v_tol    int;
  v_ttl    int;
  v_dur    int;
  v_grupo  uuid;
  v_nombre_grupo text;
  v_resp   uuid;
  v_resp_email text;
  v_resp_nombre text;
  v_asig1  uuid;
  v_asig2  uuid;
  v_asig   uuid;
  v_sesion uuid;
  v_inicio timestamptz;
  v_id     uuid;
  v_miembros uuid[] := '{}';
  v_prefijo  text;
  v_nombres  text[];
  v_r        double precision;
  i int;
  d int;
  m uuid;
begin
  select u.institucion_id into v_inst
  from public.usuarios u
  where lower(u.email) = lower(v_admin_email) and u.rol = 'administrador';

  if v_inst is null then
    raise exception 'No se encontró un administrador con el correo %. Ejecuta antes setup_admin.sql.', v_admin_email;
  end if;

  select tipo, tolerancia_min, qr_ttl_seg, duracion_sesion_min
  into v_tipo, v_tol, v_ttl, v_dur
  from public.instituciones where id = v_inst;

  if v_tipo = 'corporativa' then
    v_nombre_grupo := 'Ventas';
    v_resp_email   := 'jefe@registrapp.cl';
    v_resp_nombre  := 'Jefa de Ventas';
    v_prefijo      := 'empleado';
    v_nombres      := array['Camila Fuentes', 'Matías Pizarro', 'Sofía Araya', 'Benjamín Tapia'];
  else
    v_nombre_grupo := '4to Medio A';
    v_resp_email   := 'profesor@registrapp.cl';
    v_resp_nombre  := 'Marta Soto';
    v_prefijo      := 'alumno';
    v_nombres      := array['Camila Fuentes', 'Matías Pizarro', 'Sofía Araya', 'Benjamín Tapia'];
  end if;

  -- Curso o departamento
  insert into public.grupos (institucion_id, nombre) values (v_inst, v_nombre_grupo) on conflict do nothing;
  select id into v_grupo from public.grupos where institucion_id = v_inst and lower(nombre) = lower(v_nombre_grupo);

  -- Responsable (profesor o jefe de área). created_at antiguo: las vistas solo cuentan clases
  -- posteriores a la creación del usuario.
  v_resp := pg_temp.crear_usuario_auth(v_resp_email, v_password);
  insert into public.usuarios (id, institucion_id, grupo_id, nombre_completo, email, rol, created_at)
  values (v_resp, v_inst, v_grupo, v_resp_nombre, lower(v_resp_email), 'responsable', now() - interval '60 days')
  on conflict (id) do nothing;
  update public.grupos set responsable_id = v_resp where id = v_grupo and responsable_id is null;

  -- Alumnos o empleados
  for i in 1..4 loop
    v_id := pg_temp.crear_usuario_auth(v_prefijo || i || '@registrapp.cl', v_password);
    insert into public.usuarios (id, institucion_id, grupo_id, nombre_completo, email, rol, created_at)
    values (v_id, v_inst, v_grupo, v_nombres[i], v_prefijo || i || '@registrapp.cl', 'miembro', now() - interval '60 days')
    on conflict (id) do nothing;
    v_miembros := v_miembros || v_id;
  end loop;

  -- Asignaturas (solo instituciones educativas)
  if v_tipo = 'educativa' then
    insert into public.asignaturas (institucion_id, grupo_id, nombre, responsable_id)
    values (v_inst, v_grupo, 'Matemática', v_resp), (v_inst, v_grupo, 'Lenguaje', v_resp)
    on conflict do nothing;
    select id into v_asig1 from public.asignaturas where grupo_id = v_grupo and lower(nombre) = 'matemática';
    select id into v_asig2 from public.asignaturas where grupo_id = v_grupo and lower(nombre) = 'lenguaje';
  end if;

  -- Clases terminadas con asistencias (solo si el grupo todavía no tiene)
  if not exists (select 1 from public.sesiones_asistencia where grupo_id = v_grupo) then
    for d in 1..10 loop
      v_inicio := date_trunc('day', now()) - make_interval(days => d * 2) + interval '12 hours';
      v_asig := case when v_tipo = 'educativa' then (case when d % 2 = 0 then v_asig1 else v_asig2 end) else null end;

      insert into public.sesiones_asistencia
        (institucion_id, grupo_id, asignatura_id, creada_por, inicio, expira_en, cerrada_en, tolerancia_min, qr_ttl_seg)
      values
        (v_inst, v_grupo, v_asig, v_resp, v_inicio, v_inicio + make_interval(mins => v_dur), v_inicio + make_interval(mins => v_dur), v_tol, v_ttl)
      returning id into v_sesion;

      foreach m in array v_miembros loop
        v_r := random();
        if v_r < 0.82 then   -- el resto queda ausente (no se guarda fila)
          insert into public.asistencias
            (institucion_id, sesion_id, grupo_id, asignatura_id, usuario_id, registrado_en, estado, origen)
          values (
            v_inst, v_sesion, v_grupo, v_asig, m,
            v_inicio + case when v_r < 0.62 then interval '3 minutes' else make_interval(mins => v_tol + 5) end,
            case when v_r < 0.62 then 'puntual' else 'tardanza' end,
            'qr'
          );
        end if;
      end loop;
    end loop;
  end if;

  raise notice 'Listo. Usuarios de ejemplo (contraseña: %): %, %1..%4@registrapp.cl', v_password, v_resp_email, v_prefijo, v_prefijo;
end $$;
