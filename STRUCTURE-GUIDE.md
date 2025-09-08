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

    // Collection: products
    match /products/{recipeId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn() && userRole() in ['admin','superadmin'];
    }

    // Collection: orders
    match /orders/{orderId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn() && userRole() in ['admin','superadmin'];
    }

    // Collection: expenses (receipt scanner)
    match /expenses/{expenseId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn() && userRole() in ['admin','superadmin'];
    }

    // Collection: receipt_images
    match /receipt_images/{receiptId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isSignedIn() && userRole() in ['admin','superadmin'];
    }

    // Collection: expense_categories
    match /expense_categories/{categoryId} {
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
  { path: 'products', loadComponent: () => import('./features/products/products.component').then(m => m.ProdcutsComponent), canActivate: [canActivateAuthGuard] },
  { path: 'orders', loadComponent: () => import('./features/orders/orders.component').then(m => m.OrdersComponent), canActivate: [canActivateAuthGuard] },
  { path: 'tasks', loadComponent: () => import('./features/tasks/tasks.component').then(m => m.TasksComponent), canActivate: [canActivateAuthGuard] },
  { path: 'expenses', loadComponent: () => import('./features/expenses/expenses.component').then(m => m.ExpensesComponent), canActivate: [canActivateAuthGuard] },
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
    products/
      products.component.ts
      products.component.html
    orders/
      orders.component.ts
      orders.component.html
    tasks/
      tasks.component.ts
      tasks.component.html
    expenses/
      expenses.component.ts
      expenses.component.html
      receipt-scanner/
        receipt-scanner.component.ts
        receipt-scanner.component.html
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

---

## Receipt Scanner Feature

**Overview:**
- Camera interface + file upload for receipt capture
- OCR processing to extract text from receipt images  
- Auto-parsing of vendor, date, items, amounts, and tax
- Smart categorization and expense organization
- Digital receipt storage for easy record-keeping

**Key Services Needed:**
```typescript
// Core services for receipt processing
core/services/
  ocr.service.ts           // OCR text extraction
  receipt-parser.service.ts // Parse OCR into structured data
  expense.service.ts       // CRUD operations for expenses
  category.service.ts      // Expense categorization
```

**Data Models:**
```typescript
interface Expense {
  id: string;
  receiptImageUrl: string;
  vendor: string;
  date: Date;
  totalAmount: number;
  tax: number;
  items: ExpenseItem[];
  category: string;
  notes?: string;
  createdAt: Date;
  createdBy: string;
}

interface ExpenseItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}
```

**Business Value:**
- Track all business expenses (not just inventory)
- Digital receipt storage (no more lost receipts)
- Auto-categorization for easier tax preparation
- Spending pattern analysis and cost optimization
- Integration with existing vendor database

---

## Next Steps
- Implement **auth.guard.ts** to check `isSignedIn` and role.
- Build shared UI components (navbar, tabs, forms).
- Connect Firestore collections with Angular services.
- Integrate OCR service (Google Cloud Vision API or similar).
- Build receipt scanner camera interface with file upload fallback.
- Apply Tailwind for responsive, mobile‑first layouts.

---

## Notes
- use Angular’s new @ control flow syntax (@if, @else, @for, etc.) instead of the legacy *ngIf, *ngFor, and *ngElse.
