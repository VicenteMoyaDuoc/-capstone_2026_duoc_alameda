-- Registrapp — Configuración completa para un proyecto de Supabase NUEVO (vacío).
-- Pegar completo en SQL Editor y ejecutar UNA sola vez. Después ejecutar setup_admin.sql.
-- Generado concatenando: 001_schema, 002_rls y migrations/*.sql en orden.


-- ════════════════════════ 001_schema.sql ════════════════════════

-- Registrapp — Semanas 1-2 — Esquema base
-- Ejecutar en el SQL Editor de Supabase, en orden, sobre un proyecto nuevo.

create extension if not exists "pgcrypto";

-- Instituciones (colegios o empresas)
create table instituciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('educativa', 'corporativa')),
  created_at timestamptz default now()
);

-- Grupos (cursos o departamentos), siempre dentro de una institución.
-- responsable_id se agrega después con alter table (ver nota de ciclo circular).
create table grupos (
  id uuid primary key default gen_random_uuid(),
  institucion_id uuid not null references instituciones(id) on delete cascade,
  nombre text not null,
  created_at timestamptz default now()
);

-- Usuarios de la aplicación, vinculados a Supabase Auth.
create table usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  institucion_id uuid not null references instituciones(id) on delete cascade,
  grupo_id uuid references grupos(id),
  nombre_completo text not null,
  rol text not null check (rol in ('administrador', 'responsable', 'miembro')),
  created_at timestamptz default now()
);

-- Se agrega ahora porque usuarios ya existe (evita el ciclo circular grupos <-> usuarios).
alter table grupos
  add column responsable_id uuid references usuarios(id);


-- ════════════════════════ 002_rls.sql ════════════════════════

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


-- ════════════════════════ migrations/20261009_01_instituciones_grupos_usuarios.sql ════════════════════════

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


-- ════════════════════════ migrations/20261009_02_tablas_asistencia.sql ════════════════════════

-- Fase 1.1 — Tablas nuevas: sesiones_asistencia, asistencias, auditoria
-- "Ausente" no se guarda: se calcula (miembros del grupo sin fila en
-- asistencias para esa sesión). Ver vistas en la Fase 5.

create table if not exists public.sesiones_asistencia (
  id              uuid primary key default gen_random_uuid(),
  institucion_id  uuid not null references public.instituciones(id) on delete cascade,
  grupo_id        uuid not null references public.grupos(id) on delete restrict,
  creada_por      uuid not null references public.usuarios(id),
  inicio          timestamptz not null default now(),
  expira_en       timestamptz not null,
  cerrada_en      timestamptz,
  tolerancia_min  int not null,
  qr_ttl_seg      int not null,
  check (expira_en > inicio)
);

create unique index if not exists uq_sesion_abierta_por_grupo
  on public.sesiones_asistencia (grupo_id) where cerrada_en is null;

create index if not exists idx_sesiones_inst_grupo_inicio
  on public.sesiones_asistencia (institucion_id, grupo_id, inicio desc);

create table if not exists public.asistencias (
  id             uuid primary key default gen_random_uuid(),
  institucion_id uuid not null references public.instituciones(id) on delete cascade,
  sesion_id      uuid not null references public.sesiones_asistencia(id) on delete cascade,
  grupo_id       uuid not null references public.grupos(id),
  usuario_id     uuid not null references public.usuarios(id),
  registrado_en  timestamptz not null default now(),
  estado         text not null check (estado in ('puntual', 'tardanza')),
  origen         text not null default 'qr' check (origen in ('qr', 'manual')),
  unique (sesion_id, usuario_id)
);

create index if not exists idx_asistencias_inst_grupo_fecha on public.asistencias (institucion_id, grupo_id, registrado_en);
create index if not exists idx_asistencias_sesion on public.asistencias (sesion_id);
create index if not exists idx_asistencias_usuario on public.asistencias (usuario_id, registrado_en desc);

create table if not exists public.auditoria (
  id             bigint generated always as identity primary key,
  institucion_id uuid,
  usuario_id     uuid,
  evento         text not null,
  detalle        jsonb,
  creado_en      timestamptz not null default now()
);

create index if not exists idx_auditoria_inst_fecha on public.auditoria (institucion_id, creado_en desc);


-- ════════════════════════ migrations/20261009_03_funciones_seguridad_schema_app.sql ════════════════════════

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


-- ════════════════════════ migrations/20261009_04_rls_politicas.sql ════════════════════════

-- Fase 1.3 — Row Level Security en todas las tablas, con las funciones de app.*
--
-- Regla: usuarios, sesiones_asistencia, asistencias y auditoria NO tienen
-- policy de insert/update/delete para authenticated. Todo cambio a esas
-- tablas se hace desde Edge Functions con la service_role key (que ignora
-- RLS), fuera del navegador. Así nadie puede cambiarse el rol, la
-- institución, ni fabricar una asistencia.

alter table public.instituciones       enable row level security;
alter table public.grupos              enable row level security;
alter table public.usuarios            enable row level security;
alter table public.sesiones_asistencia enable row level security;
alter table public.asistencias         enable row level security;
alter table public.auditoria           enable row level security;

-- ───────────────────────── instituciones ─────────────────────────

create policy instituciones_select on public.instituciones for select to authenticated
using (id = app.mi_institucion());

create policy instituciones_update_admin on public.instituciones for update to authenticated
using      (id = app.mi_institucion() and app.mi_rol() = 'administrador')
with check (id = app.mi_institucion() and app.mi_rol() = 'administrador');

-- ───────────────────────── grupos ─────────────────────────

create policy grupos_select on public.grupos for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and (
    app.mi_rol() = 'administrador'
    or responsable_id = (select auth.uid())
    or id = app.mi_grupo()
  )
);

create policy grupos_admin_write on public.grupos for all to authenticated
using      (institucion_id = app.mi_institucion() and app.mi_rol() = 'administrador')
with check (institucion_id = app.mi_institucion() and app.mi_rol() = 'administrador');

-- ───────────────────────── usuarios (solo lectura desde el navegador) ─────────────────────────

create policy usuarios_select on public.usuarios for select to authenticated
using (
  id = (select auth.uid())
  or (
    institucion_id = app.mi_institucion()
    and (
      app.mi_rol() = 'administrador'
      or (app.mi_rol() = 'responsable' and app.soy_responsable_de(grupo_id))
    )
  )
);

-- ───────────────────────── sesiones_asistencia (solo lectura) ─────────────────────────

create policy sesiones_select on public.sesiones_asistencia for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and (
    app.mi_rol() = 'administrador'
    or (app.mi_rol() = 'responsable' and app.soy_responsable_de(grupo_id))
    or (app.mi_rol() = 'miembro' and grupo_id = app.mi_grupo())
  )
);

-- ───────────────────────── asistencias (solo lectura) ─────────────────────────

create policy asistencias_select on public.asistencias for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and (
    app.mi_rol() = 'administrador'
    or (app.mi_rol() = 'responsable' and app.soy_responsable_de(grupo_id))
    or usuario_id = (select auth.uid())
  )
);

-- ───────────────────────── auditoria (solo lectura, solo admin) ─────────────────────────

create policy auditoria_select_admin on public.auditoria for select to authenticated
using (
  institucion_id = app.mi_institucion()
  and app.mi_rol() = 'administrador'
);

-- ───────────────────────── RPC: marcar password cambiada ─────────────────────────
-- Lo único que un usuario puede escribir sobre sí mismo: apagar el flag
-- debe_cambiar_password tras su primer cambio de contraseña.

create or replace function public.marcar_password_cambiada()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.usuarios
  set debe_cambiar_password = false
  where id = (select auth.uid())
$$;

revoke all on function public.marcar_password_cambiada() from public, anon;
grant execute on function public.marcar_password_cambiada() to authenticated;

-- ───────────────────────── anon: ningún acceso directo ─────────────────────────

revoke all on public.instituciones, public.grupos, public.usuarios,
              public.sesiones_asistencia, public.asistencias, public.auditoria
from anon;


-- ════════════════════════ migrations/20261009_05_trigger_validar_responsable.sql ════════════════════════

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


-- ════════════════════════ migrations/20261010_06_realtime_asistencia.sql ════════════════════════

-- Fase 4.1 — Habilita Realtime para el panel en tiempo real.
-- Realtime respeta RLS: cada usuario solo recibe los eventos de las filas
-- que sus políticas de "select" ya le permiten ver (sesiones_select,
-- asistencias_select de la migración 04).

alter publication supabase_realtime add table public.asistencias;
alter publication supabase_realtime add table public.sesiones_asistencia;


-- ════════════════════════ migrations/20261010_07_vistas_reportes.sql ════════════════════════

-- Fase 5.1 — Vistas de reportes. Todas con security_invoker = true para que
-- respeten las políticas RLS de quien consulta (sin esto, una vista saltaría
-- la seguridad y expondría datos de otras instituciones/grupos).

create or replace view public.v_asistencia_detalle with (security_invoker = true) as
select
  s.id                                             as sesion_id,
  s.institucion_id,
  s.grupo_id,
  g.nombre                                         as grupo,
  s.inicio,
  (s.inicio at time zone 'America/Santiago')::date as fecha,
  u.id                                             as usuario_id,
  u.nombre_completo,
  a.registrado_en,
  coalesce(a.estado, 'ausente')                    as estado   -- 'puntual' | 'tardanza' | 'ausente'
from public.sesiones_asistencia s
join public.grupos g    on g.id = s.grupo_id
join public.usuarios u  on u.grupo_id = s.grupo_id and u.rol = 'miembro'
                        and u.created_at <= s.inicio           -- no cuenta sesiones previas a que el miembro existiera
left join public.asistencias a on a.sesion_id = s.id and a.usuario_id = u.id
where (s.cerrada_en is not null or s.expira_en <= now())       -- solo sesiones terminadas
  and (u.activo or a.id is not null);                          -- miembros desactivados solo si tienen historial

-- Limitación conocida (documentada en decisiones-tecnicas.md): si un miembro
-- cambia de grupo, todo su historial pasa a atribuirse a su grupo actual,
-- porque el join usa usuarios.grupo_id (el actual), no uno histórico.

comment on view public.v_asistencia_detalle is
  'Una fila por (sesión terminada, miembro aplicable). estado es ''ausente'' si no hay registro. Fase 5.1.';

-- ───────────────────────── v_resumen_persona ─────────────────────────
-- Resumen histórico (todo el tiempo) por persona. El filtro por rango de
-- fechas de la pantalla de reportes se aplica consultando v_asistencia_detalle
-- directamente y agregando en el cliente con las mismas fórmulas.

create or replace view public.v_resumen_persona with (security_invoker = true) as
select
  institucion_id,
  grupo_id,
  grupo,
  usuario_id,
  nombre_completo,
  count(*)                                                                         as sesiones_total,
  count(*) filter (where estado <> 'ausente')                                      as asistidas,
  count(*) filter (where estado = 'tardanza')                                      as tardanzas,
  case when count(*) = 0 then null
       else round(100.0 * count(*) filter (where estado <> 'ausente') / count(*), 1)
  end as porcentaje_asistencia,
  case when count(*) = 0 then null
       else round(100.0 * count(*) filter (where estado = 'tardanza') / count(*), 1)
  end as porcentaje_tardanza,
  case when count(*) = 0 then null
       else round(100.0 - (100.0 * count(*) filter (where estado <> 'ausente') / count(*)), 1)
  end as porcentaje_ausentismo
from public.v_asistencia_detalle
group by institucion_id, grupo_id, grupo, usuario_id, nombre_completo;

comment on view public.v_resumen_persona is 'Resumen histórico (todo el tiempo) de asistencia por persona. Fase 5.1.';

-- ───────────────────────── v_resumen_grupo ─────────────────────────
-- % a nivel de grupo = promedio sobre todas las filas (persona x sesión) del
-- grupo, es decir, la tasa de asistencia agregada de todos sus miembros.

create or replace view public.v_resumen_grupo with (security_invoker = true) as
select
  institucion_id,
  grupo_id,
  grupo,
  count(distinct sesion_id)                                                        as sesiones_total,
  count(distinct usuario_id)                                                       as miembros_total,
  count(*) filter (where estado <> 'ausente')                                      as asistidas,
  count(*) filter (where estado = 'tardanza')                                      as tardanzas,
  case when count(*) = 0 then null
       else round(100.0 * count(*) filter (where estado <> 'ausente') / count(*), 1)
  end as porcentaje_asistencia,
  case when count(*) = 0 then null
       else round(100.0 * count(*) filter (where estado = 'tardanza') / count(*), 1)
  end as porcentaje_tardanza,
  case when count(*) = 0 then null
       else round(100.0 - (100.0 * count(*) filter (where estado <> 'ausente') / count(*)), 1)
  end as porcentaje_ausentismo
from public.v_asistencia_detalle
group by institucion_id, grupo_id, grupo;

comment on view public.v_resumen_grupo is 'Resumen histórico (todo el tiempo) de asistencia por grupo. Fase 5.1/5.4.';

grant select on public.v_asistencia_detalle to authenticated;
grant select on public.v_resumen_persona    to authenticated;
grant select on public.v_resumen_grupo      to authenticated;

revoke all on public.v_asistencia_detalle from anon;
revoke all on public.v_resumen_persona    from anon;
revoke all on public.v_resumen_grupo      from anon;


-- ════════════════════════ migrations/20261016_08_asignaturas.sql ════════════════════════

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


-- ════════════════════════ migrations/20261112_09_reportes_por_asignatura.sql ════════════════════════

-- Reportes por asignatura — agrega la asignatura a las vistas de reportes.
--
-- v_asistencia_detalle suma dos columnas AL FINAL (asignatura_id, asignatura). Postgres permite
-- "create or replace view" cuando solo se agregan columnas al final, y las vistas que dependen de
-- ella (v_resumen_persona, v_resumen_grupo) siguen funcionando sin cambios.
-- Las sesiones de grupo completo (sin asignatura, p. ej. instituciones corporativas) quedan con null.

create or replace view public.v_asistencia_detalle with (security_invoker = true) as
select
  s.id                                             as sesion_id,
  s.institucion_id,
  s.grupo_id,
  g.nombre                                         as grupo,
  s.inicio,
  (s.inicio at time zone 'America/Santiago')::date as fecha,
  u.id                                             as usuario_id,
  u.nombre_completo,
  a.registrado_en,
  coalesce(a.estado, 'ausente')                    as estado,   -- 'puntual' | 'tardanza' | 'ausente'
  s.asignatura_id,
  asg.nombre                                       as asignatura
from public.sesiones_asistencia s
join public.grupos g    on g.id = s.grupo_id
join public.usuarios u  on u.grupo_id = s.grupo_id and u.rol = 'miembro'
                        and u.created_at <= s.inicio
left join public.asistencias a   on a.sesion_id = s.id and a.usuario_id = u.id
left join public.asignaturas asg on asg.id = s.asignatura_id
where (s.cerrada_en is not null or s.expira_en <= now())
  and (u.activo or a.id is not null);

comment on view public.v_asistencia_detalle is
  'Una fila por (sesión terminada, miembro aplicable). estado es ''ausente'' si no hay registro. Incluye la asignatura de la sesión (null si es de grupo completo).';

-- Resumen histórico (todo el tiempo) por asignatura dentro de cada grupo.
create or replace view public.v_resumen_asignatura with (security_invoker = true) as
select
  institucion_id,
  grupo_id,
  grupo,
  asignatura_id,
  asignatura,
  count(distinct sesion_id)                                                        as sesiones_total,
  count(distinct usuario_id)                                                       as miembros_total,
  count(*) filter (where estado <> 'ausente')                                      as asistidas,
  count(*) filter (where estado = 'tardanza')                                      as tardanzas,
  case when count(*) = 0 then null
       else round(100.0 * count(*) filter (where estado <> 'ausente') / count(*), 1)
  end as porcentaje_asistencia,
  case when count(*) = 0 then null
       else round(100.0 * count(*) filter (where estado = 'tardanza') / count(*), 1)
  end as porcentaje_tardanza,
  case when count(*) = 0 then null
       else round(100.0 - (100.0 * count(*) filter (where estado <> 'ausente') / count(*)), 1)
  end as porcentaje_ausentismo
from public.v_asistencia_detalle
group by institucion_id, grupo_id, grupo, asignatura_id, asignatura;

comment on view public.v_resumen_asignatura is 'Resumen histórico de asistencia por asignatura (y grupo).';

grant select on public.v_asistencia_detalle  to authenticated;
grant select on public.v_resumen_asignatura  to authenticated;
revoke all on public.v_resumen_asignatura from anon;


-- ════════════════════════ migrations/20261112_10_solicitudes_asignatura.sql ════════════════════════

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


-- ════════════════════════ migrations/20261112_11_solicitudes_consultas.sql ════════════════════════

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


-- Migración 12 — Verificación de ubicación al registrar asistencia.
--
-- Dos modos (más "off"):
--   proximidad  el alumno debe estar dentro de la sede (radio de cientos de metros
--               alrededor de las coordenadas de la sede).
--   exacta      el alumno debe estar en la sala: a pocos metros del punto donde el
--               profesor inició la clase.
--
-- La regla se guarda en la institución y se COPIA a cada sesión al iniciarla, de modo
-- que cambiar la configuración no altera clases ya abiertas. La validación la hace la
-- Edge Function registrar-asistencia (nunca el navegador).

-- ───────── Configuración de la institución ─────────
alter table public.instituciones
  add column if not exists geo_modo            text not null default 'off',
  add column if not exists sede_lat            double precision,
  add column if not exists sede_lng            double precision,
  add column if not exists radio_proximidad_m  int  not null default 300,
  add column if not exists radio_exacto_m      int  not null default 40;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'instituciones_geo_modo_chk') then
    alter table public.instituciones
      add constraint instituciones_geo_modo_chk check (geo_modo in ('off', 'proximidad', 'exacta'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'instituciones_sede_rango_chk') then
    alter table public.instituciones
      add constraint instituciones_sede_rango_chk check (
        (sede_lat is null or sede_lat between -90 and 90)
        and (sede_lng is null or sede_lng between -180 and 180)
        and ((sede_lat is null) = (sede_lng is null))
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'instituciones_radios_chk') then
    alter table public.instituciones
      add constraint instituciones_radios_chk check (
        radio_proximidad_m between 50 and 5000 and radio_exacto_m between 10 and 200
      );
  end if;
  -- La proximidad necesita saber dónde está la sede.
  if not exists (select 1 from pg_constraint where conname = 'instituciones_proximidad_requiere_sede_chk') then
    alter table public.instituciones
      add constraint instituciones_proximidad_requiere_sede_chk check (
        geo_modo <> 'proximidad' or (sede_lat is not null and sede_lng is not null)
      );
  end if;
end $$;

-- ───────── Regla vigente en cada sesión (copia al iniciarla) ─────────
alter table public.sesiones_asistencia
  add column if not exists geo_modo      text not null default 'off',
  add column if not exists geo_lat       double precision,
  add column if not exists geo_lng       double precision,
  add column if not exists geo_radio_m   int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sesiones_geo_modo_chk') then
    alter table public.sesiones_asistencia
      add constraint sesiones_geo_modo_chk check (geo_modo in ('off', 'proximidad', 'exacta'));
  end if;
end $$;

-- ───────── Evidencia por asistencia ─────────
-- Solo se guardan la distancia al punto y la precisión del GPS. NO se guardan las
-- coordenadas del alumno: es un dato personal y no hace falta para auditar.
alter table public.asistencias
  add column if not exists geo_distancia_m  real,
  add column if not exists geo_precision_m  real;
