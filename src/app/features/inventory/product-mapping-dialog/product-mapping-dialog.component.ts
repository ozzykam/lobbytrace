import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { 
  SquareIntegrationService, 
  ProductMapping, 
  SquareCatalogObject 
} from '../../../core/services/square-integration.service';
import { ProductService } from '../../../core/services/product.service';
import { Product } from '../../../shared/models/product.models';

@Component({
  selector: 'app-product-mapping-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatTableModule,
    MatCardModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTabsModule
  ],
  templateUrl: './product-mapping-dialog.component.html',
  styleUrl: './product-mapping-dialog.component.scss'
})
export class ProductMappingDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<ProductMappingDialogComponent>);
  private fb = inject(FormBuilder);
  private squareService = inject(SquareIntegrationService);
  private productService = inject(ProductService);
  private snackBar = inject(MatSnackBar);

  // Component state
  isLoading = signal(false);
  selectedTab = signal(0);
  
  // Data
  products = signal<Product[]>([]);
  squareItems = signal<SquareCatalogObject[]>([]);
  existingMappings = signal<ProductMapping[]>([]);
  suggestions = signal<any[]>([]);

  // Forms
  manualMappingForm: FormGroup;

  // Table columns
  mappingColumns = ['productName', 'squareItemName', 'syncEnabled', 'lastSyncedAt', 'actions'];
  suggestionColumns = ['productName', 'squareItemName', 'confidence', 'reason', 'actions'];

  constructor() {
    this.manualMappingForm = this.fb.group({
      productId: ['', Validators.required],
      squareItemId: ['', Validators.required]
    });
  }

  ngOnInit() {
    this.loadData();
  }

  private async loadData() {
    this.isLoading.set(true);
    try {
      // Load Square config to get items
      const config = await this.squareService.getSquareConfig().toPromise();
      if (!config) {
        this.showError('Square integration not configured');
        return;
      }

      // Load all data in parallel
      const [products, squareItems, mappings] = await Promise.all([
        this.productService.getProducts().toPromise(),
        this.squareService.getSquareCatalog(config).toPromise(),
        this.squareService.getProductMappings().toPromise()
      ]);

      this.products.set(products || []);
      this.squareItems.set((squareItems || []).filter(item => item.type === 'ITEM_VARIATION'));
      this.existingMappings.set(mappings || []);

      // Generate suggestions
      this.generateSuggestions();

    } catch (error) {
      console.error('Error loading mapping data:', error);
      this.showError('Failed to load data');
    } finally {
      this.isLoading.set(false);
    }
  }

  private generateSuggestions() {
    const products = this.products();
    const squareItems = this.squareItems();
    const existingMappings = this.existingMappings();
    
    // Filter out already mapped products
    const mappedProductIds = new Set(existingMappings.map(m => m.productId));
    const mappedSquareIds = new Set(existingMappings.map(m => m.squareItemVariationId));
    
    const unmappedProducts = products.filter(p => !mappedProductIds.has(p.id));
    const unmappedSquareItems = squareItems.filter(item => !mappedSquareIds.has(item.id));

    const suggestions = this.squareService.suggestProductMappings(unmappedProducts, unmappedSquareItems);
    this.suggestions.set(suggestions);
  }

  async createManualMapping() {
    if (this.manualMappingForm.invalid) {
      this.markFormGroupTouched(this.manualMappingForm);
      return;
    }

    this.isLoading.set(true);
    try {
      const formValue = this.manualMappingForm.value;
      const product = this.products().find(p => p.id === formValue.productId);
      const squareItem = this.squareItems().find(item => item.id === formValue.squareItemId);

      if (!product || !squareItem) {
        this.showError('Selected product or Square item not found');
        return;
      }

      const mapping = {
        productId: product.id,
        squareCatalogObjectId: squareItem.id,
        squareItemVariationId: squareItem.id,
        productName: product.name,
        squareItemName: this.getSquareItemDisplayName(squareItem),
        syncEnabled: true
      };

      await this.squareService.saveProductMapping(mapping).toPromise();
      
      this.showSuccess('Product mapping created successfully');
      this.manualMappingForm.reset();
      this.loadData(); // Refresh data

    } catch (error) {
      console.error('Error creating mapping:', error);
      this.showError('Failed to create mapping');
    } finally {
      this.isLoading.set(false);
    }
  }

  async acceptSuggestion(suggestion: any) {
    this.isLoading.set(true);
    try {
      const mapping = {
        productId: suggestion.lobbyTraceProduct.id,
        squareCatalogObjectId: suggestion.squareItem.id,
        squareItemVariationId: suggestion.squareItem.id,
        productName: suggestion.lobbyTraceProduct.name,
        squareItemName: this.getSquareItemDisplayName(suggestion.squareItem),
        syncEnabled: true
      };

      await this.squareService.saveProductMapping(mapping).toPromise();
      
      this.showSuccess('Product mapping created successfully');
      this.loadData(); // Refresh data

    } catch (error) {
      console.error('Error creating mapping:', error);
      this.showError('Failed to create mapping');
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleMappingSync(mapping: ProductMapping, enabled: boolean) {
    try {
      if (mapping.id) {
        await this.squareService.toggleMappingSync(mapping.id, enabled).toPromise();
        this.loadData(); // Refresh data
        this.showSuccess(`Mapping ${enabled ? 'enabled' : 'disabled'}`);
      }
    } catch (error) {
      console.error('Error toggling mapping sync:', error);
      this.showError('Failed to update mapping');
    }
  }

  async deleteMapping(mapping: ProductMapping) {
    if (!confirm(`Are you sure you want to delete the mapping for "${mapping.productName}"?`)) {
      return;
    }

    try {
      if (mapping.id) {
        await this.squareService.deleteProductMapping(mapping.id).toPromise();
        this.loadData(); // Refresh data
        this.showSuccess('Mapping deleted successfully');
      }
    } catch (error) {
      console.error('Error deleting mapping:', error);
      this.showError('Failed to delete mapping');
    }
  }

  onCancel() {
    this.dialogRef.close(false);
  }

  onClose() {
    this.dialogRef.close(true);
  }

  getSquareItemDisplayName(squareItem: SquareCatalogObject): string {
    return squareItem.item_variation_data?.name || squareItem.id;
  }

  getUnmappedProducts(): Product[] {
    const mappedProductIds = new Set(this.existingMappings().map(m => m.productId));
    return this.products().filter(p => !mappedProductIds.has(p.id));
  }

  getUnmappedSquareItems(): SquareCatalogObject[] {
    const mappedSquareIds = new Set(this.existingMappings().map(m => m.squareItemVariationId));
    return this.squareItems().filter(item => !mappedSquareIds.has(item.id));
  }

  getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return 'primary';
    if (confidence >= 0.8) return 'accent';
    return 'warn';
  }

  getConfidenceText(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
  }

  formatDate(date?: Date): string {
    if (!date) return 'Never';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
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