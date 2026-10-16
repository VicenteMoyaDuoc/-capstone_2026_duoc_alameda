import { defineConfig, devices } from '@playwright/test';

const PUERTO = 4300;
const BASE_URL = process.env['E2E_BASE_URL'] ?? `http://localhost:${PUERTO}`;

/**
 * Fase 6.1 — E2E. Corre contra un "ng serve" real (modo desarrollo) para poder leer el estado
 * de los componentes con utilidades de depuración de Angular cuando hace falta (por ejemplo,
 * tomar la URL del QR sin tener que decodificar la imagen).
 *
 * Se define en dos navegadores (Chromium y Firefox) como pide la especificación de la Fase 6.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  globalTeardown: require.resolve('./e2e/global-teardown.ts'),
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } }
  ],
  webServer: {
    command: `npx ng serve --configuration development --port ${PUERTO}`,
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000
  }
});
