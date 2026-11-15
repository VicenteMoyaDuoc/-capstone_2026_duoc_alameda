import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import type { AsistenciaError, DatosGeo, ResultadoRegistro } from '../../../core/services/asistencia.service';
import type { UbicacionLeida } from '../../../core/services/ubicacion.service';
import { MapaUbicacionComponent, type Punto } from '../../mapa-ubicacion/mapa-ubicacion.component';

/** Mapa que se le muestra al alumno: la sede con su radio y dónde está él. */
export interface MapaVista {
  sede: Punto;
  radioM: number;
  alumno: Punto | null;
  distanciaM: number | null;
}

export type ResultadoAsistenciaVista =
  | { tipo: 'cargando' }
  | { tipo: 'exito'; estado: 'puntual' | 'tardanza'; horaTexto: string; grupoNombre?: string; asignaturaNombre?: string; mapa?: MapaVista }
  | { tipo: 'error'; mensaje: string; mapa?: MapaVista };

/** El mapa solo se muestra en proximidad (el servidor envía la sede). En exacta no se revela dónde está el profesor. */
export function mapaDeGeo(geo: DatosGeo | null | undefined, ubicacion: UbicacionLeida | undefined): MapaVista | undefined {
  if (!geo?.sede) return undefined;
  return {
    sede: { lat: geo.sede.lat, lng: geo.sede.lng },
    radioM: geo.sede.radio_m,
    alumno: ubicacion ? { lat: ubicacion.lat, lng: ubicacion.lng } : null,
    distanciaM: geo.distancia_m
  };
}

export const mapaDeRegistro = (r: ResultadoRegistro): MapaVista | undefined => mapaDeGeo(r.geo, r.ubicacionAlumno);

export const mapaDeError = (e: AsistenciaError): MapaVista | undefined =>
  mapaDeGeo((e.data as DatosGeo | undefined) ?? null, e.ubicacion);

@Component({
  selector: 'app-resultado-asistencia',
  standalone: true,
  imports: [ButtonModule, RouterLink, MapaUbicacionComponent],
  templateUrl: './resultado-asistencia.component.html',
  styleUrl: './resultado-asistencia.component.scss'
})
export class ResultadoAsistenciaComponent {
  readonly resultado = input.required<ResultadoAsistenciaVista>();
  readonly mostrarEscanearOtro = input(false);

  readonly escanearOtro = output<void>();

  estaDentro(m: MapaVista): boolean {
    return Math.round(m.distanciaM ?? 0) <= m.radioM;
  }

  textoDistancia(m: MapaVista): string {
    const d = Math.round(m.distanciaM ?? 0);
    return this.estaDentro(m)
      ? `Estás a ${d} m del centro de la sede (permitido: ${m.radioM} m).`
      : `Estás a ${d} m del centro de la sede; el máximo permitido es ${m.radioM} m.`;
  }
}
