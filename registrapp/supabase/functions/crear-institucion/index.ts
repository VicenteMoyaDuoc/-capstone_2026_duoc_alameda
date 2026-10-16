import { z } from 'npm:zod@3';
import { manejarPreflight } from '../_shared/cors.ts';
import { errorRespuesta, jsonRespuesta } from '../_shared/respuesta.ts';
import { clienteAdmin, obtenerUsuarioLlamador, registrarAuditoria } from '../_shared/supabase-admin.ts';

const LIMITE_INTENTOS_POR_HORA = 3;

const esquemaEntrada = z.object({
  nombre: z.string().trim().min(3).max(120),
  tipo: z.enum(['educativa', 'corporativa']),
  nombre_completo: z.string().trim().min(2).max(120)
});

Deno.serve(async (req) => {
  const preflight = manejarPreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get('origin');

  if (req.method !== 'POST') {
    return errorRespuesta(405, 'metodo_no_permitido', 'Método no permitido.', origin);
  }

  const llamador = await obtenerUsuarioLlamador(req);
  if (!llamador) {
    return errorRespuesta(401, 'no_autenticado', 'Debes iniciar sesión.', origin);
  }

  if (llamador.usuarioId) {
    return errorRespuesta(409, 'ya_tiene_institucion', 'Tu cuenta ya pertenece a una institución.', origin);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return errorRespuesta(400, 'json_invalido', 'El cuerpo de la petición no es un JSON válido.', origin);
  }

  const parseo = esquemaEntrada.safeParse(cuerpo);
  if (!parseo.success) {
    return errorRespuesta(400, 'datos_invalidos', 'Revisa los datos del formulario.', origin);
  }

  const { nombre, tipo, nombre_completo } = parseo.data;
  const admin = clienteAdmin();

  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from('auditoria')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', llamador.authUserId)
    .eq('evento', 'institucion_creada_intento')
    .gte('creado_en', haceUnaHora);

  if ((count ?? 0) >= LIMITE_INTENTOS_POR_HORA) {
    return errorRespuesta(429, 'demasiados_intentos', 'Demasiados intentos. Vuelve a intentarlo más tarde.', origin);
  }

  await registrarAuditoria(admin, 'institucion_creada_intento', null, llamador.authUserId);

  const { data: authUser } = await admin.auth.admin.getUserById(llamador.authUserId);
  const email = authUser.user?.email;
  if (!email) {
    return errorRespuesta(500, 'error_interno', 'No se pudo completar la operación.', origin);
  }

  const { data: institucion, error: errorInstitucion } = await admin
    .from('instituciones')
    .insert({ nombre, tipo })
    .select('id')
    .single();

  if (errorInstitucion || !institucion) {
    return errorRespuesta(500, 'error_interno', 'No se pudo crear la institución.', origin);
  }

  const { error: errorUsuario } = await admin.from('usuarios').insert({
    id: llamador.authUserId,
    institucion_id: institucion['id'],
    nombre_completo,
    email: email.toLowerCase(),
    rol: 'administrador'
  });

  if (errorUsuario) {
    // Rollback manual: no debe quedar una institución huérfana.
    await admin.from('instituciones').delete().eq('id', institucion['id']);
    return errorRespuesta(500, 'error_interno', 'No se pudo completar la operación.', origin);
  }

  await registrarAuditoria(admin, 'institucion_creada', institucion['id'], llamador.authUserId, {
    institucion_id: institucion['id']
  });

  return jsonRespuesta(200, { ok: true, data: { institucion_id: institucion['id'] } }, origin);
});
