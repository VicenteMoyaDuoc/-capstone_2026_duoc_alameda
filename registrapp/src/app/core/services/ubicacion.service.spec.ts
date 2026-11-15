import { TestBed } from '@angular/core/testing';
import { UbicacionError, UbicacionService } from './ubicacion.service';

type OkCb = (p: GeolocationPosition) => void;
type ErrCb = (e: GeolocationPositionError) => void;

const posicion = (precision: number): GeolocationPosition =>
  ({ coords: { latitude: -33.4489, longitude: -70.67, accuracy: precision } }) as unknown as GeolocationPosition;

describe('UbicacionService', () => {
  let ok: OkCb;
  let fallo: ErrCb;
  let clearWatch: jasmine.Spy;
  let servicio: UbicacionService;

  beforeEach(() => {
    jasmine.clock().install();
    clearWatch = jasmine.createSpy('clearWatch');
    const geolocation = {
      watchPosition: (a: OkCb, b: ErrCb) => {
        ok = a;
        fallo = b;
        return 7;
      },
      clearWatch
    };
    spyOnProperty(navigator, 'geolocation', 'get').and.returnValue(geolocation as unknown as Geolocation);
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(UbicacionService);
    // `soportada` se calculó al crear el servicio, con la geolocalización ya simulada
  });

  afterEach(() => jasmine.clock().uninstall());

  it('termina apenas la precisión alcanza el objetivo del modo y deja de vigilar el GPS', async () => {
    const promesa = servicio.obtener('exacta');
    ok(posicion(80)); // todavía impreciso
    ok(posicion(20)); // ya sirve para la sala (objetivo 30 m)

    await expectAsync(promesa).toBeResolvedTo({ lat: -33.4489, lng: -70.67, precision: 20 });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('en proximidad basta con 100 m de error', async () => {
    const promesa = servicio.obtener('proximidad');
    ok(posicion(90));

    await expectAsync(promesa).toBeResolvedTo({ lat: -33.4489, lng: -70.67, precision: 90 });
  });

  it('si vence la espera, entrega la mejor lectura que llegó', async () => {
    const promesa = servicio.obtener('exacta');
    ok(posicion(70));
    ok(posicion(50));
    ok(posicion(60));
    jasmine.clock().tick(12_001);

    await expectAsync(promesa).toBeResolvedTo({ lat: -33.4489, lng: -70.67, precision: 50 });
  });

  it('si vence la espera sin ninguna lectura, falla con un mensaje claro', async () => {
    const promesa = servicio.obtener('proximidad');
    jasmine.clock().tick(6_001);

    await expectAsync(promesa).toBeRejectedWith(jasmine.objectContaining({ code: 'UBICACION_NO_DISPONIBLE' }));
  });

  it('si el usuario niega el permiso, falla de inmediato con UBICACION_DENEGADA', async () => {
    const promesa = servicio.obtener('proximidad');
    fallo({ code: 1, PERMISSION_DENIED: 1, message: 'User denied Geolocation' } as GeolocationPositionError);

    await expectAsync(promesa).toBeRejectedWith(jasmine.any(UbicacionError));
    await expectAsync(promesa).toBeRejectedWith(jasmine.objectContaining({ code: 'UBICACION_DENEGADA' }));
  });

  it('un error pasajero de señal no cancela la espera: se sigue esperando una lectura', async () => {
    const promesa = servicio.obtener('proximidad');
    fallo({ code: 2, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, message: 'sin señal' } as GeolocationPositionError);
    ok(posicion(40));

    await expectAsync(promesa).toBeResolvedTo({ lat: -33.4489, lng: -70.67, precision: 40 });
  });
});
