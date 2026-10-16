// Fase 3.2 — sesion-asistencia: iniciar / renovar / cerrar (solo responsable).
import { z } from 'npm:zod@3';
import { manejarPreflight } from '../_shared/cors.ts';
import { jsonRespuesta, errorRespuesta } from '../_shared/respuesta.ts';
import { clienteAdmin, obtenerUsuarioLlamador, registrarAuditoria, type UsuarioLlamador } from '../_shared/supabase-admin.ts';
import { firmarToken, generarJti, type PayloadToken } from '../_shared/qr.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const esquemaEntrada = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('iniciar'), grupo_id: z.string().uuid(), asignatura_id: z.string().uuid().nullable().optional() }),
  z.object({ accion: z.literal('renovar'), sesion_id: z.string().uuid() }),
  z.object({ accion: z.literal('cerrar'), sesion_id: z.string().uuid() })
]);

async function generarTokenParaSesion(
  sesionId: string,
  qrTtlSeg: number
): Promise<{ token: string; tokenExpiraEn: number }> {
  const secreto = Deno.env.get('QR_SIGNING_SECRET')!;
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + qrTtlSeg;
  const payload: PayloadToken = { v: 1, sid: sesionId, iat, exp, jti: generarJti() };
  const token = await firmarToken(payload, secreto);
  return { token, tokenExpiraEn: exp * 1000 };
}

type SesionRow = Record<string, unknown>;

async function cargarSesionYVerificarResponsable(
  admin: SupabaseClient,
  llamador: UsuarioLlamador,
  sesionId: string
): Promise<{ sesion: SesionRow } | { error: 'no_encontrada' | 'no_autorizado' }> {
  const { data: sesion } = await admin.from('sesiones_asistencia').select('*').eq('id', sesionId).maybeSingle();

  if (!sesion || sesion['institucion_id'] !== llamador.institucionId) {
    return { error: 'no_encontrada' };
  }

  if (sesion['asignatura_id']) {
    const { data: asignatura } = await admin
      .from('asignaturas')
      .select('responsable_id')
      .eq('id', sesion['asignatura_id'])
      .maybeSingle();

    if (!asignatura || asignatura['responsable_id'] !== llamador.usuarioId) {
      return { error: 'no_autorizado' };
    }
  } else {
    const { data: grupo } = await admin.from('grupos').select('responsable_id').eq('id', sesion['grupo_id']).maybeSingle();

    if (!grupo || grupo['responsable_id'] !== llamador.usuarioId) {
      return { error: 'no_autorizado' };
    }
  }

  return { sesion };
}

async function manejarIniciar(
  admin: SupabaseClient,
  llamador: UsuarioLlamador,
  grupoId: string,
  asignaturaId: string | null,
  origin: string | null
): Promise<Response> {
  const { data: grupo } = await admin
    .from('grupos')
    .select('id, institucion_id, responsable_id, activo')
    .eq('id', grupoId)
    .maybeSingle();

  if (!grupo || grupo['institucion_id'] !== llamador.institucionId) {
    return errorRespuesta(403, 'no_autorizado', 'No eres responsable de este grupo.', origin);
  }

  if (asignaturaId) {
    const { data: asignatura } = await admin
      .from('asignaturas')
      .select('id, grupo_id, responsable_id, activo')
      .eq('id', asignaturaId)
      .maybeSingle();

    if (!asignatura || asignatura['grupo_id'] !== grupoId || asignatura['responsable_id'] !== llamador.usuarioId) {
      return errorRespuesta(403, 'no_autorizado', 'No eres responsable de esta asignatura.', origin);
    }
    if (!asignatura['activo']) {
      return errorRespuesta(409, 'asignatura_inactiva', 'Esta asignatura está inactiva.', origin);
    }
  } else if (grupo['responsable_id'] !== llamador.usuarioId) {
    return errorRespuesta(403, 'no_autorizado', 'No eres responsable de este grupo.', origin);
  }

  if (!grupo['activo']) {
    return errorRespuesta(409, 'grupo_inactivo', 'Este grupo está inactivo.', origin);
  }

  const { data: institucion } = await admin
    .from('instituciones')
    .select('tolerancia_min, duracion_sesion_min, qr_ttl_seg')
    .eq('id', llamador.institucionId)
    .single();

  if (!institucion) {
    return errorRespuesta(500, 'error_interno', 'No se pudo completar la operación.', origin);
  }

  const ahoraIso = new Date().toISOString();

  // Cierra automáticamente cualquier sesión previa vencida (de esta asignatura, o de este
  // grupo sin asignatura si no hay subdivisión por materia).
  const cierreVencidas = admin
    .from('sesiones_asistencia')
    .update({ cerrada_en: ahoraIso })
    .is('cerrada_en', null)
    .lt('expira_en', ahoraIso);
  await (asignaturaId ? cierreVencidas.eq('asignatura_id', asignaturaId) : cierreVencidas.eq('grupo_id', grupoId).is('asignatura_id', null));

  const sesionExistente = await buscarSesionAbierta(admin, grupoId, asignaturaId);
  if (sesionExistente) {
    return await respuestaSesionYaAbierta(sesionExistente, origin);
  }

  const inicio = new Date();
  const expiraEn = new Date(inicio.getTime() + (institucion['duracion_sesion_min'] as number) * 60_000);

  const { data: nuevaSesion, error: errorInsert } = await admin
    .from('sesiones_asistencia')
    .insert({
      institucion_id: llamador.institucionId,
      grupo_id: grupoId,
      asignatura_id: asignaturaId,
      creada_por: llamador.usuarioId,
      inicio: inicio.toISOString(),
      expira_en: expiraEn.toISOString(),
      tolerancia_min: institucion['tolerancia_min'],
      qr_ttl_seg: institucion['qr_ttl_seg']
    })
    .select('*')
    .single();

  if (errorInsert || !nuevaSesion) {
    // Carrera: otra petición ganó e insertó primero (índice único de sesión abierta).
    const sesionConcurrente = await buscarSesionAbierta(admin, grupoId, asignaturaId);
    if (sesionConcurrente) {
      return await respuestaSesionYaAbierta(sesionConcurrente, origin);
    }
    return errorRespuesta(500, 'error_interno', 'No se pudo iniciar la sesión.', origin);
  }

  await registrarAuditoria(admin, 'sesion_iniciada', llamador.institucionId, llamador.usuarioId, {
    sesion_id: nuevaSesion['id'],
    grupo_id: grupoId,
    asignatura_id: asignaturaId
  });

  const { token, tokenExpiraEn } = await generarTokenParaSesion(nuevaSesion['id'] as string, nuevaSesion['qr_ttl_seg'] as number);

  return jsonRespuesta(
    200,
    { ok: true, data: { sesion: nuevaSesion, token, servidor_ahora: Date.now(), token_expira_en: tokenExpiraEn } },
    origin
  );
}

async function buscarSesionAbierta(admin: SupabaseClient, grupoId: string, asignaturaId: string | null): Promise<SesionRow | null> {
  const consulta = admin.from('sesiones_asistencia').select('*').is('cerrada_en', null);
  const { data } = await (asignaturaId
    ? consulta.eq('asignatura_id', asignaturaId)
    : consulta.eq('grupo_id', grupoId).is('asignatura_id', null)
  ).maybeSingle();
  return data ?? null;
}

async function respuestaSesionYaAbierta(sesion: SesionRow, origin: string | null): Promise<Response> {
  const { token, tokenExpiraEn } = await generarTokenParaSesion(sesion['id'] as string, sesion['qr_ttl_seg'] as number);
  return jsonRespuesta(
    409,
    {
      ok: false,
      code: 'SESION_YA_ABIERTA',
      message: 'Ya existe una sesión de asistencia abierta para este grupo.',
      data: { sesion, token, servidor_ahora: Date.now(), token_expira_en: tokenExpiraEn }
    },
    origin
  );
}

async function manejarRenovar(
  admin: SupabaseClient,
  llamador: UsuarioLlamador,
  sesionId: string,
  origin: string | null
): Promise<Response> {
  const resultado = await cargarSesionYVerificarResponsable(admin, llamador, sesionId);
  if ('error' in resultado) {
    return resultado.error === 'no_encontrada'
      ? errorRespuesta(404, 'no_encontrada', 'La sesión no existe.', origin)
      : errorRespuesta(403, 'no_autorizado', 'No eres responsable de esta sesión.', origin);
  }

  const { sesion } = resultado;
  const ahoraIso = new Date().toISOString();

  if (sesion['cerrada_en'] !== null || (sesion['expira_en'] as string) < ahoraIso) {
    return errorRespuesta(409, 'SESION_CERRADA', 'La sesión de asistencia ya terminó.', origin);
  }

  const { token, tokenExpiraEn } = await generarTokenParaSesion(sesion['id'] as string, sesion['qr_ttl_seg'] as number);

  return jsonRespuesta(200, { ok: true, data: { token, servidor_ahora: Date.now(), token_expira_en: tokenExpiraEn } }, origin);
}

async function manejarCerrar(
  admin: SupabaseClient,
  llamador: UsuarioLlamador,
  sesionId: string,
  origin: string | null
): Promise<Response> {
  const resultado = await cargarSesionYVerificarResponsable(admin, llamador, sesionId);
  if ('error' in resultado) {
    return resultado.error === 'no_encontrada'
      ? errorRespuesta(404, 'no_encontrada', 'La sesión no existe.', origin)
      : errorRespuesta(403, 'no_autorizado', 'No eres responsable de esta sesión.', origin);
  }

  await admin.from('sesiones_asistencia').update({ cerrada_en: new Date().toISOString() }).eq('id', sesionId).is('cerrada_en', null);

  await registrarAuditoria(admin, 'sesion_cerrada', llamador.institucionId, llamador.usuarioId, { sesion_id: sesionId });

  return jsonRespuesta(200, { ok: true, data: { servidor_ahora: Date.now() } }, origin);
}

Deno.serve(async (req) => {
  const preflight = manejarPreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get('origin');

  if (req.method !== 'POST') {
    return errorRespuesta(405, 'metodo_no_permitido', 'Método no permitido.', origin);
  }

  const llamador = await obtenerUsuarioLlamador(req);
  if (!llamador || !llamador.usuarioId || !llamador.activo) {
    return errorRespuesta(401, 'no_autenticado', 'Debes iniciar sesión.', origin);
  }

  if (llamador.rol !== 'responsable') {
    return errorRespuesta(403, 'no_autorizado', 'No tienes permiso para esta acción.', origin);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return errorRespuesta(400, 'json_invalido', 'El cuerpo de la petición no es un JSON válido.', origin);
  }

  const parseo = esquemaEntrada.safeParse(cuerpo);
  if (!parseo.success) {
    return errorRespuesta(400, 'datos_invalidos', 'Revisa los datos enviados.', origin);
  }

  const admin = clienteAdmin();

  switch (parseo.data.accion) {
    case 'iniciar':
      return manejarIniciar(admin, llamador, parseo.data.grupo_id, parseo.data.asignatura_id ?? null, origin);
    case 'renovar':
      return manejarRenovar(admin, llamador, parseo.data.sesion_id, origin);
    case 'cerrar':
      return manejarCerrar(admin, llamador, parseo.data.sesion_id, origin);
  }
});
