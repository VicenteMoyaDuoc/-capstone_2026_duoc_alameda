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
