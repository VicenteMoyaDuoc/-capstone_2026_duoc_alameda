/**
 * SOLO DESARROLLO — cliente de Supabase falso, en memoria, con la parte de la API que usa la app.
 * Lo crea SupabaseService cuando `environment.devRolFalso` tiene un rol.
 * Los cambios (crear/editar/borrar) viven en memoria y se pierden al recargar la página.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { BaseDeDatosDev, Fila, calcularVista, crearBaseDeDatosDev } from './dev-datos';
// La misma lógica de ubicación que ejecutará la Edge Function real `registrar-asistencia`.
import { datosGeoRespuesta, evaluarUbicacion, mensajeGeo, type ModoGeo, type PuntoReferencia, type Ubicacion } from '../../../../supabase/functions/_shared/geo';

interface Respuesta {
  data: unknown;
  error: { message: string } | null;
  count: number | null;
}

type Predicado = (fila: Fila) => boolean;

const VISTAS = ['v_asistencia_detalle', 'v_resumen_grupo', 'v_resumen_persona'];

function comparar(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function coincideIlike(valor: unknown, patron: string): boolean {
  const expresion = new RegExp('^' + patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i');
  return expresion.test(String(valor ?? ''));
}

/** Convierte un filtro de PostgREST (`col.op.valor`) en un predicado. */
function predicadoDeFiltro(texto: string): Predicado {
  const [columna, operador, ...resto] = texto.split('.');
  const valor = resto.join('.');
  switch (operador) {
    case 'ilike':
      return (f) => coincideIlike(f[columna], valor);
    case 'eq':
      return (f) => String(f[columna]) === valor;
    default:
      return () => true;
  }
}

class Consulta implements PromiseLike<Respuesta> {
  private modo: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Fila | Fila[] | null = null;
  private readonly filtros: Predicado[] = [];
  private readonly orden: { columna: string; asc: boolean }[] = [];
  private rango: [number, number] | null = null;
  private limite: number | null = null;
  private unico: 'single' | 'maybe' | null = null;
  private contar = false;

  constructor(
    private readonly db: BaseDeDatosDev,
    private readonly tabla: string
  ) {}

  select(_columnas?: string, opciones?: { count?: string }): this {
    if (this.modo === 'select') this.contar = !!opciones?.count;
    return this;
  }
  insert(datos: Fila | Fila[]): this {
    this.modo = 'insert';
    this.payload = datos;
    return this;
  }
  update(datos: Fila): this {
    this.modo = 'update';
    this.payload = datos;
    return this;
  }
  delete(): this {
    this.modo = 'delete';
    return this;
  }

  eq(columna: string, valor: unknown): this {
    this.filtros.push((f) => f[columna] === valor);
    return this;
  }
  neq(columna: string, valor: unknown): this {
    this.filtros.push((f) => f[columna] !== valor);
    return this;
  }
  in(columna: string, valores: unknown[]): this {
    this.filtros.push((f) => valores.includes(f[columna]));
    return this;
  }
  is(columna: string, valor: unknown): this {
    this.filtros.push((f) => (valor === null ? f[columna] == null : f[columna] === valor));
    return this;
  }
  gte(columna: string, valor: unknown): this {
    this.filtros.push((f) => comparar(f[columna], valor) >= 0);
    return this;
  }
  lte(columna: string, valor: unknown): this {
    this.filtros.push((f) => comparar(f[columna], valor) <= 0);
    return this;
  }
  gt(columna: string, valor: unknown): this {
    this.filtros.push((f) => comparar(f[columna], valor) > 0);
    return this;
  }
  lt(columna: string, valor: unknown): this {
    this.filtros.push((f) => comparar(f[columna], valor) < 0);
    return this;
  }
  ilike(columna: string, patron: string): this {
    this.filtros.push((f) => coincideIlike(f[columna], patron));
    return this;
  }
  or(expresion: string): this {
    const alternativas = expresion.split(',').map(predicadoDeFiltro);
    this.filtros.push((f) => alternativas.some((p) => p(f)));
    return this;
  }
  order(columna: string, opciones?: { ascending?: boolean }): this {
    this.orden.push({ columna, asc: opciones?.ascending !== false });
    return this;
  }
  range(desde: number, hasta: number): this {
    this.rango = [desde, hasta];
    return this;
  }
  limit(n: number): this {
    this.limite = n;
    return this;
  }
  single(): this {
    this.unico = 'single';
    return this;
  }
  maybeSingle(): this {
    this.unico = 'maybe';
    return this;
  }

  then<R1 = Respuesta, R2 = never>(
    alExito?: ((valor: Respuesta) => R1 | PromiseLike<R1>) | null,
    alError?: ((motivo: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.ejecutar()).then(alExito, alError);
  }

  private ejecutar(): Respuesta {
    const tablaDatos = (this.db as unknown as Record<string, Fila[]>)[this.tabla];
    const esVista = VISTAS.includes(this.tabla);

    if (!tablaDatos && !esVista) {
      return { data: null, error: { message: `[dev] tabla desconocida: ${this.tabla}` }, count: null };
    }

    const coincide = (f: Fila): boolean => this.filtros.every((p) => p(f));

    if (this.modo === 'insert') {
      const nuevas = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((d) => ({
        id: crypto.randomUUID(),
        activo: true,
        created_at: new Date().toISOString(),
        ...(this.tabla === 'solicitudes' ? { estado: 'pendiente', tipo: 'asignatura', detalle: null, respuesta: null, resuelta_en: null } : {}),
        ...d
      }));
      tablaDatos.push(...nuevas);
      return this.resultado(nuevas, null);
    }

    if (this.modo === 'update') {
      const afectadas = tablaDatos.filter(coincide);
      afectadas.forEach((f) => Object.assign(f, this.payload));
      return this.resultado(afectadas, null);
    }

    if (this.modo === 'delete') {
      const afectadas = tablaDatos.filter(coincide);
      for (const f of afectadas) tablaDatos.splice(tablaDatos.indexOf(f), 1);
      return this.resultado(afectadas, null);
    }

    const origen = esVista ? calcularVista(this.tabla, this.db) : tablaDatos;
    let filas = origen.filter(coincide);

    // Emula el join embebido `responsable:usuarios!grupos_responsable_id_fkey(nombre_completo)`.
    if (this.tabla === 'grupos') {
      filas = filas.map((g) => {
        const u = this.db.usuarios.find((x) => x['id'] === g['responsable_id']);
        return { ...g, responsable: u ? { nombre_completo: u['nombre_completo'] } : null };
      });
    }

    for (const { columna, asc } of [...this.orden].reverse()) {
      filas = [...filas].sort((a, b) => (asc ? 1 : -1) * comparar(a[columna], b[columna]));
    }

    const total = filas.length;
    if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
    if (this.limite != null) filas = filas.slice(0, this.limite);

    return this.resultado(filas, this.contar ? total : null);
  }

  private resultado(filas: Fila[], count: number | null): Respuesta {
    if (this.unico) {
      if (filas.length === 1) return { data: filas[0], error: null, count };
      if (this.unico === 'maybe' && filas.length === 0) return { data: null, error: null, count };
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' }, count };
    }
    return { data: filas, error: null, count };
  }
}

function crearCanalFalso(): Record<string, unknown> {
  const canal: Record<string, unknown> = {
    on: () => canal,
    subscribe: () => canal,
    unsubscribe: () => Promise.resolve('ok')
  };
  return canal;
}

export function crearClienteFalso(): SupabaseClient {
  const db = crearBaseDeDatosDev();

  const cliente = {
    from: (tabla: string) => new Consulta(db, tabla),
    rpc: (nombre: string, args?: Fila) => {
      if (nombre === 'resolver_solicitud') {
        const solicitud = db.solicitudes.find((x) => x['id'] === args?.['p_id']);
        if (!solicitud) return Promise.resolve({ data: null, error: { message: 'La solicitud no existe.' } });
        if (solicitud['estado'] !== 'pendiente') return Promise.resolve({ data: null, error: { message: 'Esta solicitud ya fue resuelta.' } });

        let asignaturaId: string | null = null;
        if (args?.['p_aprobar']) {
          const repetida = db.asignaturas.some(
            (a) => a['grupo_id'] === solicitud['grupo_id'] && String(a['nombre']).toLowerCase() === String(solicitud['nombre']).toLowerCase()
          );
          if (repetida) return Promise.resolve({ data: null, error: { message: 'Ya existe una asignatura con ese nombre en el curso.' } });
          asignaturaId = crypto.randomUUID();
          db.asignaturas.push({
            id: asignaturaId,
            institucion_id: solicitud['institucion_id'],
            grupo_id: solicitud['grupo_id'],
            nombre: solicitud['nombre'],
            responsable_id: solicitud['solicitante_id'],
            activo: true,
            created_at: new Date().toISOString()
          });
        }
        solicitud['estado'] = args?.['p_aprobar'] ? 'aprobada' : 'rechazada';
        solicitud['respuesta'] = String(args?.['p_motivo'] ?? '').trim() || null;
        solicitud['resuelta_en'] = new Date().toISOString();
        return Promise.resolve({ data: asignaturaId, error: null });
      }
      if (nombre === 'responder_solicitud') {
        const solicitud = db.solicitudes.find((x) => x['id'] === args?.['p_id']);
        if (!solicitud) return Promise.resolve({ data: null, error: { message: 'La solicitud no existe.' } });
        if (solicitud['estado'] !== 'pendiente') return Promise.resolve({ data: null, error: { message: 'Esta solicitud ya fue resuelta.' } });
        if (!String(args?.['p_respuesta'] ?? '').trim()) return Promise.resolve({ data: null, error: { message: 'Escribe una respuesta.', code: '23514' } });
        solicitud['estado'] = 'respondida';
        solicitud['respuesta'] = String(args?.['p_respuesta']).trim();
        solicitud['resuelta_en'] = new Date().toISOString();
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    channel: () => crearCanalFalso(),
    removeChannel: () => Promise.resolve('ok'),
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: { message: '[dev] login deshabilitado' } }),
      signUp: () => Promise.resolve({ data: { user: null, session: null }, error: { message: '[dev] registro deshabilitado' } })
    },
    functions: {
      invoke: async (nombre: string, opciones?: { body?: Fila }): Promise<{ data: unknown; error: null }> => {
        const body = opciones?.body ?? {};

        if (nombre === 'crear-usuario') {
          const id = crypto.randomUUID();
          db.usuarios.push({
            id,
            institucion_id: db.instituciones[0]['id'],
            grupo_id: body['grupo_id'] ?? null,
            nombre_completo: body['nombre_completo'],
            email: body['email'],
            rol: body['rol'],
            activo: true,
            debe_cambiar_password: true,
            created_at: new Date().toISOString()
          });
          return { data: { ok: true, data: { usuario_id: id, password_temporal: 'Temporal-Dev-123' } }, error: null };
        }

        if (nombre === 'actualizar-usuario') {
          const usuario = db.usuarios.find((u) => u['id'] === body['usuario_id']);
          if (usuario) {
            if (body['accion'] === 'editar') {
              if ('nombre_completo' in body) usuario['nombre_completo'] = body['nombre_completo'];
              if ('grupo_id' in body) usuario['grupo_id'] = body['grupo_id'];
            }
            if (body['accion'] === 'desactivar') usuario['activo'] = false;
            if (body['accion'] === 'reactivar') usuario['activo'] = true;
          }
          return { data: { ok: true, data: body['accion'] === 'resetear_password' ? { password_temporal: 'Temporal-Dev-123' } : undefined }, error: null };
        }

        if (nombre === 'registrar-asistencia') {
          // Simula el servidor: aplica la regla de ubicación de la institución de prueba (cualquier token sirve).
          const institucion = db.instituciones[0];
          const modo = (institucion['geo_modo'] ?? 'off') as ModoGeo;
          const referencia: PuntoReferencia | null =
            institucion['sede_lat'] != null && institucion['sede_lng'] != null
              ? {
                  lat: institucion['sede_lat'] as number,
                  lng: institucion['sede_lng'] as number,
                  radioM: ((modo === 'exacta' ? institucion['radio_exacto_m'] : institucion['radio_proximidad_m']) as number) ?? 300
                }
              : null;
          const veredicto = evaluarUbicacion(modo, referencia, body['ubicacion'] as Ubicacion | undefined);

          if (!veredicto.ok) {
            return {
              data: { ok: false, code: veredicto.code, message: mensajeGeo(veredicto.code, modo, 'alumno'), data: datosGeoRespuesta(modo, referencia, veredicto.distanciaM) },
              error: null
            };
          }
          const grupo = db.grupos[0];
          return {
            data: {
              ok: true,
              data: {
                estado: 'puntual',
                registrado_en: new Date().toISOString(),
                grupo: { id: grupo['id'], nombre: grupo['nombre'] },
                asignatura: null,
                sesion: { id: 'dev-sesion' },
                geo: modo === 'off' || !referencia ? null : datosGeoRespuesta(modo, referencia, veredicto.distanciaM)
              }
            },
            error: null
          };
        }

        if (nombre === 'crear-institucion') {
          return { data: { ok: true, data: { institucion_id: db.instituciones[0]['id'] } }, error: null };
        }

        return { data: { ok: false, code: 'dev', message: 'No disponible con datos de prueba (modo desarrollo).' }, error: null };
      }
    }
  };

  return cliente as unknown as SupabaseClient;
}
