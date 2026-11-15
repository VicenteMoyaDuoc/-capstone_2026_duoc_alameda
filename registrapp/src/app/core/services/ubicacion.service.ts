import { Injectable } from '@angular/core';

export type ModoGeo = 'off' | 'proximidad' | 'exacta';

/** Duoc UC, sede Alameda (Av. España 8, Santiago). Coordenadas de OpenStreetMap: confirmar en terreno. */
export const SEDE_ALAMEDA = { lat: -33.4489437, lng: -70.6700844 };

export interface UbicacionLeida {
  lat: number;
  lng: number;
  /** Radio de error del GPS, en metros. */
  precision: number;
}

export class UbicacionError extends Error {
  constructor(
    readonly code: 'UBICACION_DENEGADA' | 'UBICACION_NO_DISPONIBLE',
    message: string
  ) {
    super(message);
  }
}

const MENSAJES = {
  UBICACION_DENEGADA: 'Debes permitir el acceso a tu ubicación para continuar. Actívalo en los permisos del navegador e intenta de nuevo.',
  UBICACION_NO_DISPONIBLE: 'No se pudo obtener tu ubicación. Activa el GPS, o acércate a una ventana, e intenta de nuevo.'
};

/** Cuánto error de GPS se acepta como "suficientemente bueno" y cuánto se espera por una mejor lectura. */
const AJUSTES: Record<ModoGeo, { precisionObjetivoM: number; esperaMaxMs: number }> = {
  off: { precisionObjetivoM: 100, esperaMaxMs: 6000 },
  proximidad: { precisionObjetivoM: 100, esperaMaxMs: 6000 },
  // En la sala el servidor exige ≤ 35 m de error: se espera más para que el GPS se afine.
  exacta: { precisionObjetivoM: 30, esperaMaxMs: 12000 }
};

/** Lee la ubicación del dispositivo (solo funciona en HTTPS o en localhost). */
@Injectable({ providedIn: 'root' })
export class UbicacionService {
  readonly soportada = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  /**
   * Devuelve la mejor lectura disponible: termina apenas la precisión alcanza el objetivo del modo,
   * o al vencer la espera con la mejor lectura que haya llegado.
   */
  obtener(modo: ModoGeo = 'proximidad'): Promise<UbicacionLeida> {
    const { precisionObjetivoM, esperaMaxMs } = AJUSTES[modo];

    return new Promise<UbicacionLeida>((resolve, reject) => {
      if (!this.soportada) {
        reject(new UbicacionError('UBICACION_NO_DISPONIBLE', MENSAJES.UBICACION_NO_DISPONIBLE));
        return;
      }

      let mejor: UbicacionLeida | null = null;
      let terminado = false;
      const ids: { vigilancia?: number; temporizador?: ReturnType<typeof setTimeout> } = {};

      const terminar = (accion: () => void): void => {
        if (terminado) return;
        terminado = true;
        if (ids.vigilancia !== undefined) navigator.geolocation.clearWatch(ids.vigilancia);
        if (ids.temporizador !== undefined) clearTimeout(ids.temporizador);
        accion();
      };

      ids.vigilancia = navigator.geolocation.watchPosition(
        (posicion) => {
          const lectura: UbicacionLeida = {
            lat: posicion.coords.latitude,
            lng: posicion.coords.longitude,
            precision: posicion.coords.accuracy
          };
          if (!mejor || lectura.precision < mejor.precision) mejor = lectura;
          if (lectura.precision <= precisionObjetivoM) terminar(() => resolve(lectura));
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            terminar(() => reject(new UbicacionError('UBICACION_DENEGADA', MENSAJES.UBICACION_DENEGADA)));
          }
          // otros errores (señal débil, tiempo agotado de una lectura) se reintentan hasta que venza la espera
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: esperaMaxMs }
      );

      ids.temporizador = setTimeout(() => {
        terminar(() =>
          mejor ? resolve(mejor) : reject(new UbicacionError('UBICACION_NO_DISPONIBLE', MENSAJES.UBICACION_NO_DISPONIBLE))
        );
      }, esperaMaxMs);
    });
  }
}
