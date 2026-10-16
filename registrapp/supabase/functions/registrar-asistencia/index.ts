// Fase 3.2 — registrar-asistencia: un miembro marca su asistencia leyendo el QR (solo miembro).
import { z } from 'npm:zod@3';
import { manejarPreflight } from '../_shared/cors.ts';
import { jsonRespuesta, errorRespuesta } from '../_shared/respuesta.ts';
import { clienteAdmin, obtenerUsuarioLlamador, registrarAuditoria, type UsuarioLlamador } from '../_shared/supabase-admin.ts';
import { verificarToken } from '../_shared/qr.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const esquemaEntrada = z.object({ token: z.string().min(10).max(2000) });

const LIMITE_RECHAZOS = 10;
const VENTANA_RECHAZOS_MIN = 5;

const MENSAJES: Record<string, string> = {
  QR_INVALIDO: 'Este código QR no es válido.',
  QR_EXPIRADO: 'Este código QR ya venció. Pide a tu responsable que muestre el actualizado.',
  SESION_CERRADA: 'La sesión de asistencia ya terminó.',
  NO_PERTENECE: 'Este código no corresponde a tu grupo.'
};

function formatearHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
}

function dentroDeTolerancia(inicioIso: string, toleranciaMin: number, ahora: Date): boolean {
  const limite = new Date(new Date(inicioIso).getTime() + toleranciaMin * 60_000);
  return ahora <= limite;
}

async function rechazar(
  admin: SupabaseClient,
  status: number,
  code: string,
  llamador: UsuarioLlamador,
  detalle: Record<string, unknown>,
  origin: string | null
): Promise<Response> {
  await registrarAuditoria(admin, 'asistencia_rechazada', llamador.institucionId, llamador.usuarioId, { code, ...detalle });
  return errorRespuesta(status, code, MENSAJES[code] ?? 'No se pudo registrar tu asistencia.', origin);
}

async function respuestaYaRegistrado(
  admin: SupabaseClient,
  llamador: UsuarioLlamador,
  sesionId: string,
  registradoEn: string,
  origin: string | null
): Promise<Response> {
  await registrarAuditoria(admin, 'asistencia_rechazada', llamador.institucionId, llamador.usuarioId, {
    code: 'YA_REGISTRADO',
    sesion_id: sesionId
  });
  return jsonRespuesta(
    409,
    {
      ok: false,
      code: 'YA_REGISTRADO',
      message: `Ya registraste tu asistencia a las ${formatearHora(registradoEn)}.`,
      data: { registrado_en: registradoEn }
    },
    origin
  );
}

Deno.serve(async (req) => {
  const preflight = manejarPreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get('origin');

  if (req.method !== 'POST') {
    return errorRespuesta(405, 'metodo_no_permitido', 'Método no permitido.', origin);
  }

  const llamador = await obtenerUsuarioLlamador(req);
  if (!llamador || !llamador.usuarioId || !llamador.activo || llamador.rol !== 'miembro' || !llamador.grupoId) {
    return errorRespuesta(403, 'no_autorizado', 'No tienes permiso para esta acción.', origin);
  }

  const admin = clienteAdmin();

  const haceCincoMin = new Date(Date.now() - VENTANA_RECHAZOS_MIN * 60_000).toISOString();
  const { count: rechazosRecientes } = await admin
    .from('auditoria')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', llamador.usuarioId)
    .eq('evento', 'asistencia_rechazada')
    .gte('creado_en', haceCincoMin);

  if ((rechazosRecientes ?? 0) >= LIMITE_RECHAZOS) {
    return errorRespuesta(429, 'demasiados_intentos', 'Demasiados intentos. Espera unos minutos.', origin);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return rechazar(admin, 400, 'QR_INVALIDO', llamador, {}, origin);
  }

  const parseo = esquemaEntrada.safeParse(cuerpo);
  if (!parseo.success) {
    return rechazar(admin, 400, 'QR_INVALIDO', llamador, {}, origin);
  }

  const secreto = Deno.env.get('QR_SIGNING_SECRET')!;
  const verificacion = await verificarToken(parseo.data.token, secreto);

  if (!verificacion.ok) {
    const status = verificacion.code === 'QR_EXPIRADO' ? 410 : 400;
    return rechazar(admin, status, verificacion.code, llamador, {}, origin);
  }

  const sesionId = verificacion.payload.sid;

  const { data: sesion } = await admin.from('sesiones_asistencia').select('*').eq('id', sesionId).maybeSingle();

  const ahora = new Date();

  if (!sesion || sesion['cerrada_en'] !== null || (sesion['expira_en'] as string) < ahora.toISOString()) {
    return rechazar(admin, 409, 'SESION_CERRADA', llamador, { sesion_id: sesionId }, origin);
  }

  if (sesion['grupo_id'] !== llamador.grupoId || sesion['institucion_id'] !== llamador.institucionId) {
    return rechazar(admin, 403, 'NO_PERTENECE', llamador, { sesion_id: sesionId }, origin);
  }

  const { data: asistenciaExistente } = await admin
    .from('asistencias')
    .select('registrado_en')
    .eq('sesion_id', sesionId)
    .eq('usuario_id', llamador.usuarioId)
    .maybeSingle();

  if (asistenciaExistente) {
    return respuestaYaRegistrado(admin, llamador, sesionId, asistenciaExistente['registrado_en'] as string, origin);
  }

  const estado = dentroDeTolerancia(sesion['inicio'] as string, sesion['tolerancia_min'] as number, ahora) ? 'puntual' : 'tardanza';

  const { data: nuevaAsistencia, error: errorInsert } = await admin
    .from('asistencias')
    .insert({
      institucion_id: llamador.institucionId,
      sesion_id: sesionId,
      grupo_id: sesion['grupo_id'],
      asignatura_id: sesion['asignatura_id'] ?? null,
      usuario_id: llamador.usuarioId,
      estado,
      origen: 'qr'
    })
    .select('registrado_en')
    .single();

  if (errorInsert || !nuevaAsistencia) {
    // Condición de carrera: otra petición ya insertó (viola el unique (sesion_id, usuario_id)).
    const { data: asistenciaDespuesDeCarrera } = await admin
      .from('asistencias')
      .select('registrado_en')
      .eq('sesion_id', sesionId)
      .eq('usuario_id', llamador.usuarioId)
      .maybeSingle();

    if (asistenciaDespuesDeCarrera) {
      return respuestaYaRegistrado(admin, llamador, sesionId, asistenciaDespuesDeCarrera['registrado_en'] as string, origin);
    }

    await registrarAuditoria(admin, 'asistencia_rechazada', llamador.institucionId, llamador.usuarioId, {
      code: 'error_interno',
      sesion_id: sesionId
    });
    return errorRespuesta(500, 'error_interno', 'No se pudo registrar tu asistencia.', origin);
  }

  const { data: grupoInfo } = await admin.from('grupos').select('id, nombre').eq('id', sesion['grupo_id']).maybeSingle();

  let asignaturaInfo: { id: string; nombre: string } | null = null;
  if (sesion['asignatura_id']) {
    const { data } = await admin.from('asignaturas').select('id, nombre').eq('id', sesion['asignatura_id']).maybeSingle();
    asignaturaInfo = (data as { id: string; nombre: string } | null) ?? null;
  }

  return jsonRespuesta(
    200,
    {
      ok: true,
      data: {
        estado,
        registrado_en: nuevaAsistencia['registrado_en'],
        grupo: grupoInfo,
        asignatura: asignaturaInfo,
        sesion: { id: sesion['id'] }
      }
    },
    origin
  );
});
