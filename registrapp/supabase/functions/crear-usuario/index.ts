import { z } from 'npm:zod@3';
import { manejarPreflight } from '../_shared/cors.ts';
import { errorRespuesta, jsonRespuesta } from '../_shared/respuesta.ts';
import { clienteAdmin, generarPasswordTemporal, obtenerUsuarioLlamador, registrarAuditoria } from '../_shared/supabase-admin.ts';

const esquemaEntrada = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    nombre_completo: z.string().trim().min(2).max(120),
    rol: z.enum(['responsable', 'miembro']),
    grupo_id: z.string().uuid().nullable().optional(),
    // Carga masiva (Fase 4, ampliación): el admin puede fijar una contraseña temporal
    // compartida para todo un lote, en vez de una generada al azar por cada fila.
    // Si no se envía, se genera una al azar (comportamiento de siempre para un usuario a la vez).
    password: z.string().min(10).max(72).optional()
  })
  .refine((datos) => datos.rol !== 'miembro' || !!datos.grupo_id, {
    message: 'Un miembro debe tener un grupo asignado.',
    path: ['grupo_id']
  });

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
    return errorRespuesta(403, 'sin_permiso', 'Solo un administrador puede crear usuarios.', origin);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return errorRespuesta(400, 'json_invalido', 'El cuerpo de la petición no es un JSON válido.', origin);
  }

  const parseo = esquemaEntrada.safeParse(cuerpo);
  if (!parseo.success) {
    return errorRespuesta(400, 'datos_invalidos', parseo.error.issues[0]?.message ?? 'Revisa los datos del formulario.', origin);
  }

  const { email, nombre_completo, rol, grupo_id, password } = parseo.data;
  const admin = clienteAdmin();

  if (grupo_id) {
    const { data: grupo } = await admin.from('grupos').select('institucion_id').eq('id', grupo_id).maybeSingle();
    if (!grupo || grupo['institucion_id'] !== llamador.institucionId) {
      return errorRespuesta(400, 'grupo_invalido', 'El grupo indicado no pertenece a tu institución.', origin);
    }
  }

  const passwordTemporal = password ?? generarPasswordTemporal();

  const { data: nuevoAuthUser, error: errorAuth } = await admin.auth.admin.createUser({
    email,
    password: passwordTemporal,
    email_confirm: true
  });

  if (errorAuth || !nuevoAuthUser.user) {
    if (errorAuth?.message?.toLowerCase().includes('already')) {
      return errorRespuesta(409, 'correo_duplicado', 'Ese correo ya está registrado.', origin);
    }
    return errorRespuesta(500, 'error_interno', 'No se pudo crear el usuario.', origin);
  }

  const { error: errorUsuario } = await admin.from('usuarios').insert({
    id: nuevoAuthUser.user.id,
    institucion_id: llamador.institucionId,
    grupo_id: grupo_id ?? null,
    nombre_completo,
    email,
    rol,
    debe_cambiar_password: true
  });

  if (errorUsuario) {
    // Rollback manual: no debe quedar un usuario de Auth sin su fila en `usuarios`.
    await admin.auth.admin.deleteUser(nuevoAuthUser.user.id);
    const duplicado = errorUsuario.message?.toLowerCase().includes('duplicate');
    return errorRespuesta(
      duplicado ? 409 : 500,
      duplicado ? 'correo_duplicado' : 'error_interno',
      duplicado ? 'Ese correo ya está registrado.' : 'No se pudo crear el usuario.',
      origin
    );
  }

  await registrarAuditoria(admin, 'usuario_creado', llamador.institucionId, llamador.usuarioId, {
    usuario_creado_id: nuevoAuthUser.user.id,
    rol
  });

  return jsonRespuesta(
    200,
    { ok: true, data: { usuario_id: nuevoAuthUser.user.id, password_temporal: passwordTemporal } },
    origin
  );
});
