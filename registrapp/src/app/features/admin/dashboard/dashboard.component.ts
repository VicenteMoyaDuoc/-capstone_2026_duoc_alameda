import { Component, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  readonly cargando = signal(true);
  readonly totalGrupos = signal(0);
  readonly totalMiembros = signal(0);

  constructor() {
    this.cargarConteos();
  }

  private async cargarConteos(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    const [grupos, miembros] = await Promise.all([
      this.supabase.from('grupos').select('id', { count: 'exact', head: true }).eq('institucion_id', institucionId),
      this.supabase
        .from('usuarios')
        .select('id', { count: 'exact', head: true })
        .eq('institucion_id', institucionId)
        .eq('rol', 'miembro')
    ]);

    this.totalGrupos.set(grupos.count ?? 0);
    this.totalMiembros.set(miembros.count ?? 0);
    this.cargando.set(false);
  }
}
