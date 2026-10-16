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
