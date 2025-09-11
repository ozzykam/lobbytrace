import { Routes } from '@angular/router';
import { canActivateAuthGuard, canActivateAdminGuard } from '../core/guards/auth.guard';

export const adminRoutes: Routes = [
  {
    path: 'inventory-settings',
    loadComponent: () => import('../features/admin/inventory-settings/inventory-settings.component').then(m => m.InventorySettingsComponent),
    canActivate: [canActivateAuthGuard, canActivateAdminGuard],
    title: 'Inventory Settings - Admin'
  }
];