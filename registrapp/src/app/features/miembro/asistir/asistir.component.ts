import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AsistenciaService, AsistenciaError } from '../../../core/services/asistencia.service';
import { esperarAuthListo } from '../../../core/guards/esperar-auth';
import { guardarTokenPendiente, tomarTokenPendiente } from '../../../core/utils/asistir-pendiente';
import { formatearHora } from '../../../core/utils/reloj-servidor';
import { extraerTokenDeHash } from '../../../core/utils/token-qr';
import { ResultadoAsistenciaComponent, type ResultadoAsistenciaVista } from '../../../shared/components/resultado-asistencia/resultado-asistencia.component';

/** Fase 3.4 — Vía A: el celular abre esta ruta al leer el QR con la cámara nativa. */
@Component({
  selector: 'app-asistir',
  standalone: true,
  imports: [ResultadoAsistenciaComponent],
  templateUrl: './asistir.component.html',
  styleUrl: './asistir.component.scss'
})
export class AsistirComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly asistenciaService = inject(AsistenciaService);

  readonly resultado = signal<ResultadoAsistenciaVista>({ tipo: 'cargando' });

  constructor() {
    this.iniciar();
  }

  private async iniciar(): Promise<void> {
    const tokenDesdeHash = this.extraerYLimpiarHash();
    if (tokenDesdeHash) {
      guardarTokenPendiente(tokenDesdeHash);
    }

    await esperarAuthListo(this.auth);

    if (!this.auth.currentUser()) {
      if (!tokenDesdeHash) {
        this.resultado.set({ tipo: 'error', mensaje: 'No se encontró un código QR para procesar.' });
        return;
      }
      await this.router.navigateByUrl('/login');
      return;
    }

    const token = tomarTokenPendiente();
    if (!token) {
      this.resultado.set({ tipo: 'error', mensaje: 'No se encontró un código QR para procesar.' });
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

  /** Lee el token del fragmento (#t=...) y lo borra de la URL (nunca debe quedar en el historial). */
  private extraerYLimpiarHash(): string | null {
    const hash = window.location.hash;
    const token = extraerTokenDeHash(hash);

    if (hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    return token;
  }
}
