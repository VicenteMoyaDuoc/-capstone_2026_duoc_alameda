-- Fase 1.2 — Funciones auxiliares de seguridad en esquema no expuesto a la API
--
-- Las funciones de semanas 1-2 vivían en public.*, lo que las expone en la
-- API autogenerada de PostgREST. Se reemplazan por equivalentes en el
-- esquema "app" (no expuesto a la API) con más capacidad: soy_responsable_de()
-- soporta que un responsable lidere varios grupos (D-4), cosa que la función
-- anterior (basada en usuarios.grupo_id) no permitía.
--
-- Primero hay que soltar las políticas viejas que usan las funciones viejas
-- (si no, Postgres no deja borrar las funciones), y recién ahí borrarlas.

drop policy if exists "instituciones_select_propia" on public.instituciones;
drop policy if exists "instituciones_update_admin"  on public.instituciones;
drop policy if exists "grupos_select_segun_rol"     on public.grupos;
drop policy if exists "grupos_insert_admin"         on public.grupos;
drop policy if exists "grupos_update_admin"         on public.grupos;
drop policy if exists "usuarios_select_segun_rol"   on public.usuarios;
drop policy if exists "usuarios_insert_admin"       on public.usuarios;
drop policy if exists "usuarios_update_admin"       on public.usuarios;

drop function if exists public.mi_institucion_id();
drop function if exists public.mi_rol();
drop function if exists public.mi_grupo_id();

create schema if not exists app;
grant usage on schema app to authenticated;

create or replace function app.mi_institucion() returns uuid
language sql stable security definer set search_path = '' as $$
  select institucion_id from public.usuarios where id = (select auth.uid()) and activo
$$;

create or replace function app.mi_rol() returns text
language sql stable security definer set search_path = '' as $$
  select rol::text from public.usuarios where id = (select auth.uid()) and activo
$$;

create or replace function app.mi_grupo() returns uuid
language sql stable security definer set search_path = '' as $$
  select grupo_id from public.usuarios where id = (select auth.uid()) and activo
$$;

create or replace function app.soy_responsable_de(p_grupo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grupos g
                 where g.id = p_grupo and g.responsable_id = (select auth.uid()))
$$;

revoke all on function app.mi_institucion()          from public, anon;
revoke all on function app.mi_rol()                  from public, anon;
revoke all on function app.mi_grupo()                from public, anon;
revoke all on function app.soy_responsable_de(uuid)  from public, anon;

grant execute on function app.mi_institucion()         to authenticated;
grant execute on function app.mi_rol()                 to authenticated;
grant execute on function app.mi_grupo()               to authenticated;
grant execute on function app.soy_responsable_de(uuid) to authenticated;
