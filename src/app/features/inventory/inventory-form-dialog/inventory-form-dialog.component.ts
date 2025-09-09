import { Component, Inject, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { InventoryService} from '../../../core/services/inventory.service';
import { CreateInventoryItemRequest, UpdateInventoryItemRequest } from '../../../shared/models/product.models';
import { 
  InventoryItem,
  InventoryCategory,
  INVENTORY_CATEGORIES,
  MeasurementUnit,
  MEASUREMENT_UNITS
} from '../../../shared/models/product.models';

export interface InventoryFormDialogData {
  item?: InventoryItem;
  mode: 'create' | 'edit';
}

@Component({
  selector: 'app-inventory-form-dialog',
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
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './inventory-form-dialog.component.html',
  styleUrl: './inventory-form-dialog.component.scss'
})
export class InventoryFormDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private inventoryService = inject(InventoryService);
  private dialogRef = inject(MatDialogRef<InventoryFormDialogComponent>);

  // Form and state
  inventoryForm: FormGroup;
  isLoading = signal(false);
  categories = INVENTORY_CATEGORIES;
  units = MEASUREMENT_UNITS;

  // Data from dialog injection
  mode: 'create' | 'edit';
  item?: InventoryItem;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: InventoryFormDialogData
  ) {
    this.mode = data.mode;
    this.item = data.item;

    // Initialize form
    this.inventoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      category: ['', [Validators.required]],
      unit: ['', [Validators.required]],
      currentStock: [0, [Validators.required, Validators.min(0)]],
      minStockLevel: [0, [Validators.required, Validators.min(0)]],
      maxStockLevel: [null, [Validators.min(0)]],
      costPerUnit: [0, [Validators.required, Validators.min(0)]],
      supplier: ['']
    });
  }

  ngOnInit() {
    if (this.mode === 'edit' && this.item) {
      this.populateForm(this.item);
    }
  }

  // Populate form with existing item data
  private populateForm(item: InventoryItem) {
    this.inventoryForm.patchValue({
      name: item.name,
      description: item.description || '',
      category: item.category,
      unit: item.physicalUnit,
      currentStock: item.currentPhysicalStock,
      minStockLevel: item.minPhysicalStockLevel,
      maxStockLevel: item.maxPhysicalStockLevel || null,
      costPerUnit: item.costPerPhysicalUnit,
      supplier: item.supplier || ''
    });
  }

  // Form validation helpers
  isFieldInvalid(fieldName: string): boolean {
    const field = this.inventoryForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.inventoryForm.get(fieldName);
    if (!field || !field.errors || !field.touched) return '';

    if (field.errors['required']) return `${this.getFieldDisplayName(fieldName)} is required`;
    if (field.errors['minlength']) return `${this.getFieldDisplayName(fieldName)} is too short`;
    if (field.errors['min']) return `${this.getFieldDisplayName(fieldName)} must be greater than or equal to 0`;

    return '';
  }

  private getFieldDisplayName(fieldName: string): string {
    const displayNames: { [key: string]: string } = {
      name: 'Item Name',
      description: 'Description',
      category: 'Category',
      unit: 'Unit',
      currentStock: 'Current Stock',
      minStockLevel: 'Minimum Stock Level',
      maxStockLevel: 'Maximum Stock Level',
      costPerUnit: 'Cost Per Unit',
      supplier: 'Supplier'
    };
    return displayNames[fieldName] || fieldName;
  }

  // Calculate total inventory value
  calculateTotalValue(): number {
    const currentStock = this.inventoryForm.get('currentStock')?.value || 0;
    const costPerUnit = this.inventoryForm.get('costPerUnit')?.value || 0;
    return currentStock * costPerUnit;
  }

  // Form submission
  async onSubmit() {
    if (this.inventoryForm.invalid) {
      this.markFormGroupTouched(this.inventoryForm);
      return;
    }

    this.isLoading.set(true);

    try {
      const formValue = this.inventoryForm.value;
      
      if (this.mode === 'create') {
        const createRequest: CreateInventoryItemRequest = {
          name: formValue.name,
          description: formValue.description || undefined,
          category: formValue.category,
          physicalUnit: formValue.unit,
          currentPhysicalStock: formValue.currentStock,
          minPhysicalStockLevel: formValue.minStockLevel,
          maxPhysicalStockLevel: formValue.maxStockLevel || undefined,
          costPerPhysicalUnit: formValue.costPerUnit,
          supplier: formValue.supplier || undefined,
          recipeUnit: formValue.unit, 
          unitsPerPhysicalItem: 1,
          costPerRecipeUnit: formValue.costPerUnit,
          useCustomStockLevel: false
        };

        await this.inventoryService.createInventoryItem(createRequest).toPromise();
      } else {
        const updateRequest: UpdateInventoryItemRequest = {
          id: this.item!.id,
          name: formValue.name,
          description: formValue.description || undefined,
          category: formValue.category,
          physicalUnit: formValue.unit,
          currentPhysicalStock: formValue.currentStock,
          minPhysicalStockLevel: formValue.minStockLevel,
          maxPhysicalStockLevel: formValue.maxStockLevel || undefined,
          costPerPhysicalUnit: formValue.costPerUnit,
          supplier: formValue.supplier || undefined,
          recipeUnit: formValue.unit, 
          unitsPerPhysicalItem: 1,
          costPerRecipeUnit: formValue.costPerUnit,
          useCustomStockLevel: false
        };

        await this.inventoryService.updateInventoryItem(updateRequest).toPromise();
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving inventory item:', error);
      alert('Failed to save inventory item. Please try again.');
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
      control?.markAsTouched();
    });
  }
}