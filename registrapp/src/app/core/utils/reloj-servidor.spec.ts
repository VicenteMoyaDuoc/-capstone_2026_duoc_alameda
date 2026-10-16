import { ahoraServidor, calcularDesfaseServidor, formatearDuracion, formatearHora } from './reloj-servidor';

describe('calcularDesfaseServidor / ahoraServidor', () => {
  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2026-10-10T12:00:00.000Z'));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('calcula un desfase positivo cuando el servidor va adelantado', () => {
    const servidorAhoraMs = Date.now() + 5000;
    expect(calcularDesfaseServidor(servidorAhoraMs)).toBe(5000);
  });

  it('calcula un desfase negativo cuando el servidor va atrasado', () => {
    const servidorAhoraMs = Date.now() - 3000;
    expect(calcularDesfaseServidor(servidorAhoraMs)).toBe(-3000);
  });

  it('calcula desfase cero cuando los relojes coinciden', () => {
    expect(calcularDesfaseServidor(Date.now())).toBe(0);
  });

  it('ahoraServidor aplica el desfase al reloj local (no depende del reloj del celular)', () => {
    // El celular podría estar mal configurado; el desfase corrige respecto al servidor.
    expect(ahoraServidor(5000)).toBe(Date.now() + 5000);
    expect(ahoraServidor(-3000)).toBe(Date.now() - 3000);
    expect(ahoraServidor(0)).toBe(Date.now());
  });

  it('calcularDesfaseServidor seguido de ahoraServidor reproduce la hora del servidor', () => {
    const servidorAhoraMs = Date.now() + 7500;
    const desfase = calcularDesfaseServidor(servidorAhoraMs);
    expect(ahoraServidor(desfase)).toBe(servidorAhoraMs);
  });
});

describe('formatearDuracion (contador del QR)', () => {
  it('formatea segundos puros como mm:ss', () => {
    expect(formatearDuracion(5)).toBe('0:05');
    expect(formatearDuracion(59)).toBe('0:59');
  });

  it('formatea minutos y segundos', () => {
    expect(formatearDuracion(90)).toBe('1:30');
    expect(formatearDuracion(600)).toBe('10:00');
  });

  it('formatea con horas cuando supera los 3600 segundos', () => {
    expect(formatearDuracion(3661)).toBe('1:01:01');
  });

  it('nunca muestra un valor negativo (se trunca a 0:00)', () => {
    expect(formatearDuracion(-10)).toBe('0:00');
  });

  it('trunca fracciones de segundo', () => {
    expect(formatearDuracion(59.9)).toBe('0:59');
  });

  it('formatea exactamente cero', () => {
    expect(formatearDuracion(0)).toBe('0:00');
  });
});

describe('formatearHora', () => {
  it('formatea una hora en formato 24h de Chile sin importar el huso horario del navegador', () => {
    // 12:40 UTC ~= 09:40 en America/Santiago (UTC-3 en horario de verano).
    const texto = formatearHora('2026-10-10T12:40:00.000Z');
    expect(texto).toContain('09:40');
  });
});
