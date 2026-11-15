-- Solicitudes — un profesor (responsable) pide crear una asignatura y el administrador la aprueba o rechaza.
--
-- Qué hace cada rol:
--   · Administrador: crea asignaturas directamente (ya podía) y resuelve las solicitudes con
--     public.resolver_solicitud(): si la aprueba, la asignatura se crea sola con el profesor
--     solicitante como su responsable.
--   · Responsable (profesor): solo puede CREAR solicitudes para sus cursos y ver/cancelar las suyas.
--     No puede crear asignaturas por su cuenta.
--
-- "tipo" deja la tabla lista para otros tipos de solicitud en el futuro.

create table if not exists public.solicitudes (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id) on delete cascade,
  tipo            text not null default 'asignatura' check (tipo in ('asignatura')),
  solicitante_id  uuid not null references public.usuarios(id) on delete cascade,
  grupo_id        uuid references public.grupos(id) on delete cascade,
  nombre          text not null,
  estado          text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  motivo_rechazo  text,
  resuelta_por    uuid references public.usuarios(id),
  resuelta_en     timestamptz,
  created_at      timestamptz not null default now(),
  constraint solicitudes_nombre_largo check (char_length(nombre) between 2 and 80)
);

create index if not exists idx_solicitudes_inst_estado on public.solicitudes (institucion_id, estado, created_at desc);
create index if not exists idx_solicitudes_solicitante on public.solicitudes (solicitante_id, created_at desc);

-- No se repite la misma solicitud pendiente (mismo curso y nombre).
create unique index if not exists uq_solicitud_pendiente
  on public.solicitudes (grupo_id, lower(nombre)) where estado = 'pendiente';

alter table public.solicitudes enable row level security;

-- Ve las solicitudes: el administrador (todas las de su institución) y cada solicitante (las suyas).
drop policy if exists solicitudes_select on public.solicitudes;
create policy solicitudes_select on public.solicitudes for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and (app.mi_rol() = 'administrador' or solicitante_id = (select auth.uid()))
);

-- Crea: solo un responsable, a su nombre, en estado pendiente y para un curso suyo.
drop policy if exists solicitudes_insert on public.solicitudes;
create policy solicitudes_insert on public.solicitudes for insert to authenticated
with check (
  institucion_id = app.mi_institucion()
  and app.mi_rol() = 'responsable'
  and solicitante_id = (select auth.uid())
  and estado = 'pendiente'
  and tipo = 'asignatura'
  and grupo_id is not null
  and (app.soy_responsable_de(grupo_id) or app.enseno_en_grupo(grupo_id))
);

-- El solicitante puede cancelar (borrar) una solicitud suya que sigue pendiente.
drop policy if exists solicitudes_delete_propia on public.solicitudes;
create policy solicitudes_delete_propia on public.solicitudes for delete to authenticated
using (solicitante_id = (select auth.uid()) and estado = 'pendiente');

-- No hay política de update: solo se resuelven con resolver_solicitud().
revoke all on public.solicitudes from anon;

-- ───────────── resolver: solo el administrador ─────────────

create or replace function public.resolver_solicitud(p_id uuid, p_aprobar boolean, p_motivo text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes;
  v_asignatura uuid;
begin
  if app.mi_rol() is distinct from 'administrador' then
    raise exception 'Solo el administrador puede resolver solicitudes.' using errcode = '42501';
  end if;

  select * into s from public.solicitudes
  where id = p_id and institucion_id = app.mi_institucion()
  for update;

  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  if s.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya fue resuelta.' using errcode = '23514';
  end if;

  if p_aprobar then
    begin
      insert into public.asignaturas (institucion_id, grupo_id, nombre, responsable_id)
      values (s.institucion_id, s.grupo_id, s.nombre, s.solicitante_id)
      returning id into v_asignatura;
    exception when unique_violation then
      raise exception 'Ya existe una asignatura con ese nombre en el curso.' using errcode = '23505';
    end;
  end if;

  update public.solicitudes
  set estado         = case when p_aprobar then 'aprobada' else 'rechazada' end,
      motivo_rechazo = case when p_aprobar then null else nullif(trim(coalesce(p_motivo, '')), '') end,
      resuelta_por   = (select auth.uid()),
      resuelta_en    = now()
  where id = p_id;

  return v_asignatura;
end;
$$;

revoke all on function public.resolver_solicitud(uuid, boolean, text) from public, anon;
grant execute on function public.resolver_solicitud(uuid, boolean, text) to authenticated;
