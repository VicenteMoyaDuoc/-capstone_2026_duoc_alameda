import { Routes } from '@angular/router';
import { roleGuard } from './core/guards/role.guard';
import { homeRedirectGuard } from './core/guards/home-redirect.guard';
import { onboardingGuard } from './core/guards/onboarding.guard';
import { cambiarPasswordGuard } from './core/guards/cambiar-password.guard';
import { soloInvitadoGuard } from './core/guards/solo-invitado.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [homeRedirectGuard],
    children: []
  },
  {
    path: 'login',
    canActivate: [soloInvitadoGuard],
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'registro',
    canActivate: [soloInvitadoGuard],
    loadComponent: () => import('./features/auth/registro/registro.component').then((m) => m.RegistroComponent)
  },
  {
    path: 'recuperar',
    canActivate: [soloInvitadoGuard],
    loadComponent: () => import('./features/auth/recuperar/recuperar.component').then((m) => m.RecuperarComponent)
  },
  {
    path: 'restablecer',
    loadComponent: () => import('./features/auth/restablecer/restablecer.component').then((m) => m.RestablecerComponent)
  },
  {
    path: 'cambiar-password',
    canActivate: [cambiarPasswordGuard],
    loadComponent: () =>
      import('./features/auth/cambiar-password/cambiar-password.component').then((m) => m.CambiarPasswordComponent)
  },
  {
    path: 'onboarding/institucion',
    canActivate: [onboardingGuard],
    loadComponent: () =>
      import('./features/onboarding/institucion/institucion.component').then((m) => m.OnboardingInstitucionComponent)
  },
  {
    path: 'admin',
    canActivate: [roleGuard],
    data: { rol: 'administrador' },
    loadComponent: () =>
      import('./features/admin/admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/admin/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'institucion',
        loadComponent: () =>
          import('./features/admin/instituciones/instituciones.component').then((m) => m.InstitucionesComponent)
      },
      {
        path: 'grupos',
        loadComponent: () => import('./features/admin/grupos/grupos.component').then((m) => m.GruposComponent)
      },
      {
        path: 'usuarios',
        loadComponent: () => import('./features/admin/usuarios/usuarios.component').then((m) => m.UsuariosComponent)
      },
      {
        path: 'asistencia',
        loadComponent: () => import('./features/admin/asistencia/asistencia.component').then((m) => m.AdminAsistenciaComponent)
      },
      {
        path: 'reportes',
        loadComponent: () => import('./features/admin/reportes/reportes.component').then((m) => m.ReportesComponent)
      }
    ]
  },
  {
    path: 'responsable',
    canActivate: [roleGuard],
    data: { rol: 'responsable' },
    loadComponent: () => import('./features/responsable/panel/panel.component').then((m) => m.PanelComponent)
  },
  {
    path: 'asistir',
    loadComponent: () => import('./features/miembro/asistir/asistir.component').then((m) => m.AsistirComponent)
  },
  {
    path: 'miembro',
    canActivate: [roleGuard],
    data: { rol: 'miembro' },
    loadComponent: () => import('./features/miembro/inicio/inicio.component').then((m) => m.InicioComponent)
  },
  {
    path: 'miembro/escanear',
    canActivate: [roleGuard],
    data: { rol: 'miembro' },
    loadComponent: () => import('./features/miembro/escanear/escanear.component').then((m) => m.EscanearComponent)
  },
  {
    path: 'miembro/historial',
    canActivate: [roleGuard],
    data: { rol: 'miembro' },
    loadComponent: () => import('./features/miembro/historial/historial.component').then((m) => m.HistorialComponent)
  },
  { path: '**', redirectTo: '' }
];
