import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AdministracionService } from '../../../core/services/administracion.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-onboarding-institucion',
  standalone: true,
  imports: [ReactiveFormsModule, InputTextModule, SelectModule, ButtonModule, MessageModule],
  templateUrl: './institucion.component.html',
  styleUrl: './institucion.component.scss'
})
export class OnboardingInstitucionComponent {
  private readonly fb = inject(FormBuilder);
  private readonly administracion = inject(AdministracionService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly tipos = [
    { label: 'Educativa', value: 'educativa' },
    { label: 'Corporativa', value: 'corporativa' }
  ];

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    tipo: ['educativa' as 'educativa' | 'corporativa', Validators.required],
    nombre_completo: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]]
  });

  async crear(): Promise<void> {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    try {
      await this.administracion.crearInstitucion(this.form.getRawValue());
      await this.auth.recargarUsuarioActual();
      const usuario = this.auth.currentUser();
      await this.router.navigateByUrl(usuario ? this.auth.rutaSegunRol(usuario.rol) : '/login');
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'No se pudo crear la institución.';

      if (mensaje === 'Debes iniciar sesión.') {
        // La sesión guardada en este navegador ya no es válida (p. ej. la cuenta fue
        // eliminada). Sin esto, el usuario queda atrapado: esta pantalla cree que hay
        // sesión, pero el servidor la rechaza siempre. Se limpia y se manda a /login.
        await this.auth.logout();
        return;
      }

      this.error.set(mensaje);
    } finally {
      this.cargando.set(false);
    }
  }
}
