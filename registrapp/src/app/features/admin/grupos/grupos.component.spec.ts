import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';

import { GruposComponent } from './grupos.component';

describe('GruposComponent', () => {
  let component: GruposComponent;
  let fixture: ComponentFixture<GruposComponent>;

  // Defecto encontrado en Fase 6.1: el componente inyecta ConfirmationService/MessageService
  // (confirmar archivado, toasts) y el schematic por defecto no los provee.
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GruposComponent],
      providers: [provideRouter([]), MessageService, ConfirmationService]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GruposComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
