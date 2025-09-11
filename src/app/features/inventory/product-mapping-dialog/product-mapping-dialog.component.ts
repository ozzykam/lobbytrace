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
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { 
  SquareIntegrationService, 
  ProductMapping, 
  SquareCatalogObject,
  SquareItem
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
    MatTabsModule,
    MatPaginatorModule,
    MatButtonToggleModule
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
  allSquareItems: SquareCatalogObject[] = [];
  
  // Pagination
  pageSize = signal(20);
  currentPage = signal(0);
  totalSquareItems = signal(0);
  showAllItems = signal(false);
  availablePageSizes = [10, 20, 50, 100];
  
  // Performance optimization lookups
  private squareItemLookup = new Map<string, SquareCatalogObject>();
  private parentItemLookup = new Map<string, SquareCatalogObject>();

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

      // Load products and mappings first (faster)
      const [products, mappings] = await Promise.all([
        this.productService.getProducts().toPromise(),
        this.squareService.getProductMappings().toPromise()
      ]);

      this.products.set(products || []);
      this.existingMappings.set(mappings || []);

      // Load Square items separately (slower operation)
      this.loadSquareItemsAsync(config);

    } catch (error) {
      console.error('Error loading mapping data:', error);
      this.showError('Failed to load data');
      this.isLoading.set(false);
    }
  }

  private async loadSquareItemsAsync(config: any) {
    try {
      const squareItems = await this.squareService.getSquareCatalog(config).toPromise();
      const allSquareItems = squareItems || [];
      
      // Store all items for reference
      this.allSquareItems = allSquareItems;
      
      // Filter to variations only
      const allVariations = allSquareItems.filter(item => item.type === 'ITEM_VARIATION');
      this.totalSquareItems.set(allVariations.length);
      
      // Create lookup maps for better performance
      this.createSquareItemLookups(allSquareItems);
      
      // Load first page
      this.loadSquareItemsPage();

      // Generate limited suggestions in the background
      setTimeout(() => this.generateSuggestions(), 100);

    } catch (error) {
      console.error('Error loading Square items:', error);
      this.showError('Failed to load Square items');
    } finally {
      this.isLoading.set(false);
    }
  }

  private loadSquareItemsPage() {
    const allVariations = this.allSquareItems.filter(item => item.type === 'ITEM_VARIATION');
    
    if (this.showAllItems()) {
      // Show all items
      this.squareItems.set(allVariations);
    } else {
      // Show paginated items
      const startIndex = this.currentPage() * this.pageSize();
      const endIndex = startIndex + this.pageSize();
      const pageItems = allVariations.slice(startIndex, endIndex);
      this.squareItems.set(pageItems);
    }
  }

  private createSquareItemLookups(allSquareItems: SquareCatalogObject[]) {
    // Create fast lookup maps
    this.squareItemLookup.clear();
    this.parentItemLookup.clear();
    
    allSquareItems.forEach(item => {
      this.squareItemLookup.set(item.id, item);
      
      if (item.type === 'ITEM') {
        // Map this item as parent for its variations
        this.parentItemLookup.set(item.id, item);
      }
    });
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

  // Pagination methods
  nextPage() {
    const maxPage = Math.ceil(this.totalSquareItems() / this.pageSize()) - 1;
    if (this.currentPage() < maxPage) {
      this.currentPage.set(this.currentPage() + 1);
      this.loadSquareItemsPage();
    }
  }

  previousPage() {
    if (this.currentPage() > 0) {
      this.currentPage.set(this.currentPage() - 1);
      this.loadSquareItemsPage();
    }
  }

  goToPage(page: number) {
    const maxPage = Math.ceil(this.totalSquareItems() / this.pageSize()) - 1;
    if (page >= 0 && page <= maxPage) {
      this.currentPage.set(page);
      this.loadSquareItemsPage();
    }
  }

  changePageSize(newSize: number) {
    this.pageSize.set(newSize);
    this.currentPage.set(0); // Reset to first page
    this.loadSquareItemsPage();
  }

  toggleShowAll() {
    this.showAllItems.set(!this.showAllItems());
    this.loadSquareItemsPage();
  }

  getTotalPages(): number {
    return Math.ceil(this.totalSquareItems() / this.pageSize());
  }

  getCurrentPageRange(): string {
    if (this.showAllItems()) {
      return `Showing all ${this.totalSquareItems()} items`;
    }
    
    const start = this.currentPage() * this.pageSize() + 1;
    const end = Math.min(start + this.pageSize() - 1, this.totalSquareItems());
    return `Showing ${start}-${end} of ${this.totalSquareItems()} items`;
  }

  getSquareItemDisplayName(squareCatalogObject: SquareCatalogObject): string {
    if (squareCatalogObject.type === 'ITEM_VARIATION' && squareCatalogObject.item_variation_data) {
      // Use fast lookup instead of array.find
      const parentItemId = squareCatalogObject.item_variation_data.item_id;
      const parentItem = this.parentItemLookup.get(parentItemId);
      
      const variationName = squareCatalogObject.item_variation_data.name || 'Unnamed Variation';
      const parentName = parentItem?.item_data?.name || 'Unknown Item';
      
      // Format: "Parent Item Name" "Variation Name" - ID
      return `${parentName} ${variationName} - ${squareCatalogObject.id}`;
    } else if (squareCatalogObject.type === 'ITEM' && squareCatalogObject.item_data) {
      return `${squareCatalogObject.item_data.name} - ${squareCatalogObject.id}`;
    }
    return squareCatalogObject.id;
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