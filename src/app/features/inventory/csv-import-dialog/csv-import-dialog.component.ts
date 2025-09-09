import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CsvInventoryImportService, ImportProgress } from '../../../core/services/csv-inventory-import.service';
import { CsvInventoryRow } from '../../../shared/models/product.models';


@Component({
  selector: 'app-csv-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule
  ],
  templateUrl: './csv-import-dialog.component.html',
  styleUrl: './csv-import-dialog.component.scss'
})
export class CsvImportDialogComponent {
  private dialogRef = inject(MatDialogRef<CsvImportDialogComponent>);
  private csvImportService = inject(CsvInventoryImportService);
  private snackBar = inject(MatSnackBar);

  // Signals for component state
  csvData = signal<CsvInventoryRow[]>([]);
  isDragOver = signal(false);
  isImporting = signal(false);
  importProgress = signal<ImportProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    current: ''
  });

  // Table configuration
  previewColumns = ['name', 'category', 'vendor', 'cost', 'packaging'];
  previewData = signal<CsvInventoryRow[]>([]);

  ngOnInit() {
    // Limit preview to first 10 items for performance
    this.previewData.set(this.csvData().slice(0, 10));
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.processFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragOver.set(false);
    
    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      this.processFile(event.dataTransfer.files[0]);
    }
  }

  private async processFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.snackBar.open('Please select a CSV file', 'Close', { duration: 3000 });
      return;
    }

    try {
      const content = await this.readFileContent(file);
      const parsedData = this.csvImportService.parseCsvContent(content);
      
      if (parsedData.length === 0) {
        this.snackBar.open('No valid data found in CSV file', 'Close', { duration: 5000 });
        return;
      }

      this.csvData.set(parsedData);
      this.previewData.set(parsedData.slice(0, 10));
      
      this.snackBar.open(`Loaded ${parsedData.length} items from CSV`, 'Close', { duration: 3000 });
    } catch (error) {
      console.error('Error processing CSV file:', error);
      this.snackBar.open('Error reading CSV file. Please check the format.', 'Close', { duration: 5000 });
    }
  }

  private readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  }

  async onImport() {
    const data = this.csvData();
    if (data.length === 0) return;

    this.isImporting.set(true);

    // Subscribe to progress updates from the service
    const progressSubscription = this.csvImportService.progress$.subscribe(
      (progress: ImportProgress) => {
        this.importProgress.set(progress);
      }
    );

    try {
      const importedIds = await this.csvImportService.importInventoryFromCsv(data).toPromise();
      
      const completed = importedIds?.length || 0;
      const failed = data.length - completed;

      // Show completion message
      const successMessage = failed === 0 
        ? `Successfully imported ${completed} items`
        : `Import completed: ${completed} successful, ${failed} failed`;
      
      this.snackBar.open(successMessage, 'Close', { duration: 5000 });
      
      // Close dialog after successful import
      setTimeout(() => {
        this.dialogRef.close(true);
      }, 2000);

    } catch (error) {
      console.error('Import error:', error);
      this.snackBar.open('Import failed. Please try again.', 'Close', { duration: 5000 });
      this.isImporting.set(false);
    } finally {
      progressSubscription.unsubscribe();
    }
  }

  onReset() {
    this.csvData.set([]);
    this.previewData.set([]);
    this.importProgress.set({
      total: 0,
      completed: 0,
      failed: 0,
      current: ''
    });
  }

  onCancel() {
    this.dialogRef.close(false);
  }
}