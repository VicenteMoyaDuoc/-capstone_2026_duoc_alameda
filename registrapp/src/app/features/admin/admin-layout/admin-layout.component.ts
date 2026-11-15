import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { SolicitudesService } from '../../../core/services/solicitudes.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  readonly auth = inject(AuthService);
  readonly terminologia = inject(TerminologiaService);
  readonly solicitudes = inject(SolicitudesService);
  readonly menuAbierto = signal(false);

  constructor() {
    this.solicitudes.actualizarPendientes();
  }

  iniciales(nombreCompleto: string): string {
    return nombreCompleto
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase())
      .join('');
  }

  abrirMenu(): void {
    this.menuAbierto.set(true);
  }

  cerrarMenu(): void {
    this.menuAbierto.set(false);
  }
}
