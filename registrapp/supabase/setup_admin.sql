-- Registrapp — Crea la institución de prueba y deja a TU usuario como administrador.
--
-- ANTES de ejecutar esto:
--   1. Ejecuta setup_nuevo_proyecto.sql.
--   2. En Authentication → Users → Add user → Create new user, crea tu usuario
--      (correo + contraseña) y marca "Auto Confirm User".
--   3. Pon ese MISMO correo abajo y ejecuta este archivo.

do $$
declare
  v_email  text := 'admin@registrapp.cl';   -- <-- cámbialo por el correo que creaste
  v_nombre text := 'Administrador';
  v_uid    uuid;
  v_inst   uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'No existe un usuario de Auth con el correo %. Créalo primero en Authentication → Users.', v_email;
  end if;

  insert into public.instituciones (nombre, tipo)
  values ('Colegio Demo Registrapp', 'educativa')
  returning id into v_inst;

  insert into public.usuarios (id, institucion_id, grupo_id, nombre_completo, email, rol)
  values (v_uid, v_inst, null, v_nombre, lower(v_email), 'administrador');
end $$;
