-- Solicitudes — el profesor también puede enviar un MENSAJE al administrador y el administrador lo RESPONDE.
--
-- Qué cambia respecto de la migración 10:
--   · tipo 'consulta' (además de 'asignatura'): un asunto + un mensaje sobre un curso. Siempre se elige el
--     curso: un profesor puede dar clases en varios.
--   · estado 'respondida' para las consultas contestadas.
--   · columnas nuevas: `detalle` (el mensaje del profesor) y `respuesta` (lo que contesta el administrador;
--     también guarda el comentario o el motivo al aprobar o rechazar una asignatura).
--   · responder_solicitud(): el administrador contesta una consulta. resolver_solicitud() sigue aprobando o
--     rechazando asignaturas.
--
-- Se puede ejecutar aunque ya hayas ejecutado la migración 10.

alter table public.solicitudes add column if not exists detalle   text;
alter table public.solicitudes add column if not exists respuesta text;

-- El motivo de rechazo anterior pasa a ser la respuesta.
update public.solicitudes set respuesta = motivo_rechazo where respuesta is null and motivo_rechazo is not null;

alter table public.solicitudes drop constraint if exists solicitudes_tipo_check;
alter table public.solicitudes add  constraint solicitudes_tipo_check check (tipo in ('asignatura', 'consulta'));

alter table public.solicitudes drop constraint if exists solicitudes_estado_check;
alter table public.solicitudes add  constraint solicitudes_estado_check check (estado in ('pendiente', 'aprobada', 'rechazada', 'respondida'));

alter table public.solicitudes drop constraint if exists solicitudes_detalle_largo;
alter table public.solicitudes add  constraint solicitudes_detalle_largo check (detalle is null or char_length(detalle) <= 600);

alter table public.solicitudes drop constraint if exists solicitudes_respuesta_largo;
alter table public.solicitudes add  constraint solicitudes_respuesta_largo check (respuesta is null or char_length(respuesta) <= 600);

alter table public.solicitudes drop constraint if exists solicitudes_consulta_con_detalle;
alter table public.solicitudes add  constraint solicitudes_consulta_con_detalle
  check (tipo <> 'consulta' or char_length(btrim(coalesce(detalle, ''))) >= 3);

-- La regla "no repetir una solicitud pendiente igual" aplica solo a las de asignatura.
drop index if exists public.uq_solicitud_pendiente;
create unique index uq_solicitud_pendiente
  on public.solicitudes (grupo_id, lower(nombre)) where estado = 'pendiente' and tipo = 'asignatura';

-- Crear: un responsable, a su nombre, pendiente, y siempre para un curso suyo (sea de asignatura o consulta).
drop policy if exists solicitudes_insert on public.solicitudes;
create policy solicitudes_insert on public.solicitudes for insert to authenticated
with check (
  institucion_id = app.mi_institucion()
  and app.mi_rol() = 'responsable'
  and solicitante_id = (select auth.uid())
  and estado = 'pendiente'
  and tipo in ('asignatura', 'consulta')
  and grupo_id is not null
  and respuesta is null
  and (app.soy_responsable_de(grupo_id) or app.enseno_en_grupo(grupo_id))
);

-- ───────────── aprobar o rechazar una asignatura ─────────────

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

  if s.tipo <> 'asignatura' then
    raise exception 'Esta solicitud se responde, no se aprueba ni se rechaza.' using errcode = '23514';
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
      respuesta      = nullif(left(btrim(coalesce(p_motivo, '')), 600), ''),
      motivo_rechazo = null,
      resuelta_por   = (select auth.uid()),
      resuelta_en    = now()
  where id = p_id;

  return v_asignatura;
end;
$$;

revoke all on function public.resolver_solicitud(uuid, boolean, text) from public, anon;
grant execute on function public.resolver_solicitud(uuid, boolean, text) to authenticated;

-- ───────────── responder una consulta ─────────────

create or replace function public.responder_solicitud(p_id uuid, p_respuesta text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.solicitudes;
begin
  if app.mi_rol() is distinct from 'administrador' then
    raise exception 'Solo el administrador puede responder solicitudes.' using errcode = '42501';
  end if;

  if char_length(btrim(coalesce(p_respuesta, ''))) < 1 then
    raise exception 'Escribe una respuesta.' using errcode = '23514';
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

  if s.tipo <> 'consulta' then
    raise exception 'Esta solicitud se aprueba o se rechaza, no se responde.' using errcode = '23514';
  end if;

  update public.solicitudes
  set estado       = 'respondida',
      respuesta    = left(btrim(p_respuesta), 600),
      resuelta_por = (select auth.uid()),
      resuelta_en  = now()
  where id = p_id;
end;
$$;

revoke all on function public.responder_solicitud(uuid, text) from public, anon;
grant execute on function public.responder_solicitud(uuid, text) to authenticated;
