import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Cliente con la service_role key. Solo se usa después de verificar permisos a mano. */
export function clienteAdmin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export interface UsuarioLlamador {
  authUserId: string;
  usuarioId: string;
  institucionId: string;
  grupoId: string | null;
  rol: string;
  activo: boolean;
}

/**
 * Verifica el JWT del encabezado Authorization y carga la fila de `usuarios`
 * del que llama. Devuelve `null` si no hay sesión válida o no tiene perfil.
 */
export async function obtenerUsuarioLlamador(req: Request): Promise<UsuarioLlamador | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const clienteAnon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } }
  });

  const {
    data: { user },
    error
  } = await clienteAnon.auth.getUser();

  if (error || !user) return null;

  const admin = clienteAdmin();
  const { data: usuario } = await admin
    .from('usuarios')
    .select('id, institucion_id, grupo_id, rol, activo')
    .eq('id', user.id)
    .maybeSingle();

  if (!usuario) {
    return { authUserId: user.id, usuarioId: '', institucionId: '', grupoId: null, rol: '', activo: false };
  }

  return {
    authUserId: user.id,
    usuarioId: usuario['id'],
    institucionId: usuario['institucion_id'],
    grupoId: usuario['grupo_id'],
    rol: usuario['rol'],
    activo: usuario['activo']
  };
}

export async function registrarAuditoria(
  admin: SupabaseClient,
  evento: string,
  institucionId: string | null,
  usuarioId: string | null,
  detalle: Record<string, unknown> = {}
): Promise<void> {
  await admin.from('auditoria').insert({ evento, institucion_id: institucionId, usuario_id: usuarioId, detalle });
}

/** Contraseña temporal segura (>=14 caracteres) usando crypto.getRandomValues. */
export function generarPasswordTemporal(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!$%&*';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alfabeto[n % alfabeto.length]).join('');
}
