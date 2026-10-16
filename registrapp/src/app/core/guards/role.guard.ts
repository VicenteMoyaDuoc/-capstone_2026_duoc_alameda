import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Rol } from '../models/models';
import { esperarAuthListo } from './esperar-auth';

export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await esperarAuthListo(auth);

  if (auth.sinPerfil()) {
    return router.createUrlTree(['/onboarding/institucion']);
  }

  const usuario = auth.currentUser();

  if (!usuario) {
    return router.createUrlTree(['/login']);
  }

  if (usuario.debe_cambiar_password) {
    return router.createUrlTree(['/cambiar-password']);
  }

  const rolRequerido = route.data['rol'] as Rol | undefined;

  if (rolRequerido && usuario.rol !== rolRequerido) {
    return router.createUrlTree([auth.rutaSegunRol(usuario.rol)]);
  }

  return true;
};
