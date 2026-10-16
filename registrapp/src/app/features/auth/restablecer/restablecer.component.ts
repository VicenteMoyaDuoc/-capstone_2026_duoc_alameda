import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SupabaseService } from '../../../core/services/supabase.service';

function contraseniasCoinciden(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password')?.value;
    const confirmacion = group.get('confirmacion')?.value;
    return password && confirmacion && password !== confirmacion ? { noCoincide: true } : null;
  };
}

@Component({
  selector: 'app-restablecer',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PasswordModule, ButtonModule, MessageModule],
  templateUrl: './restablecer.component.html',
  styleUrl: './restablecer.component.scss'
})
export class RestablecerComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;
  private readonly router = inject(Router);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly listo = signal(false);

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
      this.error.set('El enlace venció o ya se usó. Solicita uno nuevo desde "¿Olvidaste tu contraseña?".');
      return;
    }

    await this.supabase.auth.signOut();
    this.cargando.set(false);
    this.listo.set(true);

    setTimeout(() => this.router.navigateByUrl('/login'), 2500);
  }
}
