import { Routes } from '@angular/router';
import { roleGuard } from './core/guards/role.guard';
import { homeRedirectGuard } from './core/guards/home-redirect.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [homeRedirectGuard],
    children: []
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent)
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
        path: 'instituciones',
        loadComponent: () =>
          import('./features/admin/instituciones/instituciones.component').then((m) => m.InstitucionesComponent)
      },
      {
        path: 'grupos',
        loadComponent: () => import('./features/admin/grupos/grupos.component').then((m) => m.GruposComponent)
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
    path: 'miembro',
    canActivate: [roleGuard],
    data: { rol: 'miembro' },
    loadComponent: () => import('./features/miembro/inicio/inicio.component').then((m) => m.InicioComponent)
  },
  { path: '**', redirectTo: '' }
];
