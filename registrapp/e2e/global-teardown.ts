import { createClient } from '@supabase/supabase-js';

/**
 * Limpia todo lo que haya creado la prueba, corriendo en el mismo proceso principal que
 * global-setup.ts (por eso `process.env` todavía tiene E2E_SUFIJO/E2E_ADMIN_AUTH_ID).
 *
 * Borrar la fila de `instituciones` basta para que la base de datos (vía ON DELETE CASCADE)
 * se lleve puestos sus grupos, usuarios, sesiones_asistencia y asistencias — verificado contra
 * el esquema real (information_schema.referential_constraints). Lo único que ese cascade NO
 * cubre son las cuentas de auth.users, que se borran aparte con la Admin API.
 */
export default async function globalTeardown(): Promise<void> {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const sufijo = process.env['E2E_SUFIJO'];
  const adminAuthId = process.env['E2E_ADMIN_AUTH_ID'];

  if (!supabaseUrl || !serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const idsAuthABorrar = new Set<string>();
  if (adminAuthId) idsAuthABorrar.add(adminAuthId);

  if (sufijo) {
    const nombreInstitucion = `E2E Institución ${sufijo}`;
    const { data: institucion } = await admin.from('instituciones').select('id').eq('nombre', nombreInstitucion).maybeSingle();

    if (institucion) {
      const { data: usuarios } = await admin.from('usuarios').select('id').eq('institucion_id', institucion['id']);
      for (const usuario of usuarios ?? []) idsAuthABorrar.add(usuario['id']);

      await admin.from('instituciones').delete().eq('id', institucion['id']);
    }
  }

  for (const id of idsAuthABorrar) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }
}
