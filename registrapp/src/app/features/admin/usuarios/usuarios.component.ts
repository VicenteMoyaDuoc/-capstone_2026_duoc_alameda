import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import * as XLSX from 'xlsx';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdministracionService } from '../../../core/services/administracion.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { Grupo, Rol, Usuario } from '../../../core/models/models';

const FILAS_POR_PAGINA = 10;

/** Fase 4 (ampliación) — carga masiva de usuarios desde CSV/Excel. */
interface FilaCargaMasiva {
  fila: number;
  correo: string;
  nombre_completo: string;
  rol: string;
  curso: string;
}

interface ResultadoFilaCarga {
  fila: number;
  correo: string;
  nombre_completo: string;
  estado: 'creado' | 'error';
  detalle: string;
}

const COLUMNAS_PLANTILLA = ['correo', 'nombre_completo', 'rol', 'curso'];

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    TableModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    MessageModule,
    TagModule
  ],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.scss'
})
export class UsuariosComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly administracion = inject(AdministracionService);
  private readonly confirmacion = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  readonly terminologia = inject(TerminologiaService);

  readonly usuarios = signal<Usuario[]>([]);
  readonly grupos = signal<Grupo[]>([]);
  readonly totalRegistros = signal(0);
  readonly cargando = signal(true);
  readonly filasPorPagina = FILAS_POR_PAGINA;

  readonly busqueda = signal('');
  readonly filtroRol = signal<Rol | 'todos'>('todos');
  readonly filtroGrupo = signal<string | 'todos'>('todos');
  readonly filtroEstado = signal<'todos' | 'activo' | 'desactivado'>('todos');

  readonly opcionesRol = [
    { label: 'Todos los roles', value: 'todos' },
    { label: 'Responsable', value: 'responsable' },
    { label: 'Miembro', value: 'miembro' }
  ];

  readonly opcionesEstado = [
    { label: 'Todos los estados', value: 'todos' },
    { label: 'Activo', value: 'activo' },
    { label: 'Desactivado', value: 'desactivado' }
  ];

  readonly mostrarCrear = signal(false);
  readonly guardandoCrear = signal(false);
  readonly errorCrear = signal<string | null>(null);

  readonly mostrarEditar = signal(false);
  readonly guardandoEditar = signal(false);
  readonly errorEditar = signal<string | null>(null);
  readonly usuarioEditando = signal<Usuario | null>(null);

  readonly mostrarPassword = signal(false);
  readonly passwordMostrada = signal('');
  readonly copiado = signal(false);

  // Fase 4 (ampliación) — carga masiva de usuarios.
  readonly mostrarCargaMasiva = signal(false);
  readonly filasCarga = signal<FilaCargaMasiva[]>([]);
  readonly erroresLectura = signal<string[]>([]);
  readonly procesandoCarga = signal(false);
  readonly filasProcesadas = signal(0);
  readonly resultadosCarga = signal<ResultadoFilaCarga[]>([]);
  readonly resultadosCargaExitosas = computed(() => this.resultadosCarga().filter((r) => r.estado === 'creado').length);
  /** Una sola contraseña temporal para todo el lote (más práctico que una distinta por fila
   * cuando son decenas de personas) — el cambio obligatorio en el primer ingreso sigue aplicando igual. */
  readonly passwordLote = signal('');
  readonly passwordLoteValida = computed(() => this.passwordLote().length >= 10);

  readonly formCrear = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    nombre_completo: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    rol: ['miembro' as Extract<Rol, 'responsable' | 'miembro'>, Validators.required],
    grupo_id: ['' as string | null]
  });

  readonly formEditar = this.fb.nonNullable.group({
    nombre_completo: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    grupo_id: ['' as string | null]
  });

  constructor() {
    this.cargarGrupos();
    this.cargarUsuarios(0);
  }

  get opcionesGrupoFiltro() {
    return [{ label: `Todos los ${this.terminologia.grupos().toLowerCase()}`, value: 'todos' }, ...this.gruposComoOpciones()];
  }

  gruposComoOpciones() {
    return this.grupos().map((g) => ({ label: g.nombre, value: g.id }));
  }

  onLazyLoad(evento: TableLazyLoadEvent): void {
    const primero = evento.first ?? 0;
    this.cargarUsuarios(primero);
  }

  onFiltroCambiado(): void {
    this.cargarUsuarios(0);
  }

  abrirCrear(): void {
    this.formCrear.reset({ email: '', nombre_completo: '', rol: 'miembro', grupo_id: null });
    this.errorCrear.set(null);
    this.mostrarCrear.set(true);
  }

  async crear(): Promise<void> {
    if (this.formCrear.invalid || this.guardandoCrear()) {
      this.formCrear.markAllAsTouched();
      return;
    }

    const { email, nombre_completo, rol, grupo_id } = this.formCrear.getRawValue();

    if (rol === 'miembro' && !grupo_id) {
      this.errorCrear.set(`Selecciona ${this.terminologia.grupo().toLowerCase()} para ${this.terminologia.miembro().toLowerCase()}.`);
      return;
    }

    this.guardandoCrear.set(true);
    this.errorCrear.set(null);

    try {
      const resultado = await this.administracion.crearUsuario({
        email,
        nombre_completo,
        rol,
        grupo_id: grupo_id || null
      });

      this.mostrarCrear.set(false);
      this.mostrarPasswordTemporal(resultado.password_temporal);
      this.toast.add({ severity: 'success', summary: 'Usuario creado', detail: nombre_completo });
      await this.cargarUsuarios(0);
    } catch (err) {
      this.errorCrear.set(err instanceof Error ? err.message : 'No se pudo crear el usuario.');
    } finally {
      this.guardandoCrear.set(false);
    }
  }

  abrirEditar(usuario: Usuario): void {
    this.usuarioEditando.set(usuario);
    this.formEditar.reset({ nombre_completo: usuario.nombre_completo, grupo_id: usuario.grupo_id });
    this.errorEditar.set(null);
    this.mostrarEditar.set(true);
  }

  async guardarEdicion(): Promise<void> {
    const usuario = this.usuarioEditando();
    if (!usuario || this.formEditar.invalid || this.guardandoEditar()) {
      this.formEditar.markAllAsTouched();
      return;
    }

    this.guardandoEditar.set(true);
    this.errorEditar.set(null);

    try {
      const { nombre_completo, grupo_id } = this.formEditar.getRawValue();
      await this.administracion.editarUsuario(usuario.id, { nombre_completo, grupo_id: grupo_id || null });
      this.mostrarEditar.set(false);
      this.toast.add({ severity: 'success', summary: 'Cambios guardados' });
      await this.cargarUsuarios(0);
    } catch (err) {
      this.errorEditar.set(err instanceof Error ? err.message : 'No se pudo guardar el cambio.');
    } finally {
      this.guardandoEditar.set(false);
    }
  }

  confirmarDesactivar(usuario: Usuario): void {
    this.confirmacion.confirm({
      header: 'Desactivar usuario',
      message: `¿Desactivar a ${usuario.nombre_completo}? No podrá iniciar sesión hasta que lo reactives.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      accept: () => this.desactivar(usuario)
    });
  }

  private async desactivar(usuario: Usuario): Promise<void> {
    try {
      await this.administracion.desactivarUsuario(usuario.id);
      this.toast.add({ severity: 'success', summary: 'Usuario desactivado' });
      await this.cargarUsuarios(0);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'No se pudo desactivar', detail: err instanceof Error ? err.message : '' });
    }
  }

  confirmarReactivar(usuario: Usuario): void {
    this.confirmacion.confirm({
      header: 'Reactivar usuario',
      message: `¿Reactivar a ${usuario.nombre_completo}?`,
      icon: 'pi pi-question-circle',
      acceptLabel: 'Reactivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        try {
          await this.administracion.reactivarUsuario(usuario.id);
          this.toast.add({ severity: 'success', summary: 'Usuario reactivado' });
          await this.cargarUsuarios(0);
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'No se pudo reactivar', detail: err instanceof Error ? err.message : '' });
        }
      }
    });
  }

  confirmarResetPassword(usuario: Usuario): void {
    this.confirmacion.confirm({
      header: 'Resetear contraseña',
      message: `Se generará una nueva contraseña temporal para ${usuario.nombre_completo}.`,
      icon: 'pi pi-key',
      acceptLabel: 'Resetear',
      rejectLabel: 'Cancelar',
      accept: async () => {
        try {
          const resultado = await this.administracion.resetearPassword(usuario.id);
          this.mostrarPasswordTemporal(resultado.password_temporal);
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'No se pudo resetear', detail: err instanceof Error ? err.message : '' });
        }
      }
    });
  }

  async copiarPassword(): Promise<void> {
    await navigator.clipboard.writeText(this.passwordMostrada());
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2000);
  }

  async copiarPasswordLote(): Promise<void> {
    await navigator.clipboard.writeText(this.passwordLote());
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2000);
  }

  private mostrarPasswordTemporal(password: string): void {
    this.passwordMostrada.set(password);
    this.copiado.set(false);
    this.mostrarPassword.set(true);
  }

  private async cargarGrupos(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;
    if (!institucionId) return;

    const { data } = await this.supabase
      .from('grupos')
      .select('*')
      .eq('institucion_id', institucionId)
      .eq('activo', true)
      .order('nombre');

    this.grupos.set((data as Grupo[]) ?? []);
  }

  private async cargarUsuarios(primero: number): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;
    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    this.cargando.set(true);

    let consulta = this.supabase
      .from('usuarios')
      .select('*', { count: 'exact' })
      .eq('institucion_id', institucionId)
      .neq('rol', 'administrador');

    if (this.filtroRol() !== 'todos') {
      consulta = consulta.eq('rol', this.filtroRol());
    }
    if (this.filtroGrupo() !== 'todos') {
      consulta = consulta.eq('grupo_id', this.filtroGrupo());
    }
    if (this.filtroEstado() !== 'todos') {
      consulta = consulta.eq('activo', this.filtroEstado() === 'activo');
    }
    if (this.busqueda().trim()) {
      const termino = this.busqueda().trim();
      consulta = consulta.or(`nombre_completo.ilike.%${termino}%,email.ilike.%${termino}%`);
    }

    const { data, count } = await consulta.order('nombre_completo').range(primero, primero + this.filasPorPagina - 1);

    this.usuarios.set((data as Usuario[]) ?? []);
    this.totalRegistros.set(count ?? 0);
    this.cargando.set(false);
  }

  nombreGrupo(grupoId: string | null): string {
    if (!grupoId) return 'Sin asignar';
    return this.grupos().find((g) => g.id === grupoId)?.nombre ?? 'Sin asignar';
  }

  // ───────────────────────── Fase 4 (ampliación) — carga masiva ─────────────────────────

  abrirCargaMasiva(): void {
    this.filasCarga.set([]);
    this.erroresLectura.set([]);
    this.resultadosCarga.set([]);
    this.filasProcesadas.set(0);
    this.passwordLote.set(this.generarSugerenciaPassword());
    this.mostrarCargaMasiva.set(true);
  }

  /** Sugerencia editable, no una clave fija de siempre: cada lote puede tener la suya. */
  private generarSugerenciaPassword(): string {
    const sufijo = Math.floor(1000 + Math.random() * 9000);
    return `Bienvenido${sufijo}!`;
  }

  descargarPlantilla(): void {
    const encabezado = COLUMNAS_PLANTILLA.join(',');
    const ejemplo1 = 'ana.perez@ejemplo.com,Ana Pérez,miembro,' + (this.grupos()[0]?.nombre ?? '4to Medio A');
    const ejemplo2 = 'juan.soto@ejemplo.com,Juan Soto,responsable,';
    this.descargarCsv('plantilla-carga-masiva.csv', [encabezado, ejemplo1, ejemplo2].join('\n'));
  }

  async onArchivoSeleccionado(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    if (!archivo) return;

    this.resultadosCarga.set([]);
    this.filasProcesadas.set(0);

    const buffer = await archivo.arrayBuffer();
    const libro = XLSX.read(buffer, { type: 'array' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filasCrudas = XLSX.utils.sheet_to_json<Record<string, string>>(hoja, { defval: '' });

    const errores: string[] = [];
    const filas: FilaCargaMasiva[] = [];

    filasCrudas.forEach((fila, indice) => {
      const numeroFila = indice + 2; // +1 por el encabezado, +1 porque las filas se cuentan desde 1
      const correo = String(fila['correo'] ?? '').trim().toLowerCase();
      const nombre_completo = String(fila['nombre_completo'] ?? '').trim();
      const rol = String(fila['rol'] ?? '').trim().toLowerCase();
      const curso = String(fila['curso'] ?? '').trim();

      if (!correo || !nombre_completo || !rol) {
        errores.push(`Fila ${numeroFila}: faltan datos obligatorios (correo, nombre o rol).`);
        return;
      }
      if (rol !== 'responsable' && rol !== 'miembro') {
        errores.push(`Fila ${numeroFila}: el rol "${rol}" no es válido (usa "responsable" o "miembro").`);
        return;
      }
      if (rol === 'miembro' && !curso) {
        errores.push(`Fila ${numeroFila}: a ${nombre_completo} le falta el ${this.terminologia.grupo().toLowerCase()}.`);
        return;
      }
      if (rol === 'miembro' && !this.resolverGrupoPorNombre(curso)) {
        errores.push(`Fila ${numeroFila}: no existe "${curso}" como ${this.terminologia.grupo().toLowerCase()}.`);
        return;
      }

      filas.push({ fila: numeroFila, correo, nombre_completo, rol, curso });
    });

    this.filasCarga.set(filas);
    this.erroresLectura.set(errores);
    input.value = '';
  }

  async procesarCargaMasiva(): Promise<void> {
    const filas = this.filasCarga();
    if (filas.length === 0 || this.procesandoCarga() || !this.passwordLoteValida()) return;

    const passwordLote = this.passwordLote();
    this.procesandoCarga.set(true);
    this.filasProcesadas.set(0);
    const resultados: ResultadoFilaCarga[] = [];

    for (const fila of filas) {
      try {
        const grupoId = fila.rol === 'miembro' ? this.resolverGrupoPorNombre(fila.curso) : null;
        const resultado = await this.administracion.crearUsuario({
          email: fila.correo,
          nombre_completo: fila.nombre_completo,
          rol: fila.rol as Extract<Rol, 'responsable' | 'miembro'>,
          grupo_id: grupoId,
          password: passwordLote
        });
        resultados.push({
          fila: fila.fila,
          correo: fila.correo,
          nombre_completo: fila.nombre_completo,
          estado: 'creado',
          detalle: resultado.password_temporal
        });
      } catch (err) {
        resultados.push({
          fila: fila.fila,
          correo: fila.correo,
          nombre_completo: fila.nombre_completo,
          estado: 'error',
          detalle: err instanceof Error ? err.message : 'No se pudo crear.'
        });
      }
      this.filasProcesadas.set(this.filasProcesadas() + 1);
    }

    this.resultadosCarga.set(resultados);
    this.procesandoCarga.set(false);
    this.filasCarga.set([]);

    const creados = resultados.filter((r) => r.estado === 'creado').length;
    this.toast.add({
      severity: creados === resultados.length ? 'success' : 'warn',
      summary: 'Carga masiva terminada',
      detail: `${creados} de ${resultados.length} usuarios creados.`
    });
    await this.cargarUsuarios(0);
  }

  descargarResultados(): void {
    const encabezado = 'fila,correo,nombre_completo,estado,contrasena_temporal_o_error';
    const filas = this.resultadosCarga().map(
      (r) => `${r.fila},${r.correo},"${r.nombre_completo}",${r.estado},"${r.detalle}"`
    );
    this.descargarCsv('resultado-carga-masiva.csv', [encabezado, ...filas].join('\n'));
  }

  private resolverGrupoPorNombre(nombre: string): string | null {
    const normalizado = nombre.trim().toLowerCase();
    return this.grupos().find((g) => g.nombre.trim().toLowerCase() === normalizado)?.id ?? null;
  }

  private descargarCsv(nombreArchivo: string, contenido: string): void {
    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(url);
  }
}
