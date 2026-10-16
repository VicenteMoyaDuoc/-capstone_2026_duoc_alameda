import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { esperarAuthListo } from './esperar-auth';

/** Protege /login, /registro, /recuperar, /restablecer: si ya hay sesión completa, redirige. */
export const soloInvitadoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await esperarAuthListo(auth);

  if (auth.sinPerfil()) {
    return router.createUrlTree(['/onboarding/institucion']);
  }

  const usuario = auth.currentUser();

  if (usuario) {
    return router.createUrlTree([auth.rutaSegunEstado(usuario)]);
  }

  return true;
};
