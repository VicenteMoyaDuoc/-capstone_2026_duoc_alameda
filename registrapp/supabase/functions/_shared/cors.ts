// Permite solo el origen de la app en producción (APP_URL) y el de desarrollo local.
const ORIGEN_DEV = 'http://localhost:4200';

export function construirCorsHeaders(origin: string | null): Record<string, string> {
  const origenApp = Deno.env.get('APP_URL') ?? '';
  const permitidos = [origenApp, ORIGEN_DEV].filter(Boolean);
  const origenPermitido = origin && permitidos.includes(origin) ? origin : permitidos[0] ?? ORIGEN_DEV;

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
