import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageModule } from 'primeng/message';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { ListaAsistenciaComponent } from '../../../shared/components/lista-asistencia/lista-asistencia.component';
import { rangoDiaSantiagoUtc, hoyEnSantiago } from '../../../core/utils/zona-horaria';

interface GrupoOpcion {
  id: string;
  nombre: string;
}

interface SesionDelDia {
  id: string;
  inicio: string;
  cerrada_en: string | null;
}

@Component({
  selector: 'app-admin-asistencia',
  standalone: true,
  imports: [FormsModule, SelectModule, DatePickerModule, MessageModule, ListaAsistenciaComponent],
  templateUrl: './asistencia.component.html',
  styleUrl: './asistencia.component.scss'
})
export class AdminAsistenciaComponent {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  readonly terminologia = inject(TerminologiaService);

  readonly cargando = signal(true);
  readonly grupos = signal<GrupoOpcion[]>([]);
  readonly grupoSeleccionadoId = signal<string | null>(null);
  readonly fechaSeleccionada = signal<Date>(hoyEnSantiago());

  readonly cargandoSesiones = signal(false);
  readonly sesionesDelDia = signal<SesionDelDia[]>([]);

  constructor() {
    this.cargarGrupos();
  }

  onFiltroCambiado(): void {
    this.cargarSesionesDelDia();
  }

  formatearHoraInicio(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
  }

  private async cargarGrupos(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    const { data } = await this.supabase
      .from('grupos')
      .select('id, nombre')
      .eq('institucion_id', institucionId)
      .eq('activo', true)
      .order('nombre');

    const grupos = (data as GrupoOpcion[]) ?? [];
    this.grupos.set(grupos);

    if (grupos.length > 0) {
      this.grupoSeleccionadoId.set(grupos[0].id);
      await this.cargarSesionesDelDia();
    }

    this.cargando.set(false);
  }

  private async cargarSesionesDelDia(): Promise<void> {
    const grupoId = this.grupoSeleccionadoId();

    if (!grupoId) {
      this.sesionesDelDia.set([]);
      return;
    }

    this.cargandoSesiones.set(true);

    const { desde, hasta } = rangoDiaSantiagoUtc(this.fechaSeleccionada());

    const { data } = await this.supabase
      .from('sesiones_asistencia')
      .select('id, inicio, cerrada_en')
      .eq('grupo_id', grupoId)
      .gte('inicio', desde)
      .lt('inicio', hasta)
      .order('inicio', { ascending: false });

    this.sesionesDelDia.set((data as SesionDelDia[]) ?? []);
    this.cargandoSesiones.set(false);
  }
}
