-- Fase 1.1 — Ampliación de instituciones, grupos y usuarios
-- Verificado contra los datos reales antes de escribir esta migración:
-- nombres de institución/grupo/usuario dentro de los rangos permitidos,
-- administrador sin grupo_id, miembros con grupo_id. Nada se pierde.

-- ───────────────────────── instituciones ─────────────────────────

alter table public.instituciones
  add column if not exists tolerancia_min      int not null default 10 check (tolerancia_min between 0 and 120),
  add column if not exists duracion_sesion_min int not null default 90 check (duracion_sesion_min between 5 and 480),
  add column if not exists qr_ttl_seg          int not null default 60 check (qr_ttl_seg between 20 and 300);

alter table public.instituciones
  add constraint instituciones_nombre_largo check (char_length(nombre) between 3 and 120);

-- ───────────────────────── grupos ─────────────────────────

alter table public.grupos
  add column if not exists activo boolean not null default true;

alter table public.grupos
  add constraint grupos_nombre_largo check (char_length(nombre) between 2 and 80);

create unique index if not exists uq_grupo_nombre_por_institucion
  on public.grupos (institucion_id, lower(nombre));

-- ───────────────────────── usuarios ─────────────────────────

alter table public.usuarios
  add column if not exists email text,
  add column if not exists activo boolean not null default true,
  add column if not exists debe_cambiar_password boolean not null default false;

-- Copia el correo desde auth.users para los usuarios que ya existen.
update public.usuarios u
set email = au.email
from auth.users au
where au.id = u.id
  and u.email is null;

alter table public.usuarios
  alter column email set not null;

alter table public.usuarios
  add constraint usuarios_nombre_largo check (char_length(nombre_completo) between 2 and 120);

-- D-3: un solo administrador activo por institución.
create unique index if not exists uq_un_admin_por_institucion
  on public.usuarios (institucion_id)
  where rol = 'administrador' and activo;

-- Un administrador no tiene grupo asignado; un miembro siempre debe tenerlo.
-- Verificado contra los datos reales: se cumple hoy, seguro de aplicar.
alter table public.usuarios
  add constraint usuarios_admin_sin_grupo check (rol <> 'administrador' or grupo_id is null);

alter table public.usuarios
  add constraint usuarios_miembro_con_grupo check (rol <> 'miembro' or grupo_id is not null);

-- ───────────────────────── índices en FKs ─────────────────────────

create index if not exists idx_usuarios_institucion_id on public.usuarios (institucion_id);
create index if not exists idx_usuarios_grupo_id       on public.usuarios (grupo_id);
create index if not exists idx_grupos_institucion_id   on public.grupos (institucion_id);
create index if not exists idx_grupos_responsable_id   on public.grupos (responsable_id);
