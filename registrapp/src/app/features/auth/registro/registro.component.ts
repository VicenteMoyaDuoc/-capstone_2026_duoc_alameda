import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
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
  selector: 'app-registro',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, InputTextModule, PasswordModule, ButtonModule, MessageModule],
  templateUrl: './registro.component.html',
  styleUrl: './registro.component.scss'
})
export class RegistroComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly registroExitoso = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(10)]],
      confirmacion: ['', Validators.required]
    },
    { validators: contraseniasCoinciden() }
  );

  readonly fortaleza = computed(() => {
    const password = this.form.get('password')?.value ?? '';
    if (password.length < 10) return { texto: '', clase: '' };

    let puntos = 0;
    if (/[a-z]/.test(password)) puntos++;
    if (/[A-Z]/.test(password)) puntos++;
    if (/[0-9]/.test(password)) puntos++;
    if (/[^a-zA-Z0-9]/.test(password)) puntos++;
    if (password.length >= 14) puntos++;

    if (puntos <= 2) return { texto: 'Débil', clase: 'debil' };
    if (puntos <= 3) return { texto: 'Media', clase: 'media' };
    return { texto: 'Fuerte', clase: 'fuerte' };
  });

  async registrar(): Promise<void> {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();

    const { error } = await this.supabase.auth.signUp({ email: email.trim().toLowerCase(), password });

    this.cargando.set(false);

    if (error) {
      this.error.set('No se pudo completar el registro. Intenta nuevamente.');
      return;
    }

    this.registroExitoso.set(true);
  }
}
