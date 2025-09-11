import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { InventoryService } from '../../core/services/inventory.service';
import { InventoryItem, InventoryCategory, INVENTORY_CATEGORIES } from '../../shared/models/product.models';
import { InventoryFormDialogComponent } from './inventory-form-dialog/inventory-form-dialog.component';
import { CsvImportDialogComponent } from './csv-import-dialog/csv-import-dialog.component';
import { StockAdjustmentDialogComponent } from './stock-adjustment-dialog/stock-adjustment-dialog.component';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatBadgeModule
  ],
  templateUrl: './inventory.html',
  styleUrl: './inventory.scss'
})
export class Inventory implements OnInit {
  private inventoryService = inject(InventoryService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);

  // Component state
  inventoryItems = signal<InventoryItem[]>([]);
  filteredItems = signal<InventoryItem[]>([]);
  selectedCategory = signal<InventoryCategory | 'all'>('all');
  searchTerm = signal('');
  isLoading = signal(false);
  lowStockItems = signal<InventoryItem[]>([]);

  // Table columns
  displayedColumns = ['name', 'category', 'currentStock', 'minStockLevel', 'unit', 'costPerUnit', 'supplier', 'status', 'actions'];
  
  // Categories
  categories = INVENTORY_CATEGORIES;

  ngOnInit() {
    this.loadData();
  }

  private async loadData() {
    this.isLoading.set(true);
    try {
      const items = await this.inventoryService.getInventoryItems().toPromise();
      this.inventoryItems.set(items || []);
      this.applyFilters();
      this.updateLowStockItems();
    } catch (error) {
      console.error('Error loading inventory data:', error);
      this.showError('Failed to load inventory data');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Filter and search functionality
  onCategoryChange(category: InventoryCategory | 'all') {
    this.selectedCategory.set(category);
    this.applyFilters();
  }

  onSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm.set(target.value);
    this.applyFilters();
  }

  private applyFilters() {
    let filtered = [...this.inventoryItems()];

    // Category filter
    const category = this.selectedCategory();
    if (category !== 'all') {
      filtered = filtered.filter(item => item.category === category);
    }

    // Search filter
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(search) ||
        item.category.toLowerCase().includes(search) ||
        (item.description && item.description.toLowerCase().includes(search)) ||
        (item.supplier && item.supplier.toLowerCase().includes(search))
      );
    }

    this.filteredItems.set(filtered);
  }

  private updateLowStockItems() {
    const lowStock = this.inventoryItems().filter(item => 
      item.currentPhysicalStock <= item.minPhysicalStockLevel
    );
    this.lowStockItems.set(lowStock);
  }

  // Inventory actions
  createItem() {
    const dialogRef = this.dialog.open(InventoryFormDialogComponent, {
      width: '800px',
      data: {
        mode: 'create'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
        this.showSuccess('Inventory item created successfully');
      }
    });
  }

  editItem(item: InventoryItem) {
    const dialogRef = this.dialog.open(InventoryFormDialogComponent, {
      width: '800px',
      data: {
        item,
        mode: 'edit'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
        this.showSuccess('Inventory item updated successfully');
      }
    });
  }

  async deleteItem(item: InventoryItem) {
    if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
      try {
        await this.inventoryService.deleteInventoryItem(item.id).toPromise();
        this.loadData();
        this.showSuccess('Inventory item deleted successfully');
      } catch (error) {
        console.error('Error deleting inventory item:', error);
        this.showError('Failed to delete inventory item');
      }
    }
  }

  adjustStock(item: InventoryItem) {
    const dialogRef = this.dialog.open(StockAdjustmentDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: { item }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
        this.showSuccess('Stock level updated successfully');
      }
    });
  }

  importFromCsv() {
    const dialogRef = this.dialog.open(CsvImportDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
        this.showSuccess('CSV import completed successfully');
      }
    });
  }

  openInventorySettings() {
    this.router.navigate(['/admin/inventory-settings']);
  }


  // Helper methods
  getStockStatus(item: InventoryItem): 'low' | 'normal' | 'high' {
    if (item.currentPhysicalStock <= item.minPhysicalStockLevel) {
      return 'low';
    } else if (item.maxPhysicalStockLevel && item.currentPhysicalStock >= item.maxPhysicalStockLevel) {
      return 'high';
    }
    return 'normal';
  }

  getStockStatusColor(status: string): string {
    switch (status) {
      case 'low': return 'warn';
      case 'high': return 'accent';
      default: return 'primary';
    }
  }

  getStockStatusText(status: string): string {
    switch (status) {
      case 'low': return 'Low Stock';
      case 'high': return 'Overstocked';
      default: return 'Normal';
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  private showSuccess(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  private showError(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }
}
