import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';

@Component({
  selector: 'app-instituciones',
  standalone: true,
  imports: [ReactiveFormsModule, InputTextModule, InputNumberModule, ButtonModule, MessageModule],
  templateUrl: './instituciones.component.html',
  styleUrl: './instituciones.component.scss'
})
export class InstitucionesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly mensaje = signal<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  readonly tipoInstitucion = signal<'educativa' | 'corporativa'>('educativa');

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    tolerancia_min: [10, [Validators.required, Validators.min(0), Validators.max(120)]],
    duracion_sesion_min: [90, [Validators.required, Validators.min(5), Validators.max(480)]],
    qr_ttl_seg: [60, [Validators.required, Validators.min(20), Validators.max(300)]]
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
      this.tipoInstitucion.set(data['tipo']);
      this.form.patchValue({
        nombre: data['nombre'],
        tolerancia_min: data['tolerancia_min'],
        duracion_sesion_min: data['duracion_sesion_min'],
        qr_ttl_seg: data['qr_ttl_seg']
      });
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
