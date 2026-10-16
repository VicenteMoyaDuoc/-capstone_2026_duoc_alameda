-- Fase 4.1 — Habilita Realtime para el panel en tiempo real.
-- Realtime respeta RLS: cada usuario solo recibe los eventos de las filas
-- que sus políticas de "select" ya le permiten ver (sesiones_select,
-- asistencias_select de la migración 04).

alter publication supabase_realtime add table public.asistencias;
alter publication supabase_realtime add table public.sesiones_asistencia;
