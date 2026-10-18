// Permite solo el origen de la app en producción (APP_URL), el de desarrollo
// local, y cualquier IP de red local en el puerto del dev server (para poder
// probar la app desde el celular con "ng serve --host 0.0.0.0" sin tener que
// hardcodear la IP de cada red WiFi).
const ORIGEN_DEV = 'http://localhost:4200';
const ORIGEN_DEV_LAN = /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}):4200$/;

export function construirCorsHeaders(origin: string | null): Record<string, string> {
  const origenApp = Deno.env.get('APP_URL') ?? '';
  const permitidos = [origenApp, ORIGEN_DEV].filter(Boolean);
  const esDevLan = !!origin && ORIGEN_DEV_LAN.test(origin);
  const origenPermitido = origin && (permitidos.includes(origin) || esDevLan) ? origin : permitidos[0] ?? ORIGEN_DEV;

  return {
    'Access-Control-Allow-Origin': origenPermitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin'
  };
}

export function manejarPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: construirCorsHeaders(req.headers.get('origin')) });
  }
  return null;
}
