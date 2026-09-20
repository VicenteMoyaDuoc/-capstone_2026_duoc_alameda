import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-instituciones',
  standalone: true,
  imports: [ReactiveFormsModule, InputTextModule, SelectModule, ButtonModule, MessageModule],
  templateUrl: './instituciones.component.html',
  styleUrl: './instituciones.component.scss'
})
export class InstitucionesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly mensaje = signal<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  readonly tipos = [
    { label: 'Educativa', value: 'educativa' },
    { label: 'Corporativa', value: 'corporativa' }
  ];

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    tipo: ['educativa', Validators.required]
  });

  constructor() {
    this.cargarInstitucion();
  }

  private async cargarInstitucion(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    const { data } = await this.supabase.from('instituciones').select('*').eq('id', institucionId).single();

    if (data) {
      this.form.patchValue({ nombre: data['nombre'], tipo: data['tipo'] });
    }

    this.cargando.set(false);
  }

  async guardar(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (this.form.invalid || !institucionId || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.mensaje.set(null);

    const { error } = await this.supabase.from('instituciones').update(this.form.getRawValue()).eq('id', institucionId);

    this.mensaje.set(
      error ? { tipo: 'error', texto: 'No se pudo guardar: ' + error.message } : { tipo: 'success', texto: 'Institución actualizada.' }
    );
    this.guardando.set(false);
  }
}
