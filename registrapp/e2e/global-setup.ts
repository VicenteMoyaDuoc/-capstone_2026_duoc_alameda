import { createClient } from '@supabase/supabase-js';

/**
 * Corre una sola vez en el proceso principal de Playwright, antes de levantar los workers.
 * Los workers heredan `process.env` tal como queda al terminar esta función, así que lo usamos
 * para pasarles las credenciales de la cuenta de prueba que creamos acá.
 *
 * No se puede hacer clic en un correo de confirmación real desde una prueba automatizada, así que
 * precreamos la cuenta de administrador ya confirmada con la Admin API (service_role key). El resto
 * del flujo (onboarding, crear grupo/usuarios, iniciar sesión de asistencia, registrar asistencia,
 * exportar) sí se maneja 100% desde la UI, como lo haría una persona real.
 */
export default async function globalSetup(): Promise<void> {
  try {
    process.loadEnvFile('.env.e2e');
  } catch {
    // No existe .env.e2e (por ejemplo en CI): se espera que las variables ya estén exportadas.
  }

  const supabaseUrl = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. Copia .env.e2e.example a .env.e2e y completa los valores, ' +
        'o exporta ambas variables antes de correr "npm run e2e".'
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const sufijo = Date.now().toString();
  const emailAdmin = `e2e-admin-${sufijo}@registrapp.test`;
  const passwordAdmin = 'ClaveE2E-Admin-12345';

  const { data, error } = await admin.auth.admin.createUser({
    email: emailAdmin,
    password: passwordAdmin,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(`No se pudo crear la cuenta de administrador de prueba: ${error?.message ?? 'respuesta vacía'}`);
  }

  process.env['E2E_SUFIJO'] = sufijo;
  process.env['E2E_ADMIN_EMAIL'] = emailAdmin;
  process.env['E2E_ADMIN_PASSWORD'] = passwordAdmin;
  process.env['E2E_ADMIN_AUTH_ID'] = data.user.id;
}
