import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import type * as Leaflet from 'leaflet';
import { environment } from '../../../environments/environment';
import { SEDE_ALAMEDA } from '../../core/services/ubicacion.service';

export interface Punto {
  lat: number;
  lng: number;
}

/** Dibuja la sede (punto + círculo del radio) y avisa dónde hace clic el usuario. */
interface Adaptador {
  dibujar(sede: Punto | null, radioM: number | null, yo: Punto | null): void;
  destruir(): void;
}

type Proveedor = 'google' | 'osm';

const COLOR = '#1d4ed8';
const COLOR_YO = '#16a34a';

// ───────────────────────────── Google Maps (oficial) ─────────────────────────────

let googleListo: Promise<void> | null = null;

function cargarGoogleMaps(clave: string): Promise<void> {
  googleListo ??= new Promise<void>((resolve, reject) => {
    // Google llama a esta función cuando la API ya está lista (con loading=async, el evento onload llega antes).
    (window as Window & { rpGoogleMapsListo?: () => void }).rpGoogleMapsListo = () => resolve();
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(clave)}&loading=async&callback=rpGoogleMapsListo&v=weekly&language=es&region=CL`;
    script.async = true;
    script.onerror = () => {
      googleListo = null;
      script.remove();
      reject(new Error('No se pudo cargar Google Maps.'));
    };
    document.head.appendChild(script);
  });
  return googleListo;
}

async function crearGoogle(el: HTMLElement, alElegir: ((p: Punto) => void) | null): Promise<Adaptador> {
  const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
  const mapa = new Map(el, {
    center: SEDE_ALAMEDA,
    zoom: 16,
    mapTypeControl: true, // Mapa / Satélite
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false
  });
  if (alElegir) {
    mapa.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) alElegir({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
  }

  let marcador: google.maps.Marker | null = null;
  let circulo: google.maps.Circle | null = null;
  let marcadorYo: google.maps.Marker | null = null;
  let linea: google.maps.Polyline | null = null;

  return {
    dibujar(sede, radioM, yo) {
      marcador?.setMap(null);
      circulo?.setMap(null);
      marcadorYo?.setMap(null);
      linea?.setMap(null);
      marcador = circulo = marcadorYo = linea = null;
      if (yo) {
        marcadorYo = new google.maps.Marker({
          map: mapa,
          position: yo,
          title: 'Tú',
          zIndex: 10,
          label: { text: 'Tú', color: '#14532d', fontWeight: '700', fontSize: '13px' },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: COLOR_YO,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
            labelOrigin: new google.maps.Point(0, 3)
          }
        });
      }
      if (!sede) {
        mapa.setCenter(yo ?? SEDE_ALAMEDA);
        mapa.setZoom(yo ? 17 : 16);
        return;
      }
      marcador = new google.maps.Marker({ map: mapa, position: sede, title: 'Sede' });
      if (yo) {
        linea = new google.maps.Polyline({
          map: mapa,
          path: [yo, sede],
          strokeOpacity: 0,
          clickable: false,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeColor: '#475569', scale: 3 }, offset: '0', repeat: '12px' }]
        });
      }
      if (radioM) {
        circulo = new google.maps.Circle({
          map: mapa,
          center: sede,
          radius: radioM,
          strokeColor: COLOR,
          strokeWeight: 2,
          fillColor: COLOR,
          fillOpacity: 0.12,
          clickable: false
        });
        const limites = circulo.getBounds();
        if (limites) {
          if (yo) limites.extend(yo);
          mapa.fitBounds(limites, 48);
        }
      } else {
        mapa.setCenter(sede);
        mapa.setZoom(17);
      }
    },
    destruir() {
      google.maps.event.clearInstanceListeners(mapa);
      marcador?.setMap(null);
      circulo?.setMap(null);
      marcadorYo?.setMap(null);
      el.innerHTML = '';
    }
  };
}

// ───────────────────────────── OpenStreetMap (respaldo sin clave) ─────────────────────────────

async function crearOsm(el: HTMLElement, alElegir: ((p: Punto) => void) | null): Promise<Adaptador> {
  const L = await import('leaflet');
  const mapa = L.map(el).setView([SEDE_ALAMEDA.lat, SEDE_ALAMEDA.lng], 16);
  const calles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
  }).addTo(mapa);
  // Imágenes satelitales de Esri (sin clave); se elige con el selector de capas del mapa.
  const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics'
  });
  L.control.layers({ Mapa: calles, Satélite: satelite }, undefined, { position: 'topright', collapsed: false }).addTo(mapa);
  if (alElegir) mapa.on('click', (e: Leaflet.LeafletMouseEvent) => alElegir({ lat: e.latlng.lat, lng: e.latlng.lng }));

  const capa = L.layerGroup().addTo(mapa);
  const observador = new ResizeObserver(() => mapa.invalidateSize());
  observador.observe(el);

  return {
    dibujar(sede, radioM, yo) {
      capa.clearLayers();
      if (yo) {
        L.circleMarker([yo.lat, yo.lng], { radius: 8, color: '#ffffff', weight: 3, fillColor: COLOR_YO, fillOpacity: 1 }).bindTooltip('Tú', { permanent: true, direction: 'bottom', offset: [0, 6] }).addTo(capa);
      }
      if (!sede) {
        if (yo) mapa.setView([yo.lat, yo.lng], 17);
        else mapa.setView([SEDE_ALAMEDA.lat, SEDE_ALAMEDA.lng], 16);
        return;
      }
      L.circleMarker([sede.lat, sede.lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: COLOR, fillOpacity: 1 }).bindTooltip('Sede', { permanent: true, direction: 'top', offset: [0, -6] }).addTo(capa);
      if (yo) L.polyline([[yo.lat, yo.lng], [sede.lat, sede.lng]], { color: '#475569', weight: 2, dashArray: '6 6', opacity: 0.8 }).addTo(capa);
      if (radioM) {
        const circulo = L.circle([sede.lat, sede.lng], { radius: radioM, color: COLOR, weight: 2, fillColor: COLOR, fillOpacity: 0.12 }).addTo(capa);
        const limites = circulo.getBounds();
        if (yo) limites.extend([yo.lat, yo.lng]);
        mapa.fitBounds(limites, { padding: [36, 36], maxZoom: 18 });
      } else {
        mapa.setView([sede.lat, sede.lng], 17);
      }
    },
    destruir() {
      observador.disconnect();
      mapa.remove();
    }
  };
}

type VentanaGoogle = Window & { gm_authFailure?: () => void };

/**
 * Mapa de la sede. Usa Google Maps si `environment.googleMapsApiKey` está configurada (o si la clave falla,
 * vuelve a OpenStreetMap para que el mapa nunca quede en blanco).
 */
@Component({
  selector: 'app-mapa-ubicacion',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #contenedor class="mapa" role="img" [attr.aria-label]="'Mapa de la sede'" [attr.data-proveedor]="proveedor()" [style.height.px]="alto()"></div>`,
  styles: `
    :host {
      display: block;
    }
    .mapa {
      height: 320px;
      width: 100%;
      border: 1px solid var(--rp-border);
      background: var(--rp-bg);
    }
  `
})
export class MapaUbicacionComponent implements AfterViewInit, OnDestroy {
  private readonly zona = inject(NgZone);
  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');

  readonly lat = input<number | null>(null);
  readonly lng = input<number | null>(null);
  /** Radio del círculo en metros (opcional). */
  readonly radio = input<number | null>(null);
  /** Posición de la persona (punto verde "Tú"), opcional. */
  readonly yo = input<Punto | null>(null);
  /** Alto del mapa en píxeles. */
  readonly alto = input(320);
  /** Si es true, el mapa solo se muestra (el clic no mueve la sede). */
  readonly soloLectura = input(false);
  /** Se emite al hacer clic en el mapa. */
  readonly elegida = output<Punto>();

  readonly proveedor = signal<Proveedor | null>(null);
  private adaptador: Adaptador | null = null;
  private destruido = false;

  constructor() {
    effect(() => {
      this.lat();
      this.lng();
      this.radio();
      this.yo();
      this.dibujar();
    });
  }

  ngAfterViewInit(): void {
    void this.zona.runOutsideAngular(() => this.iniciar());
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.adaptador?.destruir();
    this.adaptador = null;
    const ventana = window as VentanaGoogle;
    delete ventana.gm_authFailure;
  }

  private readonly alElegir = (p: Punto): void => {
    this.zona.run(() => this.elegida.emit({ lat: Number(p.lat.toFixed(7)), lng: Number(p.lng.toFixed(7)) }));
  };

  private async iniciar(): Promise<void> {
    const el = this.contenedor().nativeElement;
    const clave = environment.googleMapsApiKey;

    if (clave) {
      try {
        // Si Google rechaza la clave (restricciones, facturación), avisa con esta función global.
        (window as VentanaGoogle).gm_authFailure = () => {
          console.warn('[Mapa] Google rechazó la clave (restricciones, API no habilitada o facturación inactiva): se usa OpenStreetMap.');
          void this.cambiarAOsm();
        };
        await cargarGoogleMaps(clave);
        if (this.destruido) return;
        this.adaptador = await crearGoogle(el, this.soloLectura() ? null : this.alElegir);
        this.proveedor.set('google');
        this.dibujar();
        return;
      } catch (error) {
        console.warn('[Mapa] No se pudo iniciar Google Maps, se usa OpenStreetMap:', error);
      }
    }
    await this.cambiarAOsm();
  }

  private async cambiarAOsm(): Promise<void> {
    if (this.destruido || this.proveedor() === 'osm') return;
    this.adaptador?.destruir();
    this.adaptador = null;
    this.adaptador = await crearOsm(this.contenedor().nativeElement, this.soloLectura() ? null : this.alElegir);
    if (this.destruido) {
      this.adaptador.destruir();
      this.adaptador = null;
      return;
    }
    this.proveedor.set('osm');
    this.dibujar();
  }

  private dibujar(): void {
    const lat = this.lat();
    const lng = this.lng();
    const sede = lat !== null && lng !== null ? { lat, lng } : null;
    this.adaptador?.dibujar(sede, this.radio(), this.yo());
  }
}
