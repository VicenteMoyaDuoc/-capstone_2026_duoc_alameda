import { Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { NavbarComponent } from '../../../shared/components/navbar/navbar.component';
import {
  ResultadoAsistenciaComponent,
  type ResultadoAsistenciaVista
} from '../../../shared/components/resultado-asistencia/resultado-asistencia.component';
import { AsistenciaService, AsistenciaError } from '../../../core/services/asistencia.service';
import { formatearHora } from '../../../core/utils/reloj-servidor';
import { extraerTokenDeUrlPropia } from '../../../core/utils/token-qr';

type Estado = 'inicial' | 'escaneando' | 'permiso_denegado' | 'mostrando_resultado';

/** Fase 3.4 — Vía B: escáner dentro de la app con @zxing/browser. */
@Component({
  selector: 'app-escanear',
  standalone: true,
  imports: [NavbarComponent, ResultadoAsistenciaComponent, ButtonModule, MessageModule],
  templateUrl: './escanear.component.html',
  styleUrl: './escanear.component.scss'
})
export class EscanearComponent {
  private readonly asistenciaService = inject(AsistenciaService);
  private readonly destroyRef = inject(DestroyRef);

  readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly estado = signal<Estado>('inicial');
  readonly resultado = signal<ResultadoAsistenciaVista>({ tipo: 'cargando' });
  readonly soportaCamara = 'mediaDevices' in navigator && window.isSecureContext;

  private controles: IScannerControls | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.controles?.stop());
  }

  async iniciarEscaneo(): Promise<void> {
    this.estado.set('escaneando');

    // Angular aún no pintó el <video>; se espera un ciclo para que viewChild lo encuentre.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const videoEl = this.video()?.nativeElement;
    if (!videoEl) {
      this.estado.set('permiso_denegado');
      return;
    }

    const lector = new BrowserQRCodeReader();

    try {
      this.controles = await lector.decodeFromConstraints({ video: { facingMode: 'environment' } }, videoEl, (resultado) => {
        if (resultado) {
          this.controles?.stop();
          this.procesarTextoLeido(resultado.getText());
        }
      });
    } catch {
      this.estado.set('permiso_denegado');
    }
  }

  reintentar(): void {
    this.iniciarEscaneo();
  }

  private async procesarTextoLeido(texto: string): Promise<void> {
    this.resultado.set({ tipo: 'cargando' });
    this.estado.set('mostrando_resultado');

    const token = extraerTokenDeUrlPropia(texto, window.location.origin);
    if (!token) {
      this.resultado.set({ tipo: 'error', mensaje: 'Este código QR no corresponde a Registrapp.' });
      return;
    }

    try {
      const registro = await this.asistenciaService.registrarAsistencia(token);
      this.resultado.set({
        tipo: 'exito',
        estado: registro.estado,
        horaTexto: formatearHora(registro.registrado_en),
        grupoNombre: registro.grupo?.nombre,
        asignaturaNombre: registro.asignatura?.nombre
      });
    } catch (error) {
      const mensaje = error instanceof AsistenciaError ? error.message : 'Ocurrió un error. Intenta nuevamente.';
      this.resultado.set({ tipo: 'error', mensaje });
    }
  }
}
