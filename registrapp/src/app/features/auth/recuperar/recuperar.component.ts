import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-recuperar',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, InputTextModule, ButtonModule],
  templateUrl: './recuperar.component.html',
  styleUrl: './recuperar.component.scss'
})
export class RecuperarComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;

  readonly cargando = signal(false);
  readonly enviado = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]]
  });

  async enviar(): Promise<void> {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    const { email } = this.form.getRawValue();

    // Se ignora el resultado a propósito: nunca se revela si el correo existe o no.
    await this.supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${location.origin}/restablecer`
    });

    this.cargando.set(false);
    this.enviado.set(true);
  }
}
