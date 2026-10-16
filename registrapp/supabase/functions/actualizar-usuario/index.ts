import { z } from 'npm:zod@3';
import { manejarPreflight } from '../_shared/cors.ts';
import { errorRespuesta, jsonRespuesta } from '../_shared/respuesta.ts';
import { clienteAdmin, generarPasswordTemporal, obtenerUsuarioLlamador, registrarAuditoria } from '../_shared/supabase-admin.ts';

// Un siglo: equivale a un baneo permanente en Supabase Auth (D-11: nunca se borra).
const BAN_PERMANENTE = '876000h';

const esquemaEntrada = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('editar'),
    usuario_id: z.string().uuid(),
    nombre_completo: z.string().trim().min(2).max(120).optional(),
    grupo_id: z.string().uuid().nullable().optional()
  }),
  z.object({ accion: z.literal('desactivar'), usuario_id: z.string().uuid() }),
  z.object({ accion: z.literal('reactivar'), usuario_id: z.string().uuid() }),
  z.object({ accion: z.literal('resetear_password'), usuario_id: z.string().uuid() })
]);

Deno.serve(async (req) => {
  const preflight = manejarPreflight(req);
  if (preflight) return preflight;

  const origin = req.headers.get('origin');

  if (req.method !== 'POST') {
    return errorRespuesta(405, 'metodo_no_permitido', 'Método no permitido.', origin);
  }

  const llamador = await obtenerUsuarioLlamador(req);
  if (!llamador || !llamador.usuarioId) {
    return errorRespuesta(401, 'no_autenticado', 'Debes iniciar sesión.', origin);
  }

  if (llamador.rol !== 'administrador' || !llamador.activo) {
    return errorRespuesta(403, 'sin_permiso', 'Solo un administrador puede modificar usuarios.', origin);
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
  const entrada = parseo.data;

  const { data: objetivo } = await admin
    .from('usuarios')
    .select('id, institucion_id, rol, activo, grupo_id')
    .eq('id', entrada.usuario_id)
    .maybeSingle();

  if (!objetivo || objetivo['institucion_id'] !== llamador.institucionId) {
    return errorRespuesta(404, 'no_encontrado', 'El usuario indicado no existe.', origin);
  }

  if (entrada.accion === 'editar') {
    if (entrada.grupo_id) {
      const { data: grupo } = await admin.from('grupos').select('institucion_id').eq('id', entrada.grupo_id).maybeSingle();
      if (!grupo || grupo['institucion_id'] !== llamador.institucionId) {
        return errorRespuesta(400, 'grupo_invalido', 'El grupo indicado no pertenece a tu institución.', origin);
      }
    }

    const cambios: Record<string, unknown> = {};
    if (entrada.nombre_completo !== undefined) cambios['nombre_completo'] = entrada.nombre_completo;
    if (entrada.grupo_id !== undefined) cambios['grupo_id'] = entrada.grupo_id;

    const { error } = await admin.from('usuarios').update(cambios).eq('id', entrada.usuario_id);
    if (error) return errorRespuesta(500, 'error_interno', 'No se pudo actualizar el usuario.', origin);

    await registrarAuditoria(admin, 'usuario_editado', llamador.institucionId, llamador.usuarioId, {
      usuario_editado_id: entrada.usuario_id
    });
    return jsonRespuesta(200, { ok: true }, origin);
  }

  if (entrada.accion === 'desactivar') {
    if (entrada.usuario_id === llamador.usuarioId) {
      return errorRespuesta(400, 'accion_invalida', 'No puedes desactivar tu propia cuenta.', origin);
    }
    if (objetivo['rol'] === 'administrador') {
      return errorRespuesta(400, 'accion_invalida', 'No puedes desactivar al único administrador de la institución.', origin);
    }

    const { error } = await admin.from('usuarios').update({ activo: false }).eq('id', entrada.usuario_id);
    if (error) return errorRespuesta(500, 'error_interno', 'No se pudo desactivar el usuario.', origin);

    await admin.auth.admin.updateUserById(entrada.usuario_id, { ban_duration: BAN_PERMANENTE });

    await registrarAuditoria(admin, 'usuario_desactivado', llamador.institucionId, llamador.usuarioId, {
      usuario_desactivado_id: entrada.usuario_id
    });
    return jsonRespuesta(200, { ok: true }, origin);
  }

  if (entrada.accion === 'reactivar') {
    const { error } = await admin.from('usuarios').update({ activo: true }).eq('id', entrada.usuario_id);
    if (error) return errorRespuesta(500, 'error_interno', 'No se pudo reactivar el usuario.', origin);

    await admin.auth.admin.updateUserById(entrada.usuario_id, { ban_duration: 'none' });

    await registrarAuditoria(admin, 'usuario_reactivado', llamador.institucionId, llamador.usuarioId, {
      usuario_reactivado_id: entrada.usuario_id
    });
    return jsonRespuesta(200, { ok: true }, origin);
  }

  // resetear_password
  const passwordTemporal = generarPasswordTemporal();
  const { error: errorPassword } = await admin.auth.admin.updateUserById(entrada.usuario_id, { password: passwordTemporal });
  if (errorPassword) return errorRespuesta(500, 'error_interno', 'No se pudo resetear la contraseña.', origin);

  await admin.from('usuarios').update({ debe_cambiar_password: true }).eq('id', entrada.usuario_id);

  await registrarAuditoria(admin, 'password_reseteada', llamador.institucionId, llamador.usuarioId, {
    usuario_afectado_id: entrada.usuario_id
  });

  return jsonRespuesta(200, { ok: true, data: { password_temporal: passwordTemporal } }, origin);
});
