import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { InventoryService } from '../../../core/services/inventory.service';
import { InventoryItem } from '../../../shared/models/product.models';

export interface StockAdjustmentDialogData {
  item: InventoryItem;
}

@Component({
  selector: 'app-stock-adjustment-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCardModule,
    MatDividerModule
  ],
  templateUrl: './stock-adjustment-dialog.component.html',
  styleUrl: './stock-adjustment-dialog.component.scss'
})
export class StockAdjustmentDialogComponent {
  private dialogRef = inject(MatDialogRef<StockAdjustmentDialogComponent>);
  private data = inject(MAT_DIALOG_DATA) as StockAdjustmentDialogData;
  private fb = inject(FormBuilder);
  private inventoryService = inject(InventoryService);
  private snackBar = inject(MatSnackBar);

  item = this.data.item;
  isSubmitting = signal(false);
  
  adjustmentForm: FormGroup;

  // Movement types with descriptions
  movementTypes = [
    { value: 'IN', label: 'Stock In', description: 'Add inventory (receiving, restocking)' },
    { value: 'OUT', label: 'Stock Out', description: 'Remove inventory (waste, loss, consumption)' },
    { value: 'ADJUSTMENT', label: 'Adjustment', description: 'Set exact quantity (audit correction)' }
  ];

  // Common reasons for each movement type
  stockInReasons = [
    'Received delivery',
    'Restocking from storage',
    'Found inventory',
    'Transfer from another location',
    'Return from customer',
    'Other'
  ];

  stockOutReasons = [
    'Sales/Usage',
    'Waste/Spoilage',
    'Damaged/Defective',
    'Lost/Missing',
    'Transfer to another location',
    'Sample/Testing',
    'Other'
  ];

  adjustmentReasons = [
    'Physical count correction',
    'System error correction',
    'Inventory audit',
    'Opening balance',
    'Data migration',
    'Other'
  ];

  constructor() {
    this.adjustmentForm = this.fb.group({
      movementType: ['IN', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      reason: ['', Validators.required],
      notes: ['']
    });

    // Update available reasons when movement type changes
    this.adjustmentForm.get('movementType')?.valueChanges.subscribe(() => {
      this.adjustmentForm.patchValue({ reason: '' });
    });
  }

  get availableReasons(): string[] {
    const movementType = this.adjustmentForm.get('movementType')?.value;
    switch (movementType) {
      case 'IN': return this.stockInReasons;
      case 'OUT': return this.stockOutReasons;
      case 'ADJUSTMENT': return this.adjustmentReasons;
      default: return [];
    }
  }

  get movementTypeDescription(): string {
    const movementType = this.adjustmentForm.get('movementType')?.value;
    const type = this.movementTypes.find(t => t.value === movementType);
    return type?.description || '';
  }

  get previewNewStock(): number {
    if (!this.adjustmentForm.valid) return this.item.currentPhysicalStock;
    
    const movementType = this.adjustmentForm.get('movementType')?.value;
    const quantity = this.adjustmentForm.get('quantity')?.value || 0;
    
    switch (movementType) {
      case 'IN':
        return this.item.currentPhysicalStock + quantity;
      case 'OUT':
        return Math.max(0, this.item.currentPhysicalStock - quantity);
      case 'ADJUSTMENT':
        return quantity;
      default:
        return this.item.currentPhysicalStock;
    }
  }

  get stockChangeColor(): string {
    const newStock = this.previewNewStock;
    if (newStock < this.item.currentPhysicalStock) {
      return 'warn';
    } else if (newStock > this.item.currentPhysicalStock) {
      return 'primary';
    }
    return '';
  }

  async onSubmit() {
    if (this.adjustmentForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formValue = this.adjustmentForm.value;
      
      await this.inventoryService.updatePhysicalStock(
        this.item.id,
        formValue.quantity,
        formValue.movementType,
        formValue.reason,
        formValue.notes || undefined
      ).toPromise();

      this.snackBar.open('Stock updated successfully', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error updating stock:', error);
      this.snackBar.open('Failed to update stock. Please try again.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onCancel() {
    this.dialogRef.close(false);
  }

  private markFormGroupTouched() {
    Object.keys(this.adjustmentForm.controls).forEach(key => {
      const control = this.adjustmentForm.get(key);
      control?.markAsTouched();
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  calculateValueImpact(): number {
    const stockChange = this.previewNewStock - this.item.currentPhysicalStock;
    return stockChange * this.item.costPerPhysicalUnit;
  }
}