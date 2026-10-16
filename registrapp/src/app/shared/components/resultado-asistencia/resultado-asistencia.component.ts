import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

export type ResultadoAsistenciaVista =
  | { tipo: 'cargando' }
  | { tipo: 'exito'; estado: 'puntual' | 'tardanza'; horaTexto: string; grupoNombre?: string; asignaturaNombre?: string }
  | { tipo: 'error'; mensaje: string };

@Component({
  selector: 'app-resultado-asistencia',
  standalone: true,
  imports: [ButtonModule, RouterLink],
  templateUrl: './resultado-asistencia.component.html',
  styleUrl: './resultado-asistencia.component.scss'
})
export class ResultadoAsistenciaComponent {
  readonly resultado = input.required<ResultadoAsistenciaVista>();
  readonly mostrarEscanearOtro = input(false);

  readonly escanearOtro = output<void>();
}
