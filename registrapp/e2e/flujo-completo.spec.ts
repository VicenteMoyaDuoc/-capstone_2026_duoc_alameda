import { test, expect, type Page } from '@playwright/test';

/**
 * Fase 6.1 — E2E del flujo completo (historia 015):
 *   1) una cuenta de administrador ya confirmada (creada en global-setup.ts, porque no se puede
 *      hacer clic en un correo real desde una prueba automatizada) crea su institución (onboarding);
 *   2) el administrador crea un grupo, un responsable y un miembro;
 *   3) el responsable inicia una sesión de asistencia y ve el QR;
 *   4) el miembro abre el link del QR (sin sesión todavía), inicia sesión, cambia su contraseña
 *      temporal y queda registrada su asistencia;
 *   5) el responsable ve aparecer esa asistencia en vivo (Realtime), sin recargar la página;
 *   6) el administrador exporta el reporte.
 *
 * No hay cámara real en CI, así que en vez de escanear el QR con video, se navega directo a la
 * URL que el QR codifica (`qrUrl`), tomada del propio componente del responsable — funcionalmente
 * equivalente a un escaneo exitoso (es exactamente la URL que la cámara leería del código).
 *
 * El administrador, el responsable y el miembro usan 3 BrowserContext separados: comparten el
 * mismo origen y por lo tanto la misma clave de localStorage de Supabase Auth, así que reusar una
 * sola pestaña para más de un usuario pisaría la sesión de los demás.
 */

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

async function cambiarPassword(page: Page, nuevaPassword: string): Promise<void> {
  await expect(page).toHaveURL(/\/cambiar-password/);
  await page.locator('#password').fill(nuevaPassword);
  await page.locator('#confirmacion').fill(nuevaPassword);
  await page.getByRole('button', { name: 'Guardar y continuar' }).click();
}

/** Abre un p-select/p-dropdown (por su `inputId`) y elige la opción visible con ese texto. */
async function elegirEnSelect(page: Page, inputId: string, textoOpcion: string): Promise<void> {
  await page.locator(`#${inputId}`).click();
  await page.getByRole('option', { name: textoOpcion, exact: false }).first().click();
}

/** Lee la contraseña temporal del diálogo que aparece tras crear/resetear un usuario, y lo cierra. */
async function leerPasswordTemporalYCerrar(page: Page): Promise<string> {
  const dialogo = page.getByRole('dialog', { name: 'Contraseña temporal' });
  await expect(dialogo).toBeVisible();
  const password = (await dialogo.locator('code').innerText()).trim();
  await dialogo.getByRole('button', { name: 'Listo' }).click();
  await expect(dialogo).not.toBeVisible();
  return password;
}

test('flujo completo: institución, grupo/usuarios, sesión de asistencia, registro y reporte', async ({ browser }) => {
  const sufijo = process.env['E2E_SUFIJO'];
  const adminEmail = process.env['E2E_ADMIN_EMAIL'];
  const adminPassword = process.env['E2E_ADMIN_PASSWORD'];

  if (!sufijo || !adminEmail || !adminPassword) {
    throw new Error('Faltan variables E2E_* — ¿corriste esta prueba sin pasar por global-setup.ts (playwright.config.ts)?');
  }

  const institucionNombre = `E2E Institución ${sufijo}`;
  const grupoNombre = `Curso E2E ${sufijo}`;
  const responsableEmail = `e2e-responsable-${sufijo}@registrapp.test`;
  const miembroEmail = `e2e-miembro-${sufijo}@registrapp.test`;
  const nombreMiembro = 'Miembro E2E';

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();

  await test.step('1) la cuenta de administrador crea su institución (onboarding)', async () => {
    await login(adminPage, adminEmail, adminPassword);
    await expect(adminPage).toHaveURL(/\/onboarding\/institucion/);

    await adminPage.locator('#nombre').fill(institucionNombre);
    await adminPage.locator('#nombre_completo').fill('Admin E2E');
    await adminPage.getByRole('button', { name: 'Crear institución' }).click();

    await expect(adminPage).toHaveURL(/\/admin/);
  });

  let responsablePassword = '';
  let miembroPassword = '';

  await test.step('2) el administrador crea un responsable, un grupo y un miembro', async () => {
    await adminPage.goto('/admin/usuarios');
    await adminPage.getByRole('button', { name: 'Nuevo usuario' }).click();
    await adminPage.locator('#email').fill(responsableEmail);
    await adminPage.locator('#nombre_completo').fill('Responsable E2E');
    await elegirEnSelect(adminPage, 'rol', 'Profesor');
    await adminPage.getByRole('button', { name: 'Crear usuario' }).click();
    responsablePassword = await leerPasswordTemporalYCerrar(adminPage);

    await adminPage.goto('/admin/grupos');
    await adminPage.getByRole('button', { name: /Nuevo curso/i }).click();
    await adminPage.locator('#nombre').fill(grupoNombre);
    await elegirEnSelect(adminPage, 'responsable', 'Responsable E2E');
    await adminPage.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(adminPage.getByText(grupoNombre)).toBeVisible();

    await adminPage.goto('/admin/usuarios');
    await adminPage.getByRole('button', { name: 'Nuevo usuario' }).click();
    await adminPage.locator('#email').fill(miembroEmail);
    await adminPage.locator('#nombre_completo').fill(nombreMiembro);
    await elegirEnSelect(adminPage, 'grupo_id', grupoNombre);
    await adminPage.getByRole('button', { name: 'Crear usuario' }).click();
    miembroPassword = await leerPasswordTemporalYCerrar(adminPage);
  });

  const responsableContext = await browser.newContext();
  const responsablePage = await responsableContext.newPage();
  let qrUrl = '';

  await test.step('3) el responsable inicia sesión (de asistencia) y ve el QR', async () => {
    await login(responsablePage, responsableEmail, responsablePassword);
    await cambiarPassword(responsablePage, 'ResponsableE2E-Nueva-123');
    await expect(responsablePage).toHaveURL(/\/responsable/);

    await responsablePage.getByRole('button', { name: /Iniciar clase/i }).click();
    await expect(responsablePage.locator('.qr-contenedor')).toBeVisible();

    qrUrl = await responsablePage.evaluate(() => {
      const el = document.querySelector('app-panel');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const componente = (window as any).ng?.getComponent?.(el);
      return componente?.qrUrl ?? '';
    });
    expect(qrUrl).toContain('/asistir#t=');
  });

  const miembroContext = await browser.newContext();
  const miembroPage = await miembroContext.newPage();

  await test.step('4) el miembro abre el QR, inicia sesión, cambia su contraseña y registra su asistencia', async () => {
    await miembroPage.goto(qrUrl);
    await expect(miembroPage).toHaveURL(/\/login/);

    await miembroPage.locator('#email').fill(miembroEmail);
    await miembroPage.locator('#password').fill(miembroPassword);
    await miembroPage.getByRole('button', { name: 'Ingresar' }).click();

    await cambiarPassword(miembroPage, 'MiembroE2E-Nueva-123');

    await expect(miembroPage).toHaveURL(/\/asistir/);
    await expect(miembroPage.getByRole('heading', { name: /Llegaste a tiempo|Asistencia registrada/ })).toBeVisible();
  });

  await test.step('5) el responsable ve la asistencia aparecer en vivo, sin recargar', async () => {
    await expect(responsablePage.getByText(nombreMiembro)).toBeVisible({ timeout: 15_000 });
  });

  await test.step('6) el administrador exporta el reporte', async () => {
    await adminPage.goto('/admin/reportes');
    await elegirEnSelect(adminPage, 'filtro-curso', grupoNombre);
    await expect(adminPage.getByText(nombreMiembro)).toBeVisible();

    const [descarga] = await Promise.all([
      adminPage.waitForEvent('download'),
      adminPage.getByRole('button', { name: 'Excel' }).click()
    ]);
    expect(descarga.suggestedFilename()).toMatch(/\.xlsx$/);
  });

  await adminContext.close();
  await responsableContext.close();
  await miembroContext.close();
});
