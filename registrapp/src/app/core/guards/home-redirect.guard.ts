import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const homeRedirectGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.cargando()) {
    await firstValueFrom(toObservable(auth.cargando).pipe(filter((cargando) => !cargando), take(1)));
  }

  const usuario = auth.currentUser();
  const destino = usuario ? auth.rutaSegunRol(usuario.rol) : '/login';
  return router.createUrlTree([destino]);
};
