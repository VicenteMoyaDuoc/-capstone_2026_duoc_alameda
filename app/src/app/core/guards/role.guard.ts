import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { Rol } from '../models/models';

export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.cargando()) {
    await firstValueFrom(toObservable(auth.cargando).pipe(filter((cargando) => !cargando), take(1)));
  }

  const usuario = auth.currentUser();
  const rolRequerido = route.data['rol'] as Rol | undefined;

  if (!usuario) {
    return router.createUrlTree(['/login']);
  }

  if (rolRequerido && usuario.rol !== rolRequerido) {
    return router.createUrlTree([auth.rutaSegunRol(usuario.rol)]);
  }

  return true;
};
