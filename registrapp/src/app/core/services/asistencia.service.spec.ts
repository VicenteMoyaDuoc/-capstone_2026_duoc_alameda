import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';
import { AsistenciaError, AsistenciaService, MENSAJE_GENERICO } from './asistencia.service';

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
});
