import { Component, inject, signal } from '@angular/core';
import { MessageModule } from 'primeng/message';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { Usuario } from '../../../core/models/models';

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [MessageModule, NavbarComponent],
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.scss'
})
export class PanelComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  readonly cargando = signal(true);
  readonly nombreGrupo = signal<string | null>(null);
  readonly miembros = signal<Usuario[]>([]);

  constructor() {
    this.cargarGrupo();
  }

  private async cargarGrupo(): Promise<void> {
    const usuario = this.auth.currentUser();

    if (!usuario?.grupo_id) {
      this.cargando.set(false);
      return;
    }

    const [grupo, miembros] = await Promise.all([
      this.supabase.from('grupos').select('nombre').eq('id', usuario.grupo_id).single(),
      this.supabase.from('usuarios').select('*').eq('grupo_id', usuario.grupo_id).eq('rol', 'miembro').order('nombre_completo')
    ]);

    this.nombreGrupo.set(grupo.data?.['nombre'] ?? null);
    this.miembros.set((miembros.data as Usuario[]) ?? []);
    this.cargando.set(false);
  }
}
