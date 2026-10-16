import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

type TipoInstitucion = 'educativa' | 'corporativa';

/** Traduce los conceptos genéricos del dominio según el tipo de institución (D-/sección 2.3). */
@Injectable({
  providedIn: 'root'
})
export class TerminologiaService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly tipo = signal<TipoInstitucion>('educativa');

  constructor() {
    effect(() => {
      const institucionId = this.auth.currentUser()?.institucion_id;
      if (institucionId) {
        this.cargarTipo(institucionId);
      }
    });
  }

  readonly grupo = computed(() => (this.tipo() === 'corporativa' ? 'Departamento' : 'Curso'));
  readonly grupos = computed(() => (this.tipo() === 'corporativa' ? 'Departamentos' : 'Cursos'));
  readonly responsable = computed(() => (this.tipo() === 'corporativa' ? 'Jefe de área' : 'Profesor'));
  readonly responsables = computed(() => (this.tipo() === 'corporativa' ? 'Jefes de área' : 'Profesores'));
  readonly miembro = computed(() => (this.tipo() === 'corporativa' ? 'Empleado' : 'Alumno'));
  readonly miembros = computed(() => (this.tipo() === 'corporativa' ? 'Empleados' : 'Alumnos'));
  readonly sesion = computed(() => (this.tipo() === 'corporativa' ? 'Jornada' : 'Clase'));
  readonly sesiones = computed(() => (this.tipo() === 'corporativa' ? 'Jornadas' : 'Clases'));

  /** Fase 4 (ampliación) — solo las instituciones educativas subdividen un curso en asignaturas. */
  readonly esEducativa = computed(() => this.tipo() === 'educativa');
  readonly asignatura = computed(() => 'Asignatura');
  readonly asignaturas = computed(() => 'Asignaturas');

  private async cargarTipo(institucionId: string): Promise<void> {
    const { data } = await this.supabase.from('instituciones').select('tipo').eq('id', institucionId).single();

    if (data) {
      this.tipo.set(data['tipo'] as TipoInstitucion);
    }
  }
}
