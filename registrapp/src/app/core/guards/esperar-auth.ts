import { toObservable } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/** Espera a que AuthService termine de resolver la sesión inicial. */
export async function esperarAuthListo(auth: AuthService): Promise<void> {
  if (auth.cargando()) {
    await firstValueFrom(toObservable(auth.cargando).pipe(filter((cargando) => !cargando), take(1)));
  }
}
