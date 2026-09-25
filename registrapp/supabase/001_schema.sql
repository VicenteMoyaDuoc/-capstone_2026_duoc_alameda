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
