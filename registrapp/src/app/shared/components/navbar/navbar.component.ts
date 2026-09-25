import { Component, inject, input } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent {
  readonly auth = inject(AuthService);
  readonly titulo = input('Registrapp');

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
