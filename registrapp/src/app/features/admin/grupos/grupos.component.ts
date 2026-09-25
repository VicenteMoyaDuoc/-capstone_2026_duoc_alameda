import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { Usuario } from '../../../core/models/models';

interface GrupoConResponsable {
  id: string;
  nombre: string;
  responsable_id: string | null;
  responsable: { nombre_completo: string } | null;
}

@Component({
  selector: 'app-grupos',
  standalone: true,
  imports: [ReactiveFormsModule, TableModule, DialogModule, ButtonModule, InputTextModule, SelectModule, MessageModule],
  templateUrl: './grupos.component.html',
  styleUrl: './grupos.component.scss'
})
export class GruposComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly mostrarDialogo = signal(false);
  readonly error = signal<string | null>(null);

  readonly grupos = signal<GrupoConResponsable[]>([]);
  readonly responsables = signal<Usuario[]>([]);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    responsable_id: ['', Validators.required]
  });

  constructor() {
    this.cargarDatos();
  }

  abrirDialogo(): void {
    this.form.reset({ nombre: '', responsable_id: '' });
    this.error.set(null);
    this.mostrarDialogo.set(true);
  }

  async crearGrupo(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (this.form.invalid || !institucionId || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);

    const { nombre, responsable_id } = this.form.getRawValue();

    const { data: nuevoGrupo, error: errorInsert } = await this.supabase
      .from('grupos')
      .insert({ nombre, institucion_id: institucionId, responsable_id })
      .select()
      .single();

    if (errorInsert || !nuevoGrupo) {
      this.error.set('No se pudo crear el grupo: ' + errorInsert?.message);
      this.guardando.set(false);
      return;
    }

    await this.supabase.from('usuarios').update({ grupo_id: nuevoGrupo['id'] }).eq('id', responsable_id);

    this.guardando.set(false);
    this.mostrarDialogo.set(false);
    await this.cargarDatos();
  }

  private async cargarDatos(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    const [grupos, responsables] = await Promise.all([
      this.supabase
        .from('grupos')
        .select('id, nombre, responsable_id, responsable:usuarios!grupos_responsable_id_fkey(nombre_completo)')
        .eq('institucion_id', institucionId)
        .order('nombre'),
      this.supabase.from('usuarios').select('*').eq('institucion_id', institucionId).eq('rol', 'responsable')
    ]);

    if (grupos.error) {
      this.error.set('No se pudieron cargar los grupos: ' + grupos.error.message);
    }

    this.grupos.set((grupos.data as unknown as GrupoConResponsable[]) ?? []);
    this.responsables.set((responsables.data as Usuario[]) ?? []);
    this.cargando.set(false);
  }
}
