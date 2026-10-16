-- Fase 4 (ampliación — lógica de negocio real) — Asignaturas por curso.
--
-- Hallazgo de la retrospectiva: un curso real tiene varias asignaturas
-- (5 a 7 típicamente), cada una con su propio profesor, que pasa lista por
-- su cuenta. El modelo anterior solo soportaba un responsable por grupo
-- completo. Esto solo aplica a instituciones tipo 'educativa' — en
-- 'corporativa' todo sigue igual (un departamento, un jefe de área, una
-- sesión por departamento), por eso asignatura_id queda opcional (nullable)
-- en vez de reemplazar grupo_id.

create table public.asignaturas (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id) on delete cascade,
  grupo_id        uuid not null references public.grupos(id) on delete cascade,
  nombre          text not null,
  responsable_id  uuid references public.usuarios(id),
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint asignaturas_nombre_largo check (char_length(nombre) between 2 and 80)
);

create unique index uq_asignatura_nombre_por_grupo
  on public.asignaturas (grupo_id, lower(nombre));

create index idx_asignaturas_institucion on public.asignaturas (institucion_id);
create index idx_asignaturas_grupo       on public.asignaturas (grupo_id);
create index idx_asignaturas_responsable on public.asignaturas (responsable_id);

-- ───────────────────────── integridad: responsable de una asignatura ─────────────────────────
-- Mismo criterio que trg_validar_responsable_de_grupo (Fase 2).

create or replace function public.validar_responsable_de_asignatura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_institucion_id uuid;
  v_activo boolean;
begin
  if new.responsable_id is null then
    return new;
  end if;

  select rol, institucion_id, activo
  into v_rol, v_institucion_id, v_activo
  from public.usuarios
  where id = new.responsable_id;

  if v_rol is null then
    raise exception 'El responsable indicado no existe.' using errcode = '23514';
  end if;

  if v_rol <> 'responsable' then
    raise exception 'El usuario asignado como responsable debe tener rol "responsable".' using errcode = '23514';
  end if;

  if v_institucion_id <> new.institucion_id then
    raise exception 'El responsable debe pertenecer a la misma institución que la asignatura.' using errcode = '23514';
  end if;

  if not v_activo then
    raise exception 'El responsable asignado está desactivado.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_responsable_de_asignatura on public.asignaturas;

create trigger trg_validar_responsable_de_asignatura
  before insert or update of responsable_id on public.asignaturas
  for each row
  execute function public.validar_responsable_de_asignatura();

-- ───────────────────────── sesiones_asistencia / asistencias: asignatura_id opcional ─────────────────────────

alter table public.sesiones_asistencia
  add column asignatura_id uuid references public.asignaturas(id) on delete cascade;

alter table public.asistencias
  add column asignatura_id uuid references public.asignaturas(id) on delete cascade;

create index idx_sesiones_asignatura    on public.sesiones_asistencia (asignatura_id);
create index idx_asistencias_asignatura on public.asistencias (asignatura_id);

-- El índice único original (una sesión abierta por grupo) ya no sirve tal
-- cual: ahora puede haber varias sesiones abiertas a la vez en el mismo
-- curso, una por asignatura. Se reemplaza por dos índices parciales:
--   - una sesión abierta por asignatura (educativa)
--   - una sesión abierta por grupo SIN asignatura (corporativa, o un curso
--     educativo que todavía no tiene asignaturas cargadas)
drop index if exists uq_sesion_abierta_por_grupo;

create unique index uq_sesion_abierta_por_asignatura
  on public.sesiones_asistencia (asignatura_id)
  where cerrada_en is null and asignatura_id is not null;

create unique index uq_sesion_abierta_por_grupo_sin_asignatura
  on public.sesiones_asistencia (grupo_id)
  where cerrada_en is null and asignatura_id is null;

-- ───────────────────────── RLS: asignaturas ─────────────────────────

alter table public.asignaturas enable row level security;

create policy asignaturas_select on public.asignaturas for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and (
    app.mi_rol() = 'administrador'
    or responsable_id = (select auth.uid())
    or grupo_id = app.mi_grupo()
  )
);

create policy asignaturas_admin_write on public.asignaturas for all to authenticated
using      (institucion_id = app.mi_institucion() and app.mi_rol() = 'administrador')
with check (institucion_id = app.mi_institucion() and app.mi_rol() = 'administrador');

revoke all on public.asignaturas from anon;

-- ───────────────────────── función helper: ¿enseño en este grupo (vía alguna asignatura)? ─────────────────────────

create or replace function app.enseno_en_grupo(p_grupo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.asignaturas a
                 where a.grupo_id = p_grupo and a.responsable_id = (select auth.uid()) and a.activo)
$$;

create or replace function app.soy_responsable_de_asignatura(p_asignatura uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.asignaturas a
                 where a.id = p_asignatura and a.responsable_id = (select auth.uid()))
$$;

revoke all on function app.enseno_en_grupo(uuid)              from public, anon;
revoke all on function app.soy_responsable_de_asignatura(uuid) from public, anon;

grant execute on function app.enseno_en_grupo(uuid)               to authenticated;
grant execute on function app.soy_responsable_de_asignatura(uuid) to authenticated;

-- ───────────────────────── políticas existentes: reconocer también el vínculo por asignatura ─────────────────────────

drop policy if exists grupos_select on public.grupos;
create policy grupos_select on public.grupos for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and (
    app.mi_rol() = 'administrador'
    or responsable_id = (select auth.uid())
    or id = app.mi_grupo()
    or app.enseno_en_grupo(id)
  )
);

drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select to authenticated
using (
  id = (select auth.uid())
  or (
    institucion_id = app.mi_institucion()
    and (
      app.mi_rol() = 'administrador'
      or (app.mi_rol() = 'responsable' and app.soy_responsable_de(grupo_id))
      or (app.mi_rol() = 'responsable' and app.enseno_en_grupo(grupo_id))
    )
  )
);

drop policy if exists sesiones_select on public.sesiones_asistencia;
create policy sesiones_select on public.sesiones_asistencia for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and (
    app.mi_rol() = 'administrador'
    or (app.mi_rol() = 'responsable' and app.soy_responsable_de(grupo_id))
    or (app.mi_rol() = 'responsable' and asignatura_id is not null and app.soy_responsable_de_asignatura(asignatura_id))
    or (app.mi_rol() = 'miembro' and grupo_id = app.mi_grupo())
  )
);

drop policy if exists asistencias_select on public.asistencias;
create policy asistencias_select on public.asistencias for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and (
    app.mi_rol() = 'administrador'
    or (app.mi_rol() = 'responsable' and app.soy_responsable_de(grupo_id))
    or (app.mi_rol() = 'responsable' and asignatura_id is not null and app.soy_responsable_de_asignatura(asignatura_id))
    or usuario_id = (select auth.uid())
  )
);
