-- Registrapp — Semanas 1-2 — Row Level Security
-- Ejecutar después de 001_schema.sql.
--
-- Nota de diseño: las políticas de "usuarios" no pueden hacer un subselect
-- directo a "usuarios" dentro de su propia policy (Postgres lo detecta como
-- recursión infinita al evaluar RLS). Por eso se usan funciones
-- `security definer` que consultan la tabla sin pasar por RLS, y las
-- políticas solo llaman a esas funciones.

create or replace function public.mi_institucion_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select institucion_id from usuarios where id = auth.uid()
$$;

create or replace function public.mi_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from usuarios where id = auth.uid()
$$;

create or replace function public.mi_grupo_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select grupo_id from usuarios where id = auth.uid()
$$;

alter table instituciones enable row level security;
alter table grupos enable row level security;
alter table usuarios enable row level security;

-- instituciones: un usuario solo lee la institución a la que pertenece.
create policy "instituciones_select_propia"
  on instituciones for select
  using (id = mi_institucion_id());

-- instituciones: solo un administrador puede editar los datos de su institución.
create policy "instituciones_update_admin"
  on instituciones for update
  using (id = mi_institucion_id() and mi_rol() = 'administrador')
  with check (id = mi_institucion_id() and mi_rol() = 'administrador');

-- grupos: lectura según rol.
--   administrador -> todos los grupos de su institución
--   responsable   -> solo el grupo del que es responsable
--   miembro       -> solo el grupo al que pertenece
create policy "grupos_select_segun_rol"
  on grupos for select
  using (
    institucion_id = mi_institucion_id()
    and (
      mi_rol() = 'administrador'
      or responsable_id = auth.uid()
      or id = mi_grupo_id()
    )
  );

-- grupos: solo un administrador crea grupos, y solo dentro de su institución.
create policy "grupos_insert_admin"
  on grupos for insert
  with check (institucion_id = mi_institucion_id() and mi_rol() = 'administrador');

-- grupos: solo un administrador edita grupos (p. ej. asignar responsable).
create policy "grupos_update_admin"
  on grupos for update
  using (institucion_id = mi_institucion_id() and mi_rol() = 'administrador')
  with check (institucion_id = mi_institucion_id() and mi_rol() = 'administrador');

-- usuarios: siempre puede leer su propia fila.
-- administrador: lee todos los usuarios de su institución.
-- responsable: lee solo los miembros de su propio grupo.
create policy "usuarios_select_segun_rol"
  on usuarios for select
  using (
    id = auth.uid()
    or (
      institucion_id = mi_institucion_id()
      and (
        mi_rol() = 'administrador'
        or (mi_rol() = 'responsable' and grupo_id = mi_grupo_id())
      )
    )
  );

-- usuarios: solo un administrador crea usuarios, y solo en su propia institución.
create policy "usuarios_insert_admin"
  on usuarios for insert
  with check (institucion_id = mi_institucion_id() and mi_rol() = 'administrador');

-- usuarios: un administrador puede editar usuarios de su institución (p. ej. asignar grupo_id).
create policy "usuarios_update_admin"
  on usuarios for update
  using (institucion_id = mi_institucion_id() and mi_rol() = 'administrador')
  with check (institucion_id = mi_institucion_id() and mi_rol() = 'administrador');
