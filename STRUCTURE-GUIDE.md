# Coffee Shop Inventory & Forecasting App

_Angular • Firebase Auth • Firestore • Cloud Functions • Tailwind (mobile‑first)_

---

## Firestore Security Rules (Starter)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function userRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roleId;
    }

    // Collection: users
    match /users/{userId} {
      allow read: if isSignedIn() && request.auth.uid == userId;
      allow update: if isSignedIn() && request.auth.uid == userId;
      allow create: if isSignedIn();
      allow delete: if false; // only superadmins via backend
    }

    // Collection: inventory_items
    match /inventory_items/{itemId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn() && userRole() in ['admin','superadmin'];
    }

    // Collection: recipes
    match /recipes/{recipeId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn() && userRole() in ['admin','superadmin'];
    }

    // Collection: orders
    match /orders/{orderId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn() && userRole() in ['admin','superadmin'];
    }

    // Default deny
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## Angular Routing & Component Scaffold

**app.routes.ts**
```typescript
import { Routes } from '@angular/router';
import { canActivateAuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [canActivateAuthGuard] },
  { path: 'inventory', loadComponent: () => import('./features/inventory/inventory.component').then(m => m.InventoryComponent), canActivate: [canActivateAuthGuard] },
  { path: 'recipes', loadComponent: () => import('./features/recipes/recipes.component').then(m => m.RecipesComponent), canActivate: [canActivateAuthGuard] },
  { path: 'orders', loadComponent: () => import('./features/orders/orders.component').then(m => m.OrdersComponent), canActivate: [canActivateAuthGuard] },
  { path: 'tasks', loadComponent: () => import('./features/tasks/tasks.component').then(m => m.TasksComponent), canActivate: [canActivateAuthGuard] },
  { path: 'account', loadComponent: () => import('./features/account/account.component').then(m => m.AccountComponent), canActivate: [canActivateAuthGuard] },
  { path: '**', redirectTo: 'dashboard' }
];
```

**Directory Structure**
```
src/app/
  core/
    guards/auth.guard.ts
    services/auth.service.ts
  features/
    dashboard/
      dashboard.component.ts
      dashboard.component.html
    inventory/
      inventory.component.ts
      inventory.component.html
    recipes/
      recipes.component.ts
      recipes.component.html
    orders/
      orders.component.ts
      orders.component.html
    tasks/
      tasks.component.ts
      tasks.component.html
    account/
      account.component.ts
      account.component.html
```

**Example Component (Dashboard)**
```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-4">
      <h1 class="text-xl font-bold mb-4">Dashboard</h1>
      <p>Welcome to the Coffee Shop Inventory & Forecasting App!</p>
    </div>
  `,
})
export class DashboardComponent {}
```

---

## Next Steps
- Implement **auth.guard.ts** to check `isSignedIn` and role.
- Build shared UI components (navbar, tabs, forms).
- Connect Firestore collections with Angular services.
- Apply Tailwind for responsive, mobile‑first layouts.

---

