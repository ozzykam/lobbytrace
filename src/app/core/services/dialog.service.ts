import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { Observable } from 'rxjs';

export interface ConfirmationDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger' | 'success';
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  private dialog = inject(MatDialog);

  /**
   * Opens a generic dialog with the specified component
   * @param component The component to open in the dialog
   * @param data Data to pass to the dialog component
   * @param config Optional dialog configuration
   * @returns Observable that emits the dialog result when closed
   */
  openDialog<T, D = any, R = any>(
    component: ComponentType<T>,
    data?: D,
    config?: {
      width?: string;
      height?: string;
      maxWidth?: string;
      maxHeight?: string;
      disableClose?: boolean;
      panelClass?: string | string[];
    }
  ): Observable<R> {
    const dialogRef = this.dialog.open(component, {
      width: config?.width || '400px',
      maxWidth: config?.maxWidth || '90vw',
      maxHeight: config?.maxHeight || '90vh',
      height: config?.height,
      disableClose: config?.disableClose || false,
      panelClass: config?.panelClass || 'custom-dialog',
      data
    });

    return dialogRef.afterClosed();
  }

  /**
   * Opens a confirmation dialog
   * @param data Configuration for the confirmation dialog
   * @returns Observable that emits true if confirmed, false if cancelled
   */
  openConfirmationDialog(data: ConfirmationDialogData): Observable<boolean> {
    return this.openDialog(ConfirmationDialogComponent, data, {
      width: '400px',
      panelClass: ['custom-dialog', 'confirmation-dialog']
    });
  }

  /**
   * Opens a simple alert dialog
   * @param title Dialog title
   * @param message Dialog message
   * @param type Dialog type for styling
   */
  openAlertDialog(
    title: string, 
    message: string, 
    type: 'info' | 'warning' | 'error' | 'success' = 'info'
  ): Observable<void> {
    return this.openDialog(AlertDialogComponent, { title, message, type }, {
      width: '400px',
      panelClass: ['custom-dialog', 'alert-dialog', `alert-${type}`]
    });
  }

  /**
   * Closes all open dialogs
   */
  closeAll(): void {
    this.dialog.closeAll();
  }

  /**
   * Gets the number of open dialogs
   * @returns Number of currently open dialogs
   */
  getOpenDialogCount(): number {
    return this.dialog.openDialogs.length;
  }
}

// Confirmation Dialog Component
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <div class="confirmation-dialog">
      <h2 mat-dialog-title class="dialog-title">
        <span class="material-icons dialog-icon" [class]="'icon-' + (data.type || 'info')">
          {{ getIcon() }}
        </span>
        {{ data.title }}
      </h2>
      
      <mat-dialog-content class="dialog-content">
        <p>{{ data.message }}</p>
      </mat-dialog-content>
      
      <mat-dialog-actions class="dialog-actions">
        <button 
          mat-button 
          (click)="onCancel()"
          class="btn btn-outline cancel-btn"
        >
          {{ data.cancelText || 'Cancel' }}
        </button>
        <button 
          mat-button 
          (click)="onConfirm()"
          class="btn btn-primary confirm-btn"
          [class]="'btn-' + (data.type || 'primary')"
        >
          {{ data.confirmText || 'Confirm' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .confirmation-dialog {
      .dialog-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
        color: var(--color-text-primary);
        
        .dialog-icon {
          font-size: 24px;
          
          &.icon-info { color: var(--color-primary); }
          &.icon-warning { color: var(--color-warning); }
          &.icon-danger { color: var(--color-error); }
          &.icon-success { color: var(--color-accent); }
        }
      }
      
      .dialog-content {
        margin-bottom: 1.5rem;
        
        p {
          margin: 0;
          color: var(--color-text-secondary);
          line-height: 1.5;
        }
      }
      
      .dialog-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: flex-end;
        margin: 0 -24px -24px -24px;
        padding: 1rem 24px;
        border-top: 1px solid var(--color-border);
        
        .btn {
          min-width: 80px;
        }
        
        .btn-danger {
          background-color: var(--color-error);
          color: var(--color-text-inverse);
          border-color: var(--color-error);
          
          &:hover {
            background-color: var(--color-error-dark);
          }
        }
      }
    }
  `]
})
export class ConfirmationDialogComponent {
  private dialogRef = inject(MatDialogRef<ConfirmationDialogComponent>);
  data = inject(MAT_DIALOG_DATA) as ConfirmationDialogData;

  getIcon(): string {
    switch (this.data.type) {
      case 'warning': return 'warning';
      case 'danger': return 'error';
      case 'success': return 'check_circle';
      default: return 'info';
    }
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}

// Alert Dialog Component
@Component({
  selector: 'app-alert-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <div class="alert-dialog">
      <h2 mat-dialog-title class="dialog-title">
        <span class="material-icons dialog-icon" [class]="'icon-' + data.type">
          {{ getIcon() }}
        </span>
        {{ data.title }}
      </h2>
      
      <mat-dialog-content class="dialog-content">
        <p>{{ data.message }}</p>
      </mat-dialog-content>
      
      <mat-dialog-actions class="dialog-actions">
        <button 
          mat-button 
          (click)="onClose()"
          class="btn btn-primary"
        >
          OK
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .alert-dialog {
      .dialog-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
        color: var(--color-text-primary);
        
        .dialog-icon {
          font-size: 24px;
          
          &.icon-info { color: var(--color-primary); }
          &.icon-warning { color: var(--color-warning); }
          &.icon-error { color: var(--color-error); }
          &.icon-success { color: var(--color-accent); }
        }
      }
      
      .dialog-content {
        margin-bottom: 1.5rem;
        
        p {
          margin: 0;
          color: var(--color-text-secondary);
          line-height: 1.5;
        }
      }
      
      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        margin: 0 -24px -24px -24px;
        padding: 1rem 24px;
        border-top: 1px solid var(--color-border);
      }
    }
  `]
})
export class AlertDialogComponent {
  private dialogRef = inject(MatDialogRef<AlertDialogComponent>);
  data = inject(MAT_DIALOG_DATA) as { title: string; message: string; type: string };

  getIcon(): string {
    switch (this.data.type) {
      case 'warning': return 'warning';
      case 'error': return 'error';
      case 'success': return 'check_circle';
      default: return 'info';
    }
  }

  onClose(): void {
    this.dialogRef.close();
  }
}