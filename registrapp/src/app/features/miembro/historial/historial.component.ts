import { Component, computed, inject, signal } from '@angular/core';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { calcularMetricas, type FilaDetalleAsistencia } from '../../../core/utils/metricas-asistencia';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [NavbarComponent],
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.scss'
})
export class HistorialComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly filas = signal<FilaDetalleAsistencia[]>([]);

  readonly metricas = computed(() => calcularMetricas(this.filas()));
  readonly filasOrdenadas = computed(() => [...this.filas()].sort((a, b) => b.inicio.localeCompare(a.inicio)));

  constructor() {
    this.cargar();
  }

  /** fila.fecha es una fecha pura ('yyyy-MM-dd', ya en America/Santiago según la vista); no pasar por
   *  Date/timeZone acá, porque un string sin hora se interpreta como medianoche UTC y se corre un día. */
  formatearFecha(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}-${mes}-${anio}`;
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
