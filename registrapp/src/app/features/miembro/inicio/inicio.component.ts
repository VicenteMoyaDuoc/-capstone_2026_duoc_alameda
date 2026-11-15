import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MarcoMovilComponent } from '../../../shared/components/marco-movil/marco-movil.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { calcularMetricas, nivelAsistencia, type FilaDetalleAsistencia } from '../../../core/utils/metricas-asistencia';

const META = 85;

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [RouterLink, MarcoMovilComponent],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.scss'
})
export class InicioComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly nombreGrupo = signal<string | null>(null);
  readonly filas = signal<FilaDetalleAsistencia[]>([]);

  readonly meta = META;
  readonly metricas = computed(() => calcularMetricas(this.filas()));
  readonly ausencias = computed(() => this.filas().filter((f) => f.estado === 'ausente').length);
  readonly nivel = computed(() => nivelAsistencia(this.metricas().porcentajeAsistencia));
  readonly ultimos = computed(() => [...this.filas()].sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, 4));

  constructor() {
    this.cargar();
  }

  get usuario() {
    return this.auth.currentUser();
  }

  get primerNombre(): string {
    return this.usuario?.nombre_completo.split(' ')[0] ?? '';
  }

  /** 'yyyy-MM-dd' → "mié 5 nov". Se arma con partes para no correr el día por zona horaria. */
  fechaCorta(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Date(anio, mes - 1, dia).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
  }

  hora(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
  }

  private async cargar(): Promise<void> {
    const usuario = this.usuario;
    if (!usuario) {
      this.cargando.set(false);
      return;
    }

    const [grupo, detalle] = await Promise.all([
      usuario.grupo_id ? this.supabase.from('grupos').select('nombre').eq('id', usuario.grupo_id).single() : Promise.resolve({ data: null }),
      // RLS limita v_asistencia_detalle a las propias filas de un miembro.
      this.supabase.from('v_asistencia_detalle').select('*').eq('usuario_id', usuario.id)
    ]);

    this.nombreGrupo.set((grupo.data as { nombre?: string } | null)?.nombre ?? null);
    this.filas.set((detalle.data as FilaDetalleAsistencia[]) ?? []);
    this.cargando.set(false);
  }
}
