import type { PestanaMovil } from '../../shared/components/marco-movil/marco-movil.component';

/** Pestañas del profesor (o jefe de área): sus clases y sus solicitudes al administrador. */
export function pestanasResponsable(): PestanaMovil[] {
  return [
    { ruta: '/responsable', icono: 'pi-qrcode', texto: 'Clases', exacta: true },
    { ruta: '/responsable/solicitudes', icono: 'pi-send', texto: 'Solicitudes' }
  ];
}
