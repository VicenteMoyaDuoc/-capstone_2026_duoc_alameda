import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { definePreset } from '@primeng/themes';

import { routes } from './app.routes';

const RegistrappPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fbffe8',
      100: '#f4ffc4',
      200: '#e9ff8f',
      300: '#d9fa5c',
      400: '#c6f135',
      500: '#a8d61e',
      600: '#87ad16',
      700: '#688516',
      800: '#556918',
      900: '#485819',
      950: '#26310a'
    }
  }
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: RegistrappPreset,
        options: {
          darkModeSelector: false
        }
      }
    })
  ]
};
