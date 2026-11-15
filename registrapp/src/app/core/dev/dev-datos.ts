/**
 * SOLO DESARROLLO — datos ficticios para trabajar el front sin una sesión real de Supabase.
 * Se usan únicamente cuando `environment.devRolFalso` tiene un rol (ver environment.development.ts).
 */
import { Rol, Usuario } from '../models/models';
import { environment } from '../../../environments/environment';

export type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const DEV_INSTITUCION_ID = uuid(1000);

const ID_GRUPO = { a: uuid(2001), b: uuid(2002), c: uuid(2003) };

const ahora = Date.now();
const DIA = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const iso = (ms: number): string => new Date(ms).toISOString();

// Generador pseudoaleatorio determinista: los datos son iguales en cada recarga.
let semilla = 42;
const azar = (): number => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
};

export const ID_DEV_POR_ROL: Record<Rol, string> = {
  administrador: uuid(1),
  responsable: uuid(2),
  miembro: uuid(10)
};

export function usuarioDevPorRol(rol: Rol): Usuario {
  const fila = crearBaseDeDatosDev().usuarios.find((u) => u['id'] === ID_DEV_POR_ROL[rol])!;
  return fila as unknown as Usuario;
}

export interface BaseDeDatosDev {
  instituciones: Fila[];
  grupos: Fila[];
  asignaturas: Fila[];
  usuarios: Fila[];
  sesiones_asistencia: Fila[];
  asistencias: Fila[];
  solicitudes: Fila[];
}

/** Solo desarrollo: `localStorage.setItem('devTipo','corporativa')` para ver la app como empresa. */
function tipoDevActivo(): 'educativa' | 'corporativa' {
  try {
    return localStorage.getItem('devTipo') === 'corporativa' ? 'corporativa' : 'educativa';
  } catch {
    return 'educativa';
  }
}

export function crearBaseDeDatosDev(): BaseDeDatosDev {
  semilla = 42;
  const corporativa = tipoDevActivo() === 'corporativa';
  const creado = iso(ahora - 60 * DIA);

  const instituciones: Fila[] = [
    {
      id: DEV_INSTITUCION_ID,
      nombre: corporativa ? 'Empresa Demo Registrapp' : 'Colegio Demo Registrapp',
      tipo: corporativa ? 'corporativa' : 'educativa',
      tolerancia_min: 10,
      duracion_sesion_min: 60,
      qr_ttl_seg: 30,
      geo_modo: 'proximidad',
      sede_lat: -33.4489437,
      sede_lng: -70.6700844,
      radio_proximidad_m: 300,
      radio_exacto_m: 40,
      created_at: creado
    }
  ];

  const responsables = [
    { id: uuid(2), nombre: 'Marta Soto', grupo: ID_GRUPO.a },
    { id: uuid(3), nombre: 'Luis Herrera', grupo: ID_GRUPO.b },
    { id: uuid(4), nombre: 'Paula Rojas', grupo: ID_GRUPO.c }
  ];

  const grupos: Fila[] = [
    { id: ID_GRUPO.a, institucion_id: DEV_INSTITUCION_ID, nombre: corporativa ? 'Ventas' : '4to Medio A', responsable_id: uuid(2), activo: true, created_at: creado },
    { id: ID_GRUPO.b, institucion_id: DEV_INSTITUCION_ID, nombre: corporativa ? 'Operaciones' : '4to Medio B', responsable_id: uuid(3), activo: true, created_at: creado },
    { id: ID_GRUPO.c, institucion_id: DEV_INSTITUCION_ID, nombre: corporativa ? 'Soporte' : '3ro Medio A', responsable_id: uuid(4), activo: true, created_at: creado }
  ];

  const crearAsignatura = (n: number, grupoId: string, nombre: string, responsableId: string): Fila => ({
    id: uuid(n),
    institucion_id: DEV_INSTITUCION_ID,
    grupo_id: grupoId,
    nombre,
    responsable_id: responsableId,
    activo: true,
    created_at: creado
  });

  // las empresas no subdividen un departamento en asignaturas
  const asignaturas: Fila[] = corporativa
    ? []
    : [
    crearAsignatura(3001, ID_GRUPO.a, 'Matemática', uuid(2)),
    crearAsignatura(3002, ID_GRUPO.a, 'Lenguaje', uuid(3)),
    crearAsignatura(3003, ID_GRUPO.a, 'Ciencias', uuid(4)),
    crearAsignatura(3004, ID_GRUPO.b, 'Historia', uuid(3)),
    crearAsignatura(3005, ID_GRUPO.b, 'Matemática', uuid(2)),
    crearAsignatura(3006, ID_GRUPO.b, 'Inglés', uuid(4)),
    crearAsignatura(3007, ID_GRUPO.c, 'Física', uuid(4)),
    crearAsignatura(3008, ID_GRUPO.c, 'Química', uuid(2))
  ];

  const base = { institucion_id: DEV_INSTITUCION_ID, activo: true, debe_cambiar_password: false, created_at: creado };

  const usuarios: Fila[] = [
    { ...base, id: uuid(1), grupo_id: null, nombre_completo: 'Admin Demo', email: 'admin@registrapp.test', rol: 'administrador' },
    ...responsables.map((r) => ({
      ...base,
      id: r.id,
      grupo_id: r.grupo,
      nombre_completo: r.nombre,
      email: `${r.nombre.split(' ')[0].toLowerCase()}@registrapp.test`,
      rol: 'responsable'
    }))
  ];

  const nombresMiembros = [
    'Camila Fuentes', 'Matías Pizarro', 'Sofía Araya', 'Benjamín Tapia',
    'Valentina Muñoz', 'Joaquín Vera', 'Isidora León', 'Tomás Cárdenas',
    'Antonia Silva', 'Vicente Bravo', 'Javiera Núñez', 'Diego Contreras'
  ];
  const gruposMiembros = [ID_GRUPO.a, ID_GRUPO.a, ID_GRUPO.a, ID_GRUPO.a, ID_GRUPO.b, ID_GRUPO.b, ID_GRUPO.b, ID_GRUPO.b, ID_GRUPO.c, ID_GRUPO.c, ID_GRUPO.c, ID_GRUPO.c];

  nombresMiembros.forEach((nombre, i) => {
    usuarios.push({
      ...base,
      id: uuid(10 + i),
      grupo_id: gruposMiembros[i],
      nombre_completo: nombre,
      email: `miembro${i + 1}@registrapp.test`,
      rol: 'miembro',
      activo: i !== 11 // el último queda desactivado para ver ese estado
    });
  });

  // 10 sesiones ya terminadas por grupo (una cada 3 días) con asistencias variadas.
  const sesiones: Fila[] = [];
  const asistencias: Fila[] = [];
  let contador = 5000;

  for (const grupo of grupos) {
    const miembros = usuarios.filter((u) => u['rol'] === 'miembro' && u['grupo_id'] === grupo['id'] && u['activo']);
    const delGrupo = asignaturas.filter((x) => x['grupo_id'] === grupo['id']);
    for (let s = 1; s <= 12; s++) {
      const asignatura = delGrupo.length ? delGrupo[s % delGrupo.length] : null;
      const inicio = ahora - s * 2 * DIA - (s % 3) * 60 * MIN;
      const sesionId = uuid(contador++);
      sesiones.push({
        id: sesionId,
        institucion_id: DEV_INSTITUCION_ID,
        grupo_id: grupo['id'],
        asignatura_id: asignatura ? asignatura['id'] : null,
        creada_por: asignatura ? asignatura['responsable_id'] : grupo['responsable_id'],
        inicio: iso(inicio),
        expira_en: iso(inicio + 60 * MIN),
        cerrada_en: iso(inicio + 60 * MIN),
        tolerancia_min: 10,
        qr_ttl_seg: 30
      });

      for (const m of miembros) {
        const sesgo = asignatura ? ((Number(String(asignatura['id']).slice(-2)) % 5) - 2) * 0.05 : 0; // cada asignatura tiene su propio nivel
        const r = azar() + sesgo;
        if (r > 0.82) continue; // ausente
        const tardanza = r > 0.62;
        asistencias.push({
          id: uuid(contador++),
          institucion_id: DEV_INSTITUCION_ID,
          sesion_id: sesionId,
          grupo_id: grupo['id'],
          asignatura_id: asignatura ? asignatura['id'] : null,
          usuario_id: m['id'],
          registrado_en: iso(inicio + (tardanza ? 14 : 2) * MIN),
          estado: tardanza ? 'tardanza' : 'puntual',
          origen: 'qr'
        });
      }
    }
  }

  const haceDias = (n: number): string => iso(ahora - n * DIA);
  const solicitud = (
    n: number,
    tipo: 'asignatura' | 'consulta',
    solicitante: string,
    grupo: string,
    nombre: string,
    estado: string,
    dias: number,
    detalle: string | null = null,
    respuesta: string | null = null
  ): Fila => ({
    id: uuid(7000 + n),
    institucion_id: DEV_INSTITUCION_ID,
    tipo,
    solicitante_id: solicitante,
    grupo_id: grupo,
    nombre,
    detalle,
    estado,
    respuesta,
    resuelta_en: estado === 'pendiente' ? null : haceDias(Math.max(dias - 1, 0)),
    created_at: haceDias(dias)
  });

  // Solicitudes de ejemplo: de asignatura (se aprueban o rechazan) y consultas (se responden).
  const solicitudes: Fila[] = corporativa
    ? [
        solicitud(1, 'consulta', uuid(2), ID_GRUPO.a, 'Cambio de horario de la reunión semanal', 'pendiente', 0, '¿Podemos mover la reunión de los lunes a las 9:00? Chocaba con la visita de clientes.'),
        solicitud(2, 'consulta', uuid(3), ID_GRUPO.b, 'Nuevo integrante sin acceso', 'respondida', 4, 'Se sumó una persona al equipo y no puede registrar asistencia.', 'Ya la agregué al equipo. Debería poder entrar con su correo.')
      ]
    : [
        solicitud(1, 'asignatura', uuid(2), ID_GRUPO.a, 'Educación Física', 'pendiente', 0),
        solicitud(2, 'consulta', uuid(4), ID_GRUPO.c, 'Cambio de sala para Física', 'pendiente', 1, 'La sala 3 no tiene proyector. ¿Podemos usar la sala 5 los martes?'),
        solicitud(3, 'asignatura', uuid(3), ID_GRUPO.b, 'Filosofía', 'rechazada', 6, null, 'Ya existe una asignatura equivalente (Historia).'),
        solicitud(4, 'consulta', uuid(2), ID_GRUPO.a, 'Alumno nuevo sin acceso', 'respondida', 5, 'Se matriculó un alumno nuevo en 4to Medio A y no aparece en mi lista.', 'Ya lo agregué al curso. Debería aparecer en la próxima clase.'),
        solicitud(5, 'asignatura', uuid(2), ID_GRUPO.a, 'Orientación', 'aprobada', 9)
      ];

  return { instituciones, grupos, asignaturas, usuarios, sesiones_asistencia: sesiones, asistencias, solicitudes };
}

/** Equivalente en memoria de las vistas SQL de supabase/migrations/20261010_07_vistas_reportes.sql. */
export function calcularVista(nombre: string, db: BaseDeDatosDev): Fila[] {
  const detalle: Fila[] = [];
  for (const s of db.sesiones_asistencia) {
    if (!s['cerrada_en'] && new Date(s['expira_en']).getTime() > Date.now()) continue; // solo sesiones terminadas
    const grupo = db.grupos.find((g) => g['id'] === s['grupo_id']);
    for (const u of db.usuarios.filter((x) => x['rol'] === 'miembro' && x['grupo_id'] === s['grupo_id'])) {
      const a = db.asistencias.find((x) => x['sesion_id'] === s['id'] && x['usuario_id'] === u['id']);
      if (!u['activo'] && !a) continue;
      detalle.push({
        sesion_id: s['id'],
        institucion_id: s['institucion_id'],
        grupo_id: s['grupo_id'],
        grupo: grupo?.['nombre'],
        inicio: s['inicio'],
        fecha: String(s['inicio']).slice(0, 10),
        usuario_id: u['id'],
        nombre_completo: u['nombre_completo'],
        registrado_en: a?.['registrado_en'] ?? null,
        estado: a?.['estado'] ?? 'ausente',
        asignatura_id: s['asignatura_id'] ?? null,
        asignatura: db.asignaturas.find((x) => x['id'] === s['asignatura_id'])?.['nombre'] ?? null
      });
    }
  }

  if (nombre === 'v_asistencia_detalle') return detalle;

  const agrupar = (clave: (f: Fila) => string): Map<string, Fila[]> => {
    const mapa = new Map<string, Fila[]>();
    for (const f of detalle) {
      const k = clave(f);
      mapa.set(k, [...(mapa.get(k) ?? []), f]);
    }
    return mapa;
  };
  const pct = (parte: number, total: number): number | null => (total === 0 ? null : Math.round((1000 * parte) / total) / 10);

  const resumen = (filas: Fila[]): Fila => {
    const asistidas = filas.filter((f) => f['estado'] !== 'ausente').length;
    const tardanzas = filas.filter((f) => f['estado'] === 'tardanza').length;
    return {
      institucion_id: filas[0]['institucion_id'],
      grupo_id: filas[0]['grupo_id'],
      grupo: filas[0]['grupo'],
      sesiones_total: new Set(filas.map((f) => f['sesion_id'])).size,
      miembros_total: new Set(filas.map((f) => f['usuario_id'])).size,
      asistidas,
      tardanzas,
      porcentaje_asistencia: pct(asistidas, filas.length),
      porcentaje_tardanza: pct(tardanzas, filas.length),
      porcentaje_ausentismo: pct(filas.length - asistidas, filas.length)
    };
  };

  if (nombre === 'v_resumen_grupo') {
    return [...agrupar((f) => f['grupo_id']).values()].map(resumen);
  }

  if (nombre === 'v_resumen_persona') {
    return [...agrupar((f) => f['usuario_id']).values()].map((filas) => {
      const r = resumen(filas);
      return {
        ...r,
        usuario_id: filas[0]['usuario_id'],
        nombre_completo: filas[0]['nombre_completo'],
        sesiones_total: filas.length
      };
    });
  }

  return [];
}

/**
 * Rol de la sesión simulada, o null si no hay (lo normal). Nunca se activa en producción.
 * Se enciende con `devRolFalso` en environment.development.ts o, solo en el navegador de desarrollo,
 * con `localStorage.setItem('devRolFalso', 'administrador')` (útil para previsualizar sin tocar el login real).
 */
export function rolFalsoActivo(): Rol | null {
  if (environment.production) return null;
  if (environment.devRolFalso) return environment.devRolFalso;
  try {
    const guardado = localStorage.getItem('devRolFalso');
    return guardado === 'administrador' || guardado === 'responsable' || guardado === 'miembro' ? guardado : null;
  } catch {
    return null;
  }
}
