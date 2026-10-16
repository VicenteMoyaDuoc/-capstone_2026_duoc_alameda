import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/services/auth.service';
import { hayTokenPendiente } from '../../../core/utils/asistir-pendiente';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, InputTextModule, PasswordModule, ButtonModule, MessageModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  async iniciarSesion(): Promise<void> {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();

    try {
      const usuario = await this.auth.login(email, password);

      if (!usuario) {
        await this.router.navigateByUrl('/onboarding/institucion');
        return;
      }

      if (!usuario.debe_cambiar_password && hayTokenPendiente()) {
        await this.router.navigateByUrl('/asistir');
        return;
      }

      await this.router.navigateByUrl(this.auth.rutaSegunEstado(usuario));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Correo o contraseña incorrectos.');
    } finally {
      this.cargando.set(false);
    }
  }
}
