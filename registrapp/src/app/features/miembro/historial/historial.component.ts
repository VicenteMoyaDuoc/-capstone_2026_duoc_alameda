import { Component, computed, inject, signal } from '@angular/core';
import { MarcoMovilComponent } from '../../../shared/components/marco-movil/marco-movil.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { calcularMetricas, type EstadoAsistencia, type FilaDetalleAsistencia } from '../../../core/utils/metricas-asistencia';

type Filtro = 'todos' | EstadoAsistencia;

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [MarcoMovilComponent],
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.scss'
})
export class HistorialComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly filas = signal<FilaDetalleAsistencia[]>([]);
  readonly filtro = signal<Filtro>('todos');

  readonly metricas = computed(() => calcularMetricas(this.filas()));
  readonly ausencias = computed(() => this.filas().filter((f) => f.estado === 'ausente').length);
  readonly filasOrdenadas = computed(() => {
    const filtro = this.filtro();
    return [...this.filas()]
      .filter((f) => filtro === 'todos' || f.estado === filtro)
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
  });

  readonly filtros: { id: Filtro; nombre: string }[] = [
    { id: 'todos', nombre: 'Todos' },
    { id: 'puntual', nombre: 'A tiempo' },
    { id: 'tardanza', nombre: 'Tardanzas' },
    { id: 'ausente', nombre: 'Ausencias' }
  ];

  constructor() {
    this.cargar();
  }

  /** fila.fecha es una fecha pura ('yyyy-MM-dd', ya en America/Santiago según la vista); no pasar por
   *  Date/timeZone acá, porque un string sin hora se interpreta como medianoche UTC y se corre un día. */
  formatearFecha(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
  }

  formatearHora(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
  }

  private async cargar(): Promise<void> {
    const usuario = this.auth.currentUser();
    if (!usuario) {
      this.cargando.set(false);
      return;
    }

    // RLS limita v_asistencia_detalle a las propias filas de un miembro (Fase 5.5).
    const { data } = await this.supabase.from('v_asistencia_detalle').select('*').eq('usuario_id', usuario.id);

    this.filas.set((data as FilaDetalleAsistencia[]) ?? []);
    this.cargando.set(false);
  }
}
