import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { Usuario } from '../../../core/models/models';

const FILAS_POR_PAGINA = 10;

interface GrupoConResponsable {
  id: string;
  nombre: string;
  responsable_id: string | null;
  responsable: { nombre_completo: string } | null;
}

interface AsignaturaConResponsable {
  id: string;
  nombre: string;
  responsable_id: string | null;
  activo: boolean;
  responsable: { nombre_completo: string } | null;
}

@Component({
  selector: 'app-grupos',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, TableModule, DialogModule, ButtonModule, InputTextModule, SelectModule, MessageModule],
  templateUrl: './grupos.component.html',
  styleUrl: './grupos.component.scss'
})
export class GruposComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly confirmacion = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly filasPorPagina = FILAS_POR_PAGINA;

  readonly busqueda = signal('');
  readonly grupos = signal<GrupoConResponsable[]>([]);
  readonly totalRegistros = signal(0);
  readonly conteoMiembros = signal<Record<string, number>>({});
  readonly responsables = signal<Usuario[]>([]);

  readonly mostrarDialogo = signal(false);
  readonly editando = signal<GrupoConResponsable | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    responsable_id: ['' as string | null]
  });

  // Fase 4 (ampliación) — asignaturas por curso, solo instituciones educativas.
  readonly mostrarAsignaturas = signal(false);
  readonly grupoParaAsignaturas = signal<GrupoConResponsable | null>(null);
  readonly asignaturasDelGrupo = signal<AsignaturaConResponsable[]>([]);
  readonly cargandoAsignaturas = signal(false);
  readonly guardandoAsignatura = signal(false);
  readonly errorAsignatura = signal<string | null>(null);
  readonly editandoAsignatura = signal<AsignaturaConResponsable | null>(null);
  readonly mostrarFormAsignatura = signal(false);

  readonly formAsignatura = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    responsable_id: ['' as string | null]
  });

  constructor() {
    this.cargarResponsables();
    this.cargarGrupos(0);
  }

  onLazyLoad(evento: TableLazyLoadEvent): void {
    this.cargarGrupos(evento.first ?? 0);
  }

  onBusquedaCambiada(): void {
    this.cargarGrupos(0);
  }

  abrirCrear(): void {
    this.editando.set(null);
    this.form.reset({ nombre: '', responsable_id: null });
    this.error.set(null);
    this.mostrarDialogo.set(true);
  }

  abrirEditar(grupo: GrupoConResponsable): void {
    this.editando.set(grupo);
    this.form.reset({ nombre: grupo.nombre, responsable_id: grupo.responsable_id });
    this.error.set(null);
    this.mostrarDialogo.set(true);
  }

  async guardar(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (this.form.invalid || !institucionId || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.error.set(null);

    const { nombre, responsable_id } = this.form.getRawValue();
    const editando = this.editando();

    const { error } = editando
      ? await this.supabase.from('grupos').update({ nombre, responsable_id: responsable_id || null }).eq('id', editando.id)
      : await this.supabase.from('grupos').insert({ nombre, institucion_id: institucionId, responsable_id: responsable_id || null });

    this.guardando.set(false);

    if (error) {
      this.error.set(this.mensajeError(error.message));
      return;
    }

    this.mostrarDialogo.set(false);
    this.toast.add({ severity: 'success', summary: editando ? 'Grupo actualizado' : 'Grupo creado' });
    await this.cargarGrupos(0);
  }

  confirmarArchivar(grupo: GrupoConResponsable): void {
    this.confirmacion.confirm({
      header: `Archivar ${this.terminologia.grupo().toLowerCase()}`,
      message: `¿Archivar "${grupo.nombre}"? Ya no aparecerá en los listados activos.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Archivar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.archivar(grupo)
    });
  }

  private async archivar(grupo: GrupoConResponsable): Promise<void> {
    const { count } = await this.supabase
      .from('sesiones_asistencia')
      .select('id', { count: 'exact', head: true })
      .eq('grupo_id', grupo.id)
      .is('cerrada_en', null);

    if ((count ?? 0) > 0) {
      this.toast.add({
        severity: 'warn',
        summary: 'No se puede archivar',
        detail: `"${grupo.nombre}" tiene una sesión abierta. Ciérrala primero.`
      });
      return;
    }

    const { error } = await this.supabase.from('grupos').update({ activo: false }).eq('id', grupo.id);

    if (error) {
      this.toast.add({ severity: 'error', summary: 'No se pudo archivar', detail: error.message });
      return;
    }

    this.toast.add({ severity: 'success', summary: 'Grupo archivado' });
    await this.cargarGrupos(0);
  }

  cantidadMiembros(grupoId: string): number {
    return this.conteoMiembros()[grupoId] ?? 0;
  }

  private mensajeError(mensaje: string): string {
    if (mensaje.includes('uq_grupo_nombre_por_institucion')) {
      return `Ya existe ${this.terminologia.grupo().toLowerCase()} con ese nombre.`;
    }
    if (mensaje.toLowerCase().includes('responsable')) {
      return mensaje;
    }
    return 'No se pudo guardar: ' + mensaje;
  }

  private async cargarResponsables(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;
    if (!institucionId) return;

    const { data } = await this.supabase
      .from('usuarios')
      .select('*')
      .eq('institucion_id', institucionId)
      .eq('rol', 'responsable')
      .eq('activo', true)
      .order('nombre_completo');

    this.responsables.set((data as Usuario[]) ?? []);
  }

  private async cargarGrupos(primero: number): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    this.cargando.set(true);

    let consulta = this.supabase
      .from('grupos')
      .select('id, nombre, responsable_id, responsable:usuarios!grupos_responsable_id_fkey(nombre_completo)', { count: 'exact' })
      .eq('institucion_id', institucionId)
      .eq('activo', true);

    if (this.busqueda().trim()) {
      consulta = consulta.ilike('nombre', `%${this.busqueda().trim()}%`);
    }

    const [{ data, error, count }, miembros] = await Promise.all([
      consulta.order('nombre').range(primero, primero + this.filasPorPagina - 1),
      this.supabase.from('usuarios').select('grupo_id').eq('institucion_id', institucionId).eq('rol', 'miembro')
    ]);

    if (error) {
      this.error.set('No se pudieron cargar los grupos: ' + error.message);
    }

    const conteo: Record<string, number> = {};
    for (const fila of miembros.data ?? []) {
      const grupoId = fila['grupo_id'] as string | null;
      if (grupoId) conteo[grupoId] = (conteo[grupoId] ?? 0) + 1;
    }

    this.grupos.set((data as unknown as GrupoConResponsable[]) ?? []);
    this.totalRegistros.set(count ?? 0);
    this.conteoMiembros.set(conteo);
    this.cargando.set(false);
  }

  // ───────────────────────── Fase 4 (ampliación) — asignaturas ─────────────────────────

  async abrirAsignaturas(grupo: GrupoConResponsable): Promise<void> {
    this.grupoParaAsignaturas.set(grupo);
    this.mostrarAsignaturas.set(true);
    await this.cargarAsignaturas(grupo.id);
  }

  cerrarAsignaturas(): void {
    this.mostrarAsignaturas.set(false);
    this.grupoParaAsignaturas.set(null);
    this.asignaturasDelGrupo.set([]);
  }

  abrirCrearAsignatura(): void {
    this.editandoAsignatura.set(null);
    this.formAsignatura.reset({ nombre: '', responsable_id: null });
    this.errorAsignatura.set(null);
    this.mostrarFormAsignatura.set(true);
  }

  abrirEditarAsignatura(asignatura: AsignaturaConResponsable): void {
    this.editandoAsignatura.set(asignatura);
    this.formAsignatura.reset({ nombre: asignatura.nombre, responsable_id: asignatura.responsable_id });
    this.errorAsignatura.set(null);
    this.mostrarFormAsignatura.set(true);
  }

  async guardarAsignatura(): Promise<void> {
    const grupo = this.grupoParaAsignaturas();
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (this.formAsignatura.invalid || !grupo || !institucionId || this.guardandoAsignatura()) {
      this.formAsignatura.markAllAsTouched();
      return;
    }

    this.guardandoAsignatura.set(true);
    this.errorAsignatura.set(null);

    const { nombre, responsable_id } = this.formAsignatura.getRawValue();
    const editando = this.editandoAsignatura();

    const { error } = editando
      ? await this.supabase.from('asignaturas').update({ nombre, responsable_id: responsable_id || null }).eq('id', editando.id)
      : await this.supabase
          .from('asignaturas')
          .insert({ nombre, institucion_id: institucionId, grupo_id: grupo.id, responsable_id: responsable_id || null });

    this.guardandoAsignatura.set(false);

    if (error) {
      this.errorAsignatura.set(this.mensajeErrorAsignatura(error.message));
      return;
    }

    this.mostrarFormAsignatura.set(false);
    this.toast.add({ severity: 'success', summary: editando ? 'Asignatura actualizada' : 'Asignatura creada' });
    await this.cargarAsignaturas(grupo.id);
  }

  confirmarArchivarAsignatura(asignatura: AsignaturaConResponsable): void {
    this.confirmacion.confirm({
      header: 'Archivar asignatura',
      message: `¿Archivar "${asignatura.nombre}"? Ya no se podrán abrir nuevas sesiones de asistencia para ella.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Archivar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.archivarAsignatura(asignatura)
    });
  }

  private async archivarAsignatura(asignatura: AsignaturaConResponsable): Promise<void> {
    const grupo = this.grupoParaAsignaturas();
    if (!grupo) return;

    const { count } = await this.supabase
      .from('sesiones_asistencia')
      .select('id', { count: 'exact', head: true })
      .eq('asignatura_id', asignatura.id)
      .is('cerrada_en', null);

    if ((count ?? 0) > 0) {
      this.toast.add({
        severity: 'warn',
        summary: 'No se puede archivar',
        detail: `"${asignatura.nombre}" tiene una sesión abierta. Ciérrala primero.`
      });
      return;
    }

    const { error } = await this.supabase.from('asignaturas').update({ activo: false }).eq('id', asignatura.id);

    if (error) {
      this.toast.add({ severity: 'error', summary: 'No se pudo archivar', detail: error.message });
      return;
    }

    this.toast.add({ severity: 'success', summary: 'Asignatura archivada' });
    await this.cargarAsignaturas(grupo.id);
  }

  private mensajeErrorAsignatura(mensaje: string): string {
    if (mensaje.includes('uq_asignatura_nombre_por_grupo')) {
      return `Ya existe una asignatura con ese nombre en ${this.terminologia.grupo().toLowerCase()}.`;
    }
    if (mensaje.toLowerCase().includes('responsable')) {
      return mensaje;
    }
    return 'No se pudo guardar: ' + mensaje;
  }

  private async cargarAsignaturas(grupoId: string): Promise<void> {
    this.cargandoAsignaturas.set(true);

    const { data } = await this.supabase
      .from('asignaturas')
      .select('id, nombre, responsable_id, activo, responsable:usuarios!asignaturas_responsable_id_fkey(nombre_completo)')
      .eq('grupo_id', grupoId)
      .eq('activo', true)
      .order('nombre');

    this.asignaturasDelGrupo.set((data as unknown as AsignaturaConResponsable[]) ?? []);
    this.cargandoAsignaturas.set(false);
  }
}
