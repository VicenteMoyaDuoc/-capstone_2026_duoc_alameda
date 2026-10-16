-- Fase 2 — Validación de integridad: el responsable_id de un grupo debe ser
-- un usuario de la MISMA institución, con rol = 'responsable' y activo.
-- Se garantiza en la base de datos (trigger), no solo en el frontend.

create or replace function public.validar_responsable_de_grupo()
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
    raise exception 'El responsable debe pertenecer a la misma institución que el grupo.' using errcode = '23514';
  end if;

  if not v_activo then
    raise exception 'El responsable asignado está desactivado.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_responsable_de_grupo on public.grupos;

create trigger trg_validar_responsable_de_grupo
  before insert or update of responsable_id on public.grupos
  for each row
  execute function public.validar_responsable_de_grupo();
