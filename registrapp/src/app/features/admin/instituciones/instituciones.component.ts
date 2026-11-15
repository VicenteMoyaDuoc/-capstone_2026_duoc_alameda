import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';
import { TerminologiaService } from '../../../core/services/terminologia.service';
import { UbicacionService, UbicacionError, SEDE_ALAMEDA, type ModoGeo } from '../../../core/services/ubicacion.service';
import { MapaUbicacionComponent, type Punto } from '../../../shared/mapa-ubicacion/mapa-ubicacion.component';
import { glosaDe } from '../../../core/errores/catalogo-errores';

export { SEDE_ALAMEDA };

export const MODOS_GEO: { valor: ModoGeo; etiqueta: string }[] = [
  { valor: 'off', etiqueta: 'Desactivada' },
  { valor: 'proximidad', etiqueta: 'Proximidad: estar en la sede' },
  { valor: 'exacta', etiqueta: 'Exacta: estar en la sala' }
];

@Component({
  selector: 'app-instituciones',
  standalone: true,
  imports: [ReactiveFormsModule, InputTextModule, InputNumberModule, SelectModule, ButtonModule, MessageModule, MapaUbicacionComponent],
  templateUrl: './instituciones.component.html',
  styleUrl: './instituciones.component.scss'
})
export class InstitucionesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly ubicacion = inject(UbicacionService);
  readonly terminologia = inject(TerminologiaService);

  readonly modosGeo = MODOS_GEO;
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly localizando = signal(false);
  /** false si la base de datos aún no tiene las columnas de la migración 12. */
  readonly geoDisponible = signal(true);
  readonly mensaje = signal<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  readonly mensajeGeo = signal<{ tipo: 'success' | 'error'; texto: string } | null>(null);
  readonly tipoInstitucion = signal<'educativa' | 'corporativa'>('educativa');

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    tolerancia_min: [10, [Validators.required, Validators.min(0), Validators.max(120)]],
    duracion_sesion_min: [90, [Validators.required, Validators.min(5), Validators.max(480)]],
    qr_ttl_seg: [60, [Validators.required, Validators.min(20), Validators.max(300)]],
    geo_modo: ['off' as ModoGeo],
    sede_lat: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    sede_lng: [null as number | null, [Validators.min(-180), Validators.max(180)]],
    radio_proximidad_m: [300, [Validators.required, Validators.min(50), Validators.max(5000)]],
    radio_exacto_m: [40, [Validators.required, Validators.min(10), Validators.max(200)]]
  });

  get modoGeo(): ModoGeo {
    return this.form.controls.geo_modo.value;
  }

  usarSedeAlameda(): void {
    this.form.patchValue({ sede_lat: SEDE_ALAMEDA.lat, sede_lng: SEDE_ALAMEDA.lng });
    this.form.markAsDirty();
    this.mensajeGeo.set({ tipo: 'success', texto: 'Se cargó la ubicación de la sede Alameda (Av. España 8). Recuerda guardar los cambios.' });
  }

  /** Clic en el mapa: mueve la sede a ese punto. */
  elegirEnMapa(punto: Punto): void {
    this.form.patchValue({ sede_lat: punto.lat, sede_lng: punto.lng });
    this.form.markAsDirty();
    this.mensajeGeo.set({ tipo: 'success', texto: 'Sede movida al punto elegido en el mapa. Recuerda guardar los cambios.' });
  }

  /** Toma el GPS del dispositivo: conviene hacerlo parado en la entrada de la sede. */
  async usarMiUbicacion(): Promise<void> {
    if (this.localizando()) return;
    this.localizando.set(true);
    this.mensajeGeo.set(null);

    try {
      const lectura = await this.ubicacion.obtener('exacta');
      this.form.patchValue({ sede_lat: Number(lectura.lat.toFixed(7)), sede_lng: Number(lectura.lng.toFixed(7)) });
      this.form.markAsDirty();
      this.mensajeGeo.set({
        tipo: 'success',
        texto: `Ubicación tomada (precisión de ±${Math.round(lectura.precision)} m). Recuerda guardar los cambios.`
      });
    } catch (error) {
      this.mensajeGeo.set({ tipo: 'error', texto: error instanceof UbicacionError ? error.message : 'No se pudo obtener tu ubicación.' });
    } finally {
      this.localizando.set(false);
    }
  }

  constructor() {
    this.cargarInstitucion();
  }

  private async cargarInstitucion(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (!institucionId) {
      this.cargando.set(false);
      return;
    }

    const { data } = await this.supabase.from('instituciones').select('*').eq('id', institucionId).single();

    if (data) {
      this.geoDisponible.set('geo_modo' in data);
      this.tipoInstitucion.set(data['tipo']);
      this.form.patchValue({
        nombre: data['nombre'],
        tolerancia_min: data['tolerancia_min'],
        duracion_sesion_min: data['duracion_sesion_min'],
        qr_ttl_seg: data['qr_ttl_seg'],
        // si la migración 12 aún no se ejecutó, estas columnas no existen: se usan los valores por defecto
        geo_modo: data['geo_modo'] ?? 'off',
        sede_lat: data['sede_lat'] ?? null,
        sede_lng: data['sede_lng'] ?? null,
        radio_proximidad_m: data['radio_proximidad_m'] ?? 300,
        radio_exacto_m: data['radio_exacto_m'] ?? 40
      });
    }

    this.cargando.set(false);
  }

  async guardar(): Promise<void> {
    const institucionId = this.auth.currentUser()?.institucion_id;

    if (this.form.invalid || !institucionId || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    const { geo_modo, sede_lat, sede_lng, ...resto } = this.form.getRawValue();
    const { radio_proximidad_m, radio_exacto_m, ...generales } = resto;
    if (this.geoDisponible() && geo_modo === 'proximidad' && (sede_lat === null || sede_lng === null)) {
      this.mensaje.set({ tipo: 'error', texto: 'Para verificar la proximidad indica la ubicación de la sede (latitud y longitud).' });
      return;
    }
    if (this.geoDisponible() && (sede_lat === null) !== (sede_lng === null)) {
      this.mensaje.set({ tipo: 'error', texto: 'La ubicación de la sede necesita latitud y longitud.' });
      return;
    }

    this.guardando.set(true);
    this.mensaje.set(null);

    const cambios = this.geoDisponible()
      ? { ...generales, geo_modo, sede_lat, sede_lng, radio_proximidad_m, radio_exacto_m }
      : generales;
    const { error } = await this.supabase.from('instituciones').update(cambios).eq('id', institucionId);

    this.mensaje.set(
      error ? { tipo: 'error', texto: glosaDe(error) } : { tipo: 'success', texto: 'Institución actualizada.' }
    );
    this.guardando.set(false);
  }
}
