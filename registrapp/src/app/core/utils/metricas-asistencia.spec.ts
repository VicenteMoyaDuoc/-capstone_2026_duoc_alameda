import { agruparPorGrupo, agruparPorPersona, calcularMetricas, nivelAsistencia, type FilaDetalleAsistencia } from './metricas-asistencia';

function fila(overrides: Partial<FilaDetalleAsistencia> = {}): FilaDetalleAsistencia {
  return {
    sesion_id: 's1',
    institucion_id: 'inst1',
    grupo_id: 'g1',
    grupo: 'Curso A',
    inicio: '2026-10-01T12:00:00.000Z',
    fecha: '2026-10-01',
    usuario_id: 'u1',
    nombre_completo: 'Persona de prueba',
    registrado_en: null,
    estado: 'ausente',
    ...overrides
  };
}

describe('calcularMetricas', () => {
  it('devuelve null en los porcentajes cuando no hay sesiones (nunca divide por cero)', () => {
    const metricas = calcularMetricas([]);
    expect(metricas.sesionesTotal).toBe(0);
    expect(metricas.porcentajeAsistencia).toBeNull();
    expect(metricas.porcentajeTardanza).toBeNull();
    expect(metricas.porcentajeAusentismo).toBeNull();
  });

  it('100% de asistencia cuando todas las sesiones son puntual o tardanza', () => {
    const metricas = calcularMetricas([fila({ estado: 'puntual' }), fila({ estado: 'tardanza' })]);
    expect(metricas.porcentajeAsistencia).toBe(100);
    expect(metricas.porcentajeAusentismo).toBe(0);
  });

  it('calcula el caso de prueba manual de la Fase 5: 1 puntual, 1 tardanza, 1 ausente', () => {
    const metricas = calcularMetricas([fila({ estado: 'puntual' }), fila({ estado: 'tardanza' }), fila({ estado: 'ausente' })]);
    expect(metricas.sesionesTotal).toBe(3);
    expect(metricas.asistidas).toBe(2);
    expect(metricas.tardanzas).toBe(1);
    expect(metricas.porcentajeAsistencia).toBe(66.7);
    expect(metricas.porcentajeTardanza).toBe(33.3);
    expect(metricas.porcentajeAusentismo).toBe(33.3);
  });

  it('0% de asistencia cuando todas las sesiones están ausentes', () => {
    const metricas = calcularMetricas([fila({ estado: 'ausente' }), fila({ estado: 'ausente' })]);
    expect(metricas.porcentajeAsistencia).toBe(0);
    expect(metricas.porcentajeAusentismo).toBe(100);
  });

  it('redondea a 1 decimal, igual que las vistas SQL', () => {
    const filas = [fila({ estado: 'puntual' }), fila({ estado: 'ausente' }), fila({ estado: 'ausente' })];
    const metricas = calcularMetricas(filas);
    expect(metricas.porcentajeAsistencia).toBe(33.3);
  });
});

describe('nivelAsistencia (umbrales de color del reporte)', () => {
  it('es "bueno" en el umbral de 90% y por encima', () => {
    expect(nivelAsistencia(90)).toBe('bueno');
    expect(nivelAsistencia(100)).toBe('bueno');
  });

  it('es "regular" entre 75% y 89.9%', () => {
    expect(nivelAsistencia(75)).toBe('regular');
    expect(nivelAsistencia(89.9)).toBe('regular');
  });

  it('es "bajo" por debajo de 75%', () => {
    expect(nivelAsistencia(74.9)).toBe('bajo');
    expect(nivelAsistencia(0)).toBe('bajo');
  });

  it('devuelve null cuando no hay dato (sin sesiones)', () => {
    expect(nivelAsistencia(null)).toBeNull();
  });
});

describe('agruparPorGrupo', () => {
  it('agrupa filas de distintos grupos por separado', () => {
    const filas = [
      fila({ grupo_id: 'g1', grupo: 'Curso A', usuario_id: 'u1', estado: 'puntual' }),
      fila({ grupo_id: 'g1', grupo: 'Curso A', usuario_id: 'u2', estado: 'ausente' }),
      fila({ grupo_id: 'g2', grupo: 'Curso B', usuario_id: 'u3', estado: 'tardanza' })
    ];

    const resumen = agruparPorGrupo(filas);

    expect(resumen.length).toBe(2);
    const grupoA = resumen.find((r) => r.grupoId === 'g1')!;
    expect(grupoA.miembrosTotal).toBe(2);
    expect(grupoA.sesionesTotal).toBe(2);
    expect(grupoA.porcentajeAsistencia).toBe(50);

    const grupoB = resumen.find((r) => r.grupoId === 'g2')!;
    expect(grupoB.miembrosTotal).toBe(1);
    expect(grupoB.porcentajeAsistencia).toBe(100);
  });

  it('cuenta miembros distintos aunque tengan varias sesiones', () => {
    const filas = [
      fila({ grupo_id: 'g1', usuario_id: 'u1', sesion_id: 's1', estado: 'puntual' }),
      fila({ grupo_id: 'g1', usuario_id: 'u1', sesion_id: 's2', estado: 'tardanza' })
    ];

    const [resumen] = agruparPorGrupo(filas);
    expect(resumen.miembrosTotal).toBe(1);
    expect(resumen.sesionesTotal).toBe(2);
  });
});

describe('agruparPorPersona', () => {
  it('agrupa filas por usuario, conservando su nombre y grupo', () => {
    const filas = [
      fila({ usuario_id: 'u1', nombre_completo: 'Ana', estado: 'puntual' }),
      fila({ usuario_id: 'u1', nombre_completo: 'Ana', estado: 'tardanza', sesion_id: 's2' }),
      fila({ usuario_id: 'u2', nombre_completo: 'Beto', estado: 'ausente' })
    ];

    const resumen = agruparPorPersona(filas);

    expect(resumen.length).toBe(2);
    const ana = resumen.find((r) => r.usuarioId === 'u1')!;
    expect(ana.nombreCompleto).toBe('Ana');
    expect(ana.sesionesTotal).toBe(2);
    expect(ana.porcentajeAsistencia).toBe(100);

    const beto = resumen.find((r) => r.usuarioId === 'u2')!;
    expect(beto.porcentajeAsistencia).toBe(0);
  });
});
