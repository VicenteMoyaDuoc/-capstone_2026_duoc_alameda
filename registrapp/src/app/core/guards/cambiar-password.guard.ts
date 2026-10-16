import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { esperarAuthListo } from './esperar-auth';

/** Protege /cambiar-password: solo si el usuario tiene `debe_cambiar_password = true`. */
export const cambiarPasswordGuard: CanActivateFn = async () => {
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

  if (!usuario.debe_cambiar_password) {
    return router.createUrlTree([auth.rutaSegunRol(usuario.rol)]);
  }

  return true;
};
