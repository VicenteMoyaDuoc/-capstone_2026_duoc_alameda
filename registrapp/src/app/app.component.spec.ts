import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  // Defecto encontrado en Fase 6.1: faltaban MessageService/ConfirmationService
  // (los necesitan <p-toast> y <p-confirmdialog> del shell de la app).
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), MessageService, ConfirmationService]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
