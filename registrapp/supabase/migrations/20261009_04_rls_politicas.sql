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
