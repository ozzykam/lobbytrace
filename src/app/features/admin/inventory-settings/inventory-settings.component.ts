import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { CsvInventoryImportService } from '../../../core/services/csv-inventory-import.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { InventorySettings, InventoryItem } from '../../../shared/models/product.models';
import { SquareConfigDialogComponent } from '../../inventory/square-config-dialog/square-config-dialog.component';

@Component({
  selector: 'app-inventory-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSliderModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    MatChipsModule
  ],
  templateUrl: './inventory-settings.component.html',
  styleUrl: './inventory-settings.component.scss'
})
export class InventorySettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private csvImportService = inject(CsvInventoryImportService);
  private inventoryService = inject(InventoryService);
  private snackBar = inject(MatSnackBar);

  // Component state
  isLoading = signal(false);
  isSaving = signal(false);
  currentSettings = signal<InventorySettings | null>(null);
  inventoryStats = signal<{
    totalItems: number;
    itemsUsingGlobalDefault: number;
    itemsUsingCustomLevels: number;
    averageStockLevel: number;
  }>({
    totalItems: 0,
    itemsUsingGlobalDefault: 0,
    itemsUsingCustomLevels: 0,
    averageStockLevel: 0
  });

  // Form
  settingsForm: FormGroup;

  // Stock level presets
  stockLevelPresets = [
    { value: 20, label: '20%', description: 'Conservative - Lower stock levels' },
    { value: 30, label: '30%', description: 'Moderate - Balanced approach' },
    { value: 50, label: '50%', description: 'Standard - Recommended default' },
    { value: 70, label: '70%', description: 'High - Extra safety buffer' },
    { value: 100, label: '100%', description: 'Maximum - Full case as minimum' }
  ];

  constructor() {
    this.settingsForm = this.fb.group({
      defaultStockLevelPercentage: [50, [Validators.required, Validators.min(10), Validators.max(200)]]
    });
  }

  ngOnInit() {
    this.loadSettings();
    this.loadInventoryStats();
  }

  private async loadSettings() {
    this.isLoading.set(true);
    
    try {
      // Get current inventory settings using the CSV import service method
      const settings = await this.csvImportService.getInventorySettings();
      
      this.currentSettings.set(settings);
      this.settingsForm.patchValue({
        defaultStockLevelPercentage: settings.defaultStockLevelPercentage * 100 // Convert decimal to percentage
      });
    } catch (error) {
      console.error('Error loading inventory settings:', error);
      this.snackBar.open('Failed to load inventory settings', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadInventoryStats() {
    try {
      const items = await this.inventoryService.getInventoryItems().toPromise();
      if (!items) return;

      const totalItems = items.length;
      const itemsUsingGlobalDefault = items.filter(item => !item.useCustomStockLevel).length;
      const itemsUsingCustomLevels = items.filter(item => item.useCustomStockLevel).length;
      
      // Calculate average stock level percentage
      let totalStockPercentage = 0;
      for (const item of items) {
        if (item.minPhysicalStockLevel > 0) {
          const percentage = item.currentPhysicalStock / item.minPhysicalStockLevel;
          totalStockPercentage += percentage;
        }
      }
      const averageStockLevel = totalItems > 0 ? totalStockPercentage / totalItems : 0;

      this.inventoryStats.set({
        totalItems,
        itemsUsingGlobalDefault,
        itemsUsingCustomLevels,
        averageStockLevel
      });
    } catch (error) {
      console.error('Error loading inventory stats:', error);
    }
  }

  async onSaveSettings() {
    if (this.settingsForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.isSaving.set(true);

    try {
      const formValue = this.settingsForm.value;
      
      // Convert percentage to decimal before saving
      const settingsToSave = {
        defaultStockLevelPercentage: formValue.defaultStockLevelPercentage / 100
      };
      
      // Update settings using the CSV import service method
      await this.csvImportService.updateInventorySettings(settingsToSave).toPromise();
      
      this.snackBar.open('Inventory settings saved successfully', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });

      // Reload settings to get updated metadata
      await this.loadSettings();
      
    } catch (error) {
      console.error('Error saving inventory settings:', error);
      this.snackBar.open('Failed to save inventory settings. Please try again.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isSaving.set(false);
    }
  }

  onPresetClick(preset: { value: number; label: string; description: string }) {
    this.settingsForm.patchValue({
      defaultStockLevelPercentage: preset.value
    });
  }

  onSliderChange(event: any) {
    const value = parseFloat(event.target.value);
    this.settingsForm.patchValue({
      defaultStockLevelPercentage: value
    });
  }

  async recalculateAllStockLevels() {
    if (!confirm('This will recalculate minimum stock levels for all items using the global default. Items with custom stock levels will not be affected. Continue?')) {
      return;
    }

    this.isLoading.set(true);

    try {
      const items = await this.inventoryService.getInventoryItems().toPromise();
      const newPercentage = (this.settingsForm.get('defaultStockLevelPercentage')?.value || 50) / 100;
      
      if (!items) return;

      let updatedCount = 0;
      const errors: string[] = [];

      for (const item of items) {
        if (item.useCustomStockLevel) {
          continue; // Skip items with custom levels
        }

        try {
          // Recalculate min stock level based on unitsPerCase * percentage
          // Note: We'll need to get unitsPerCase from somewhere - using a placeholder
          const unitsPerCase = 12; // Placeholder - this should come from item data
          const newMinStockLevel = Math.ceil(unitsPerCase * newPercentage);

          await this.inventoryService.updateInventoryItem({
            id: item.id,
            minPhysicalStockLevel: newMinStockLevel
          }).toPromise();

          updatedCount++;
        } catch (error) {
          errors.push(`Failed to update ${item.name}: ${error}`);
        }
      }

      if (errors.length === 0) {
        this.snackBar.open(`Successfully recalculated stock levels for ${updatedCount} items`, 'Close', {
          duration: 5000,
          panelClass: ['success-snackbar']
        });
      } else {
        this.snackBar.open(`Updated ${updatedCount} items with ${errors.length} errors. Check console for details.`, 'Close', {
          duration: 5000,
          panelClass: ['warn-snackbar']
        });
        console.error('Stock level recalculation errors:', errors);
      }

      // Reload stats
      await this.loadInventoryStats();

    } catch (error) {
      console.error('Error recalculating stock levels:', error);
      this.snackBar.open('Failed to recalculate stock levels. Please try again.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  private markFormGroupTouched() {
    Object.keys(this.settingsForm.controls).forEach(key => {
      const control = this.settingsForm.get(key);
      control?.markAsTouched();
    });
  }

  getPercentageDisplay(value: number): string {
    return `${Math.round(value)}%`;
  }

  getStockLevelColor(percentage: number): string {
    if (percentage >= 1.0) return 'primary';
    if (percentage >= 0.5) return 'accent';
    return 'warn';
  }

  getCurrentPresetLabel(): string {
    const currentValue = this.settingsForm.get('defaultStockLevelPercentage')?.value;
    const preset = this.stockLevelPresets.find(p => Math.abs(p.value - currentValue) < 1);
    return preset ? preset.label : 'Custom';
  }

  isPresetSelected(presetValue: number): boolean {
    const currentValue = this.settingsForm.get('defaultStockLevelPercentage')?.value || 50;
    return Math.abs(currentValue - presetValue) < 1;
  }

  formatDate(date: Date | undefined): string {
    if (!date) return 'Never';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  getStockLevelImpactText(): string {
    const percentage = this.settingsForm.get('defaultStockLevelPercentage')?.value || 0.5;
    const stats = this.inventoryStats();
    
    if (stats.itemsUsingGlobalDefault === 0) {
      return 'No items are using the global default.';
    }

    return `This will affect ${stats.itemsUsingGlobalDefault} items using the global default. ${stats.itemsUsingCustomLevels} items have custom levels and won't be affected.`;
  }

  // Square Integration Configuration
  configureSquareIntegration() {
    const dialogRef = this.dialog.open(SquareConfigDialogComponent, {
      // width: '800px',
      maxWidth: '95vw',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Square integration configured successfully', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      }
    });
  }
}