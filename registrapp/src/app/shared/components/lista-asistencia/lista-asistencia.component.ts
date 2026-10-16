import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AsistenciaRealtimeService, type AsistenciaRealtimeRow } from '../../../core/services/asistencia-realtime.service';
import type { SesionAsistencia } from '../../../core/services/asistencia.service';

export type ModoListaAsistencia = 'vivo' | 'estatico';
type OrdenRoster = 'nombre' | 'estado';

interface FilaRoster {
  usuario_id: string;
  nombre_completo: string;
  estado: 'puntual' | 'tardanza' | 'ausente';
  registrado_en: string | null;
  recienLlegado: boolean;
}

const PRIORIDAD_ESTADO: Record<FilaRoster['estado'], number> = { puntual: 0, tardanza: 1, ausente: 2 };
const DURACION_RESALTADO_MS = 3000;

/**
 * Lista en vivo de asistencia de un grupo para una sesión dada. La reutilizan
 * el panel de responsable (Fase 4.3) y la vista de administrador (Fase 4.4).
 * Un solo componente "vivo" a la vez por pestaña (ver AsistenciaRealtimeService).
 */
@Component({
  selector: 'app-lista-asistencia',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, SelectButtonModule],
  templateUrl: './lista-asistencia.component.html',
  styleUrl: './lista-asistencia.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListaAsistenciaComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly realtime = inject(AsistenciaRealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly grupoId = input.required<string>();
  readonly sesionId = input.required<string | null>();
  readonly modo = input<ModoListaAsistencia>('vivo');

  readonly cerrada = output<void>();

  readonly cargando = signal(true);
  readonly filas = signal<FilaRoster[]>([]);
  readonly ordenPor = signal<OrdenRoster>('nombre');
  readonly opcionesOrden = [
    { label: 'Nombre', value: 'nombre' as OrdenRoster },
    { label: 'Estado', value: 'estado' as OrdenRoster }
  ];

  readonly estadoConexion = this.realtime.estadoConexion;
  readonly esVivo = computed(() => this.modo() === 'vivo' && this.sesionId() !== null);

  readonly filasOrdenadas = computed(() => {
    const base = [...this.filas()];
    if (this.ordenPor() === 'nombre') {
      return base.sort((a, b) => a.nombre_completo.localeCompare(b.nombre_completo));
    }
    return base.sort((a, b) => PRIORIDAD_ESTADO[a.estado] - PRIORIDAD_ESTADO[b.estado] || a.nombre_completo.localeCompare(b.nombre_completo));
  });

  readonly presentes = computed(() => this.filas().filter((f) => f.estado !== 'ausente').length);
  readonly tardanzas = computed(() => this.filas().filter((f) => f.estado === 'tardanza').length);
  readonly total = computed(() => this.filas().length);

  private sesionIdSuscrito: string | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.realtime.desuscribir());
    effect(() => {
      // Dependencias leídas sincrónicamente para que el effect se re-ejecute si cambian.
      this.grupoId();
      this.sesionId();
      this.modo();
      this.reconfigurar();
    }, { allowSignalWrites: true });
  }

  private reconfigurar(): void {
    const sesionId = this.sesionId();
    const debeEstarVivo = this.esVivo();

    if (this.sesionIdSuscrito && (this.sesionIdSuscrito !== sesionId || !debeEstarVivo)) {
      this.realtime.desuscribir();
      this.sesionIdSuscrito = null;
    }

    if (!sesionId) {
      this.filas.set([]);
      this.cargando.set(false);
      return;
    }

    this.cargarCompleto();

    if (debeEstarVivo && this.sesionIdSuscrito !== sesionId) {
      this.sesionIdSuscrito = sesionId;
      this.realtime.suscribir(sesionId, {
        alSuscribir: () => this.cargarCompleto(),
        alInsertarAsistencia: (fila) => this.aplicarInsercion(fila),
        alActualizarSesion: (fila) => this.aplicarActualizacionSesion(fila),
        alRecargarCompleto: () => this.cargarCompleto()
      });
    }
  }

  private async cargarCompleto(): Promise<void> {
    const grupoId = this.grupoId();
    const sesionId = this.sesionId();
    if (!sesionId) return;

    this.cargando.set(true);

    const [{ data: miembros }, { data: asistencias }] = await Promise.all([
      this.supabase.from('usuarios').select('id, nombre_completo').eq('grupo_id', grupoId).eq('rol', 'miembro').eq('activo', true),
      this.supabase.from('asistencias').select('usuario_id, estado, registrado_en').eq('sesion_id', sesionId)
    ]);

    const asistenciasPorUsuario = new Map((asistencias ?? []).map((a) => [a['usuario_id'] as string, a]));

    const filas: FilaRoster[] = (miembros ?? []).map((m) => {
      const asistencia = asistenciasPorUsuario.get(m['id'] as string);
      return {
        usuario_id: m['id'] as string,
        nombre_completo: m['nombre_completo'] as string,
        estado: (asistencia?.['estado'] as FilaRoster['estado']) ?? 'ausente',
        registrado_en: (asistencia?.['registrado_en'] as string) ?? null,
        recienLlegado: false
      };
    });

    this.filas.set(filas);
    this.cargando.set(false);
  }

  private aplicarInsercion(fila: AsistenciaRealtimeRow): void {
    const actuales = this.filas();
    const indice = actuales.findIndex((f) => f.usuario_id === fila.usuario_id);

    if (indice === -1) {
      // Miembro no estaba en el roster cargado (por ejemplo, se agregó después); se recarga todo.
      this.cargarCompleto();
      return;
    }

    const copia = [...actuales];
    copia[indice] = { ...copia[indice], estado: fila.estado, registrado_en: fila.registrado_en, recienLlegado: true };
    this.filas.set(copia);

    setTimeout(() => {
      this.filas.set(this.filas().map((f) => (f.usuario_id === fila.usuario_id ? { ...f, recienLlegado: false } : f)));
    }, DURACION_RESALTADO_MS);
  }

  private aplicarActualizacionSesion(fila: SesionAsistencia): void {
    if (fila.cerrada_en) {
      this.realtime.desuscribir();
      this.sesionIdSuscrito = null;
      this.cerrada.emit();
    }
  }
}
