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
