import { Component, inject, signal } from '@angular/core';
import { MessageModule } from 'primeng/message';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [MessageModule, NavbarComponent],
  templateUrl: './inicio.component.html',
  styleUrl: './inicio.component.scss'
})
export class InicioComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  readonly cargando = signal(true);
  readonly nombreGrupo = signal<string | null>(null);

  constructor() {
    this.cargarGrupo();
  }

  get usuario() {
    return this.auth.currentUser();
  }

  private async cargarGrupo(): Promise<void> {
    const grupoId = this.usuario?.grupo_id;

    if (!grupoId) {
      this.cargando.set(false);
      return;
    }

    const { data } = await this.supabase.from('grupos').select('nombre').eq('id', grupoId).single();
    this.nombreGrupo.set(data?.['nombre'] ?? null);
    this.cargando.set(false);
  }
}
