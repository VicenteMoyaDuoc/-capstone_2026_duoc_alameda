import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';
import { AsistenciaError, AsistenciaService, MENSAJE_GENERICO } from './asistencia.service';
import { UbicacionError, UbicacionService, type UbicacionLeida } from './ubicacion.service';

function errorConCuerpo(cuerpo: unknown): { context: { json: () => Promise<unknown> } } {
  return { context: { json: () => Promise.resolve(cuerpo) } };
}

function configurar(invokeResultado: { data: unknown; error: unknown }): AsistenciaService {
  const supabaseFake = {
    client: {
      functions: {
        invoke: jasmine.createSpy('invoke').and.resolveTo(invokeResultado)
      }
    }
  };

  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: supabaseFake }]
  });

  return TestBed.inject(AsistenciaService);
}

/** Servicio cuyo servidor responde, en orden, las respuestas dadas; y cuyo GPS entrega `ubicacion` (o falla). */
function configurarConGps(respuestas: { data: unknown; error: unknown }[], gps: () => Promise<UbicacionLeida>) {
  const invoke = jasmine.createSpy('invoke');
  invoke.and.returnValues(...respuestas.map((r) => Promise.resolve(r)));
  const obtener = jasmine.createSpy('obtener').and.callFake(gps);

  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client: { functions: { invoke } } } },
      { provide: UbicacionService, useValue: { obtener } }
    ]
  });

  return { servicio: TestBed.inject(AsistenciaService), invoke, obtener };
}

const exigeUbicacion = (modo: string) => ({
  data: null,
  error: errorConCuerpo({ ok: false, code: 'UBICACION_REQUERIDA', message: 'Debes permitir el acceso a tu ubicación para continuar.', data: { modo } })
});

describe('AsistenciaService — mapeo de errores a mensajes', () => {
  describe('registrarAsistencia', () => {
    it('devuelve el resultado cuando la función responde ok', async () => {
      const resultado = {
        estado: 'puntual' as const,
        registrado_en: '2026-10-10T12:45:00.000Z',
        grupo: { id: 'g1', nombre: 'Curso A' },
        asignatura: null,
        sesion: { id: 's1' }
      };
      const servicio = configurar({ data: { ok: true, data: resultado }, error: null });

      await expectAsync(servicio.registrarAsistencia('token')).toBeResolvedTo(resultado);
    });

    it('traduce un rechazo de la Edge Function (QR_EXPIRADO) al mensaje en español correspondiente', async () => {
      const servicio = configurar({
        data: null,
        error: errorConCuerpo({ ok: false, code: 'QR_EXPIRADO', message: 'Este código QR ya venció. Pide a tu responsable que muestre el actualizado.' })
      });

      await expectAsync(servicio.registrarAsistencia('token')).toBeRejectedWith(
        jasmine.objectContaining({
          code: 'QR_EXPIRADO',
          message: 'Este código QR ya venció. Pide a tu responsable que muestre el actualizado.'
        })
      );
    });

    it('conserva el code y la hora original en YA_REGISTRADO para mostrarla en pantalla', async () => {
      const servicio = configurar({
        data: null,
        error: errorConCuerpo({
          ok: false,
          code: 'YA_REGISTRADO',
          message: 'Ya registraste tu asistencia a las 09:45.',
          data: { registrado_en: '2026-10-10T12:45:00.000Z' }
        })
      });

      try {
        await servicio.registrarAsistencia('token');
        fail('debía lanzar AsistenciaError');
      } catch (error) {
        expect(error).toBeInstanceOf(AsistenciaError);
        const asistenciaError = error as AsistenciaError;
        expect(asistenciaError.code).toBe('YA_REGISTRADO');
        expect(asistenciaError.data).toEqual({ registrado_en: '2026-10-10T12:45:00.000Z' });
      }
    });

    it('usa un mensaje genérico cuando el cuerpo del error no se puede leer (p. ej. caída de red)', async () => {
      const servicio = configurar({ data: null, error: new Error('network error sin context') });

      await expectAsync(servicio.registrarAsistencia('token')).toBeRejectedWith(
        jasmine.objectContaining({ code: 'error_interno', message: MENSAJE_GENERICO })
      );
    });
  });

  describe('iniciarSesion (sesion-asistencia)', () => {
    it('devuelve la sesión y el token cuando se inicia correctamente', async () => {
      const respuesta = {
        sesion: { id: 's1' },
        token: 'v1.payload.firma',
        servidor_ahora: 1000,
        token_expira_en: 2000
      };
      const servicio = configurar({ data: { ok: true, data: respuesta }, error: null });

      await expectAsync(servicio.iniciarSesion('g1')).toBeResolvedTo(respuesta as never);
    });

    it('propaga los datos de la sesión existente cuando el error es SESION_YA_ABIERTA (para poder retomarla)', async () => {
      const datosSesionExistente = { sesion: { id: 's1' }, token: 'v1.x.y', servidor_ahora: 1, token_expira_en: 2 };
      const servicio = configurar({
        data: null,
        error: errorConCuerpo({
          ok: false,
          code: 'SESION_YA_ABIERTA',
          message: 'Ya existe una sesión de asistencia abierta para este grupo.',
          data: datosSesionExistente
        })
      });

      try {
        await servicio.iniciarSesion('g1');
        fail('debía lanzar AsistenciaError');
      } catch (error) {
        expect((error as AsistenciaError).code).toBe('SESION_YA_ABIERTA');
        expect((error as AsistenciaError).data).toEqual(datosSesionExistente);
      }
    });
  });

  describe('verificación de ubicación', () => {
    const gpsOk = (): Promise<UbicacionLeida> => Promise.resolve({ lat: -33.4489, lng: -70.67, precision: 12 });
    const registro = { data: { ok: true, data: { estado: 'puntual', registrado_en: '2026-11-14T12:00:00.000Z', grupo: null, asignatura: null, sesion: { id: 's1' } } }, error: null };

    it('si la clase no exige ubicación, nunca se pide el GPS', async () => {
      const { servicio, invoke, obtener } = configurarConGps([registro], gpsOk);

      await servicio.registrarAsistencia('token-largo-de-prueba');

      expect(obtener).not.toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke.calls.argsFor(0)[1]).toEqual({ body: { token: 'token-largo-de-prueba' } });
    });

    it('si el servidor pide ubicación, lee el GPS según el modo y repite el registro con ella', async () => {
      const { servicio, invoke, obtener } = configurarConGps([exigeUbicacion('exacta'), registro], gpsOk);

      const resultado = await servicio.registrarAsistencia('token-largo-de-prueba');

      expect(resultado.estado).toBe('puntual');
      expect(obtener).toHaveBeenCalledOnceWith('exacta');
      expect(invoke).toHaveBeenCalledTimes(2);
      expect(invoke.calls.argsFor(1)[1]).toEqual({ body: { token: 'token-largo-de-prueba', ubicacion: { lat: -33.4489, lng: -70.67, precision: 12 } } });
    });

    it('si el permiso de ubicación se deniega, muestra ese mensaje y no repite la llamada', async () => {
      const denegado = () => Promise.reject(new UbicacionError('UBICACION_DENEGADA', 'Debes permitir el acceso a tu ubicación para continuar.'));
      const { servicio, invoke } = configurarConGps([exigeUbicacion('proximidad')], denegado);

      await expectAsync(servicio.registrarAsistencia('token-largo-de-prueba')).toBeRejectedWith(
        jasmine.objectContaining({ code: 'UBICACION_DENEGADA', message: 'Debes permitir el acceso a tu ubicación para continuar.' })
      );
      expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('un rechazo por estar fuera de rango llega con su mensaje y no vuelve a pedir el GPS', async () => {
      const fuera = {
        data: null,
        error: errorConCuerpo({ ok: false, code: 'FUERA_DE_RANGO', message: 'Parece que no estás en la sede.', data: { modo: 'proximidad' } })
      };
      const { servicio, obtener } = configurarConGps([exigeUbicacion('proximidad'), fuera], gpsOk);

      await expectAsync(servicio.registrarAsistencia('token-largo-de-prueba')).toBeRejectedWith(
        jasmine.objectContaining({ code: 'FUERA_DE_RANGO', message: 'Parece que no estás en la sede.' })
      );
      expect(obtener).toHaveBeenCalledTimes(1);
    });

    it('el profesor, al iniciar la clase en modo exacta, envía su ubicación', async () => {
      const sesion = { data: { ok: true, data: { sesion: { id: 's1' }, token: 't', servidor_ahora: 1, token_expira_en: 2 } }, error: null };
      const { servicio, invoke } = configurarConGps([exigeUbicacion('exacta'), sesion], gpsOk);

      await servicio.iniciarSesion('g1', 'a1');

      expect(invoke.calls.argsFor(0)[1]).toEqual({ body: { accion: 'iniciar', grupo_id: 'g1', asignatura_id: 'a1' } });
      expect(invoke.calls.argsFor(1)[1]).toEqual({
        body: { accion: 'iniciar', grupo_id: 'g1', asignatura_id: 'a1', ubicacion: { lat: -33.4489, lng: -70.67, precision: 12 } }
      });
    });
  });
});
