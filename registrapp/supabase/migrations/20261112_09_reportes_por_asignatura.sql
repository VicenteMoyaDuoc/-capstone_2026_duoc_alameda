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
