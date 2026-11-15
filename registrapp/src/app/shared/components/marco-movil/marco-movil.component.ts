import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

export interface PestanaMovil {
  ruta: string;
  icono: string;
  texto: string;
  /** true: solo se marca activa con la ruta exacta (p. ej. "Inicio") */
  exacta?: boolean;
  /** número que se muestra como insignia (p. ej. solicitudes pendientes) */
  insignia?: number;
}

export const PESTANAS_ALUMNO: PestanaMovil[] = [
  { ruta: '/miembro', icono: 'pi-home', texto: 'Inicio', exacta: true },
  { ruta: '/miembro/escanear', icono: 'pi-qrcode', texto: 'Escanear' },
  { ruta: '/miembro/historial', icono: 'pi-calendar', texto: 'Historial' }
];

/**
 * Marco de las pantallas pensadas para el teléfono (alumno y profesor): cabecera oscura con la marca
 * y el saludo (contenido con el atributo `saludo`), el contenido debajo y una barra de navegación inferior.
 */
@Component({
  selector: 'app-marco-movil',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './marco-movil.component.html',
  styleUrl: './marco-movil.component.scss'
})
export class MarcoMovilComponent {
  readonly auth = inject(AuthService);
  readonly pestanas = input<PestanaMovil[]>(PESTANAS_ALUMNO);

  iniciales(nombreCompleto: string): string {
    return nombreCompleto
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase())
      .join('');
  }

  cerrarSesion(): void {
    this.auth.logout();
  }
}
