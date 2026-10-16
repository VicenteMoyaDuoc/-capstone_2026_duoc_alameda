import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { esperarAuthListo } from './esperar-auth';

/** Protege /onboarding/institucion: solo para sesiones activas sin fila en `usuarios` todavía. */
export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await esperarAuthListo(auth);

  if (auth.sinPerfil()) {
    return true;
  }

  const usuario = auth.currentUser();

  if (!usuario) {
    return router.createUrlTree(['/login']);
  }

  return router.createUrlTree([auth.rutaSegunEstado(usuario)]);
};
