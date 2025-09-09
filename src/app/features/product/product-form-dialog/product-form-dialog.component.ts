import { Component, Inject, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatCardModule } from '@angular/material/card';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProductService } from '../../../core/services/product.service';
import { 
  Product, 
  InventoryItem, 
  ProductIngredient,
  CreateProductRequest,
  UpdateProductRequest,
  ProductCategory,
  MeasurementUnit,
  MEASUREMENT_UNITS
} from '../../../shared/models/product.models';

export interface ProductFormDialogData {
  product?: Product;
  inventoryItems: InventoryItem[];
  mode: 'create' | 'edit';
}

@Component({
  selector: 'app-product-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatDividerModule,
    MatCardModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './product-form-dialog.component.html',
  styleUrl: './product-form-dialog.component.scss'
})
export class ProductFormDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private productService = inject(ProductService);
  private dialogRef = inject(MatDialogRef<ProductFormDialogComponent>);

  // Form and state
  productForm: FormGroup;
  isLoading = signal(false);
  measurementUnits = MEASUREMENT_UNITS;
  categories = this.productService.getProductCategories();

  // Data from dialog injection
  inventoryItems: InventoryItem[];
  mode: 'create' | 'edit';
  product?: Product;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ProductFormDialogData
  ) {
    this.inventoryItems = data.inventoryItems;
    this.mode = data.mode;
    this.product = data.product;

    // Initialize form
    this.productForm = this.fb.group({
      token: [''],
      name: ['', [Validators.required, Validators.minLength(2)]],
      variation: [''],
      description: [''],
      category: ['', [Validators.required]],
      price: [0, [Validators.required, Validators.min(0)]],
      preparationTime: [0, [Validators.min(0)]],
      preparationInstructions: [''],
      allergens: [[]],
      ingredients: this.fb.array([])
    });
  }

  ngOnInit() {
    if (this.mode === 'edit' && this.product) {
      this.populateForm(this.product);
    } else {
      // Add one empty ingredient row for new products
      this.addIngredient();
    }
  }

  // Form array getter for ingredients
  get ingredientsArray(): FormArray {
    return this.productForm.get('ingredients') as FormArray;
  }

  // Populate form with existing product data
  private populateForm(product: Product) {
    this.productForm.patchValue({
      token: product.token || '',
      name: product.name,
      variation: product.variation || '',
      description: product.description || '',
      category: product.category,
      price: product.price,
      preparationTime: product.preparationTime || 0,
      preparationInstructions: product.preparationInstructions || '',
      allergens: product.allergens || []
    });

    // Clear existing ingredients and add product ingredients
    this.ingredientsArray.clear();
    if (product.ingredients && product.ingredients.length > 0) {
      product.ingredients.forEach(ingredient => {
        this.addIngredient(ingredient);
      });
    } else {
      // Add empty ingredient if none exist
      this.addIngredient();
    }
  }

  // Add ingredient to form array
  addIngredient(ingredient?: ProductIngredient) {
    const ingredientGroup = this.fb.group({
      inventoryItemId: [ingredient?.inventoryItemId || '', [Validators.required]],
      inventoryItemName: [ingredient?.inventoryItemName || ''],
      quantity: [ingredient?.quantity || 0, [Validators.required, Validators.min(0.1)]],
      unit: [ingredient?.unit || 'g', [Validators.required]],
      notes: [ingredient?.notes || '']
    });

    this.ingredientsArray.push(ingredientGroup);
  }

  // Remove ingredient from form array
  removeIngredient(index: number) {
    this.ingredientsArray.removeAt(index);
    
    // Ensure at least one ingredient exists
    if (this.ingredientsArray.length === 0) {
      this.addIngredient();
    }
  }

  // Handle inventory item selection
  onInventoryItemSelected(index: number, inventoryItemId: string) {
    const inventoryItem = this.inventoryItems.find(item => item.id === inventoryItemId);
    if (inventoryItem) {
      const ingredientGroup = this.ingredientsArray.at(index);
      ingredientGroup.patchValue({
        inventoryItemId: inventoryItem.id,
        inventoryItemName: inventoryItem.name,
        unit: inventoryItem.unit // Set default unit from inventory item
      });
    }
  }

  // Get inventory item display name
  getInventoryItemDisplayName(item: InventoryItem): string {
    return `${item.name} (${item.category})`;
  }

  // Form validation helpers
  isFieldInvalid(fieldName: string): boolean {
    const field = this.productForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  isIngredientFieldInvalid(index: number, fieldName: string): boolean {
    const ingredientGroup = this.ingredientsArray.at(index);
    const field = ingredientGroup.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.productForm.get(fieldName);
    if (!field || !field.errors || !field.touched) return '';

    if (field.errors['required']) return `${this.getFieldDisplayName(fieldName)} is required`;
    if (field.errors['minlength']) return `${this.getFieldDisplayName(fieldName)} is too short`;
    if (field.errors['min']) return `${this.getFieldDisplayName(fieldName)} must be greater than 0`;

    return '';
  }

  private getFieldDisplayName(fieldName: string): string {
    const displayNames: { [key: string]: string } = {
      token: 'Token',
      name: 'Product Name',
      variation: 'Variation',
      description: 'Description',
      category: 'Category',
      price: 'Price',
      preparationTime: 'Preparation Time',
      preparationInstructions: 'Preparation Instructions'
    };
    return displayNames[fieldName] || fieldName;
  }

  // Calculate estimated cost based on ingredients
  calculateEstimatedCost(): number {
    let totalCost = 0;
    
    this.ingredientsArray.controls.forEach(control => {
      const inventoryItemId = control.get('inventoryItemId')?.value;
      const quantity = control.get('quantity')?.value || 0;
      
      if (inventoryItemId && quantity > 0) {
        const inventoryItem = this.inventoryItems.find(item => item.id === inventoryItemId);
        if (inventoryItem) {
          // Convert units if needed (simplified - assumes same units for now)
          totalCost += quantity * inventoryItem.costPerUnit;
        }
      }
    });

    return totalCost;
  }

  // Form submission
  async onSubmit() {
    if (this.productForm.invalid) {
      this.markFormGroupTouched(this.productForm);
      return;
    }

    this.isLoading.set(true);

    try {
      const formValue = this.productForm.value;
      
      // Process ingredients - filter out empty ones
      const ingredients: ProductIngredient[] = formValue.ingredients
        .filter((ingredient: any) => 
          ingredient.inventoryItemId && 
          ingredient.quantity > 0
        )
        .map((ingredient: any) => ({
          inventoryItemId: ingredient.inventoryItemId,
          inventoryItemName: ingredient.inventoryItemName,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          notes: ingredient.notes || undefined
        }));

      if (this.mode === 'create') {
        const createRequest: CreateProductRequest = {
          name: formValue.name,
          variation: formValue.variation || undefined,
          description: formValue.description || undefined,
          category: formValue.category,
          price: formValue.price,
          ingredients,
          preparationTime: formValue.preparationTime || undefined,
          preparationInstructions: formValue.preparationInstructions || undefined,
          allergens: formValue.allergens || []
        };

        await this.productService.createProduct(createRequest).toPromise();
      } else {
        const updateRequest: UpdateProductRequest = {
          id: this.product!.id,
          name: formValue.name,
          variation: formValue.variation || undefined,
          description: formValue.description || undefined,
          category: formValue.category,
          price: formValue.price,
          ingredients,
          preparationTime: formValue.preparationTime || undefined,
          preparationInstructions: formValue.preparationInstructions || undefined,
          allergens: formValue.allergens || []
        };

        await this.productService.updateProduct(updateRequest).toPromise();
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Failed to save product. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  onCancel() {
    this.dialogRef.close(false);
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        control.controls.forEach(arrayControl => {
          if (arrayControl instanceof FormGroup) {
            this.markFormGroupTouched(arrayControl);
          } else {
            arrayControl.markAsTouched();
          }
        });
      } else {
        control?.markAsTouched();
      }
    });
  }
}