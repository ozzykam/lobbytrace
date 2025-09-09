import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { ProductService } from '../../../core/services/product.service';

@Component({
  selector: 'app-csv-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatCardModule
  ],
  templateUrl: './csv-import-dialog.component.html',
  styleUrl: './csv-import-dialog.component.scss'
})
export class CsvImportDialogComponent {
  private dialogRef = inject(MatDialogRef<CsvImportDialogComponent>);
  private productService = inject(ProductService);

  // Component state
  selectedFile = signal<File | null>(null);
  isImporting = signal(false);
  importResults = signal<{ success: number; errors: string[] } | null>(null);
  dragOver = signal(false);

  // File selection and drag/drop handlers
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.validateAndSetFile(file);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);

    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      this.validateAndSetFile(files[0]);
    }
  }

  private validateAndSetFile(file: File) {
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a CSV file.');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB.');
      return;
    }

    this.selectedFile.set(file);
    this.importResults.set(null); // Clear previous results
  }

  // Trigger file input click
  triggerFileInput() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.onchange = (e) => this.onFileSelected(e);
    fileInput.click();
  }

  // Remove selected file
  removeFile() {
    this.selectedFile.set(null);
    this.importResults.set(null);
  }

  // Import CSV data
  async importCsv() {
    const file = this.selectedFile();
    if (!file) return;

    this.isImporting.set(true);
    this.importResults.set(null);

    try {
      const csvContent = await this.readFileAsText(file);
      const results = await this.productService.importProductsFromCsv(csvContent).toPromise();
      this.importResults.set(results || { success: 0, errors: [] });
    } catch (error) {
      console.error('Import error:', error);
      this.importResults.set({
        success: 0,
        errors: [`Import failed: ${error}`]
      });
    } finally {
      this.isImporting.set(false);
    }
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  // Format file size for display
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Dialog actions
  onClose() {
    const results = this.importResults();
    if (results && results.success > 0) {
      this.dialogRef.close(results);
    } else {
      this.dialogRef.close(null);
    }
  }

  onCancel() {
    this.dialogRef.close(null);
  }
}