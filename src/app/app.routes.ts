import { Routes } from '@angular/router';
import { canActivateAuthGuard, canActivateAdminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    
  // Public/Marketing Routes
  {
    path: '',
    loadComponent: () => import('./web/home/home').then(m => m.Home),
    pathMatch: 'full'
  },
  {
    path: 'features',
    loadComponent: () => import('./web/features/features').then(m => m.Features)
  },
  {
    path: 'pricing',
    loadComponent: () => import('./web/pricing/pricing').then(m => m.Pricing)
  },
  {
    path: 'about',
    loadComponent: () => import('./web/about/about').then(m => m.About)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/auth/signup/signup').then(m => m.Signup)
  },
    

  // Protected Application Routes
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
    canActivate: [canActivateAuthGuard]
  },
  {
    path: 'inventory',
    loadComponent: () => import('./features/inventory/inventory').then(m => m.Inventory),
    canActivate: [canActivateAuthGuard]
  },
  {
    path: 'products',
    loadComponent: () => import('./features/product/products').then(m => m.Products),
    canActivate: [canActivateAuthGuard]
  },
  {
    path: 'orders',
    loadComponent: () => import('./features/order/order').then(m => m.Order),
    canActivate: [canActivateAuthGuard]
  },
  {
    path: 'expenses',
    loadComponent: () => import('./features/expenses/expenses').then(m => m.Expenses),
    canActivate: [canActivateAuthGuard]
  },
  {
    path: 'account',
    loadComponent: () => import('./features/account/account').then(m => m.Account),
    canActivate: [canActivateAuthGuard]
  },

  // Admin Routes (if needed later)
  {
    path: 'admin',
    loadChildren: () => import('./admin/admin.routes').then(m => m.adminRoutes),
    canActivate: [canActivateAuthGuard, canActivateAdminGuard]
  },

  // Catch-all redirect
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
