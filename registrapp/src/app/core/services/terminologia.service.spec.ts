import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { TerminologiaService } from './terminologia.service';
import { crearAuthFake, usuarioDePrueba, type AuthFake } from '../testing/auth-fake';

function crearSupabaseFake(tipo: 'educativa' | 'corporativa') {
  return {
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { tipo } })
          })
        })
      })
    }
  };
}

function configurar(tipo: 'educativa' | 'corporativa'): { servicio: TerminologiaService; auth: AuthFake } {
  const auth = crearAuthFake();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: SupabaseService, useValue: crearSupabaseFake(tipo) }
    ]
  });
  return { servicio: TestBed.inject(TerminologiaService), auth };
}

describe('TerminologiaService', () => {
  it('usa el vocabulario educativo por defecto antes de conocer la institución', () => {
    const { servicio } = configurar('educativa');
    expect(servicio.grupo()).toBe('Curso');
    expect(servicio.responsable()).toBe('Profesor');
    expect(servicio.miembro()).toBe('Alumno');
    expect(servicio.sesion()).toBe('Clase');
  });

  it('cambia a vocabulario corporativo cuando la institución del usuario es de tipo corporativa', fakeAsync(() => {
    const { servicio, auth } = configurar('corporativa');

    auth.currentUser.set(usuarioDePrueba({ institucion_id: 'inst-corp' }));
    tick();

    expect(servicio.grupo()).toBe('Departamento');
    expect(servicio.grupos()).toBe('Departamentos');
    expect(servicio.responsable()).toBe('Jefe de área');
    expect(servicio.responsables()).toBe('Jefes de área');
    expect(servicio.miembro()).toBe('Empleado');
    expect(servicio.miembros()).toBe('Empleados');
    expect(servicio.sesion()).toBe('Jornada');
    expect(servicio.sesiones()).toBe('Jornadas');
  }));

  it('se mantiene en vocabulario educativo cuando la institución es de tipo educativa', fakeAsync(() => {
    const { servicio, auth } = configurar('educativa');

    auth.currentUser.set(usuarioDePrueba({ institucion_id: 'inst-edu' }));
    tick();

    expect(servicio.grupo()).toBe('Curso');
    expect(servicio.miembros()).toBe('Alumnos');
  }));
});
