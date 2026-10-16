import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { hayTokenPendiente } from '../../../core/utils/asistir-pendiente';

function contraseniasCoinciden(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password')?.value;
    const confirmacion = group.get('confirmacion')?.value;
    return password && confirmacion && password !== confirmacion ? { noCoincide: true } : null;
  };
}

@Component({
  selector: 'app-cambiar-password',
  standalone: true,
  imports: [ReactiveFormsModule, PasswordModule, ButtonModule, MessageModule],
  templateUrl: './cambiar-password.component.html',
  styleUrl: './cambiar-password.component.scss'
})
export class CambiarPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(10)]],
      confirmacion: ['', Validators.required]
    },
    { validators: contraseniasCoinciden() }
  );

  async guardar(): Promise<void> {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    const { password } = this.form.getRawValue();
    const { error } = await this.supabase.auth.updateUser({ password });

    if (error) {
      this.cargando.set(false);
      this.error.set('No se pudo actualizar la contraseña. Intenta nuevamente.');
      return;
    }

    await this.auth.marcarPasswordCambiada();
    this.cargando.set(false);

    if (hayTokenPendiente()) {
      await this.router.navigateByUrl('/asistir');
      return;
    }

    const usuario = this.auth.currentUser();
    await this.router.navigateByUrl(usuario ? this.auth.rutaSegunRol(usuario.rol) : '/login');
  }
}
