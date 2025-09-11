import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
import { ProductService } from '../../core/services/product.service';
import { InventoryService } from '../../core/services/inventory.service';
import { SquareIntegrationService } from '../../core/services/square-integration.service';
import { Product, InventoryItem, ProductCategory, ProductIngredient, SquareImportResult } from '../../shared/models/product.models';
import { ProductFormDialogComponent } from './product-form-dialog/product-form-dialog.component';
import { CsvImportDialogComponent } from './csv-import-dialog/csv-import-dialog.component';

@Component({
  selector: 'app-products',
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
    MatTooltipModule
  ],
  templateUrl: './products.html',
  styleUrl: './products.scss'
})
export class Products implements OnInit {
  private productService = inject(ProductService);
  private inventoryService = inject(InventoryService);
  private squareService = inject(SquareIntegrationService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  // Component state
  products = signal<Product[]>([]);
  inventoryItems = signal<InventoryItem[]>([]);
  filteredProducts = signal<Product[]>([]);
  selectedCategory = signal<ProductCategory | 'all'>('all');
  searchTerm = signal('');
  isLoading = signal(false);
  isSquareImporting = signal(false);

  // Table columns
  displayedColumns = ['token', 'name', 'variation', 'size', 'temperature', 'toGoStatus', 'category', 'price', 'ingredients', 'actions'];
  
  // Categories
  categories = this.productService.getProductCategories();

  ngOnInit() {
    this.loadData();
  }

  private async loadData() {
    this.isLoading.set(true);
    try {
      // Load products and inventory items in parallel
      const [products, inventory] = await Promise.all([
        this.productService.getProducts().toPromise(),
        this.inventoryService.getInventoryItems().toPromise()
      ]);

      this.products.set(products || []);
      this.inventoryItems.set(inventory || []);
      this.applyFilters();
    } catch (error) {
      console.error('Error loading data:', error);
      this.showError('Failed to load data');
    } finally {
      this.isLoading.set(false);
    }
  }

  // Filter and search functionality
  onCategoryChange(category: ProductCategory | 'all') {
    this.selectedCategory.set(category);
    this.applyFilters();
  }

  onSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm.set(target.value);
    this.applyFilters();
  }

  private applyFilters() {
    let filtered = [...this.products()];

    // Category filter
    const category = this.selectedCategory();
    if (category !== 'all') {
      filtered = filtered.filter(product => product.category === category);
    }

    // Search filter
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(search) ||
        (product.variation && product.variation.toLowerCase().includes(search)) ||
        (product.description && product.description.toLowerCase().includes(search)) ||
        (product.token && product.token.toLowerCase().includes(search))
      );
    }

    this.filteredProducts.set(filtered);
  }

  // Product actions
  createProduct() {
    const dialogRef = this.dialog.open(ProductFormDialogComponent, {
      width: '800px',
      data: {
        inventoryItems: this.inventoryItems(),
        mode: 'create'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
        this.showSuccess('Product created successfully');
      }
    });
  }

  editProduct(product: Product) {
    const dialogRef = this.dialog.open(ProductFormDialogComponent, {
      width: '800px',
      data: {
        product,
        inventoryItems: this.inventoryItems(),
        mode: 'edit'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
        this.showSuccess('Product updated successfully');
      }
    });
  }

  async deleteProduct(product: Product) {
    if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
      try {
        await this.productService.deleteProduct(product.id).toPromise();
        this.loadData();
        this.showSuccess('Product deleted successfully');
      } catch (error) {
        console.error('Error deleting product:', error);
        this.showError('Failed to delete product');
      }
    }
  }

  // CSV Import
  importFromCsv() {
    const dialogRef = this.dialog.open(CsvImportDialogComponent, {
      width: '600px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
        this.showSuccess(`Import completed: ${result.success} products imported`);
        if (result.errors && result.errors.length > 0) {
          console.warn('Import errors:', result.errors);
        }
      }
    });
  }

  // Square Import
  async downloadFromSquare() {
    this.isSquareImporting.set(true);
    try {
      const result = await this.squareService.importProductsFromSquare().toPromise();
      
      if (result) {
        this.loadData(); // Refresh products list
        
        // Show detailed import results
        let message = `Import completed: ${result.imported} new, ${result.updated} updated`;
        if (result.skipped > 0) {
          message += `, ${result.skipped} skipped`;
        }
        
        this.showSuccess(message);
        
        // Show errors if any
        if (result.errors && result.errors.length > 0) {
          console.warn('Import errors:', result.errors);
          this.showError(`${result.errors.length} import errors occurred. Check console for details.`);
        }
      }
    } catch (error) {
      console.error('Error importing from Square:', error);
      this.showError('Failed to import products from Square');
    } finally {
      this.isSquareImporting.set(false);
    }
  }

  // Helper methods
  getIngredientsSummary(ingredients: ProductIngredient[]): string {
    if (!ingredients || ingredients.length === 0) {
      return 'No ingredients specified';
    }
    return `${ingredients.length} ingredient${ingredients.length > 1 ? 's' : ''}`;
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price/100);
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
