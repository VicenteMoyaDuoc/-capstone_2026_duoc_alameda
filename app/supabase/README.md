# Supabase — Registrapp (Semanas 1-2)

Estos scripts no se ejecutan solos: hay que correrlos manualmente en el
SQL Editor de tu proyecto de Supabase, en este orden.

## Pasos

1. Crea un proyecto en https://supabase.com (o usa uno existente vacío).
2. Ve a **SQL Editor** y ejecuta, en orden:
   1. `001_schema.sql` — crea las 3 tablas.
   2. `002_rls.sql` — activa RLS y crea las políticas + funciones helper.
3. Ve a **Authentication → Users → Add user** y crea manualmente los usuarios
   de prueba listados en `003_seed_template.sql` (email + password). Copia el
   UUID que Supabase le asigna a cada uno.
4. Edita `003_seed_template.sql`, reemplaza los `<UUID_...>` por los UUID reales,
   y ejecútalo en el SQL Editor.
5. Ve a **Project Settings → API** y copia:
   - `Project URL` → pégalo en `supabaseUrl` en
     `src/environments/environment.ts` y `environment.development.ts`.
   - `anon public key` → pégalo en `supabaseKey` en esos mismos archivos.

## Verificación del checklist (aislamiento entre instituciones)

Repite los pasos 1-4 (institución, grupo y usuarios) para una **segunda
institución**, con otro set de usuarios de prueba. Luego:

- Inicia sesión con un usuario de la institución A.
- Confirma que en `/admin` (o el rol que corresponda) solo ves los grupos y
  usuarios de la institución A, nunca los de la institución B.
- Repite con un usuario de la institución B.
