import { construirCorsHeaders } from './cors.ts';

export interface CuerpoRespuesta<T = unknown> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

export function jsonRespuesta<T>(status: number, cuerpo: CuerpoRespuesta<T>, origin: string | null): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...construirCorsHeaders(origin), 'Content-Type': 'application/json' }
  });
}

export function errorRespuesta(status: number, code: string, message: string, origin: string | null): Response {
  return jsonRespuesta(status, { ok: false, code, message }, origin);
}
