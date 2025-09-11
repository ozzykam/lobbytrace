import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatStepperModule } from '@angular/material/stepper';
import { SquareIntegrationService, SquareConfig } from '../../../core/services/square-integration.service';
import { SquareWebhookService } from '../../../core/services/square-webhook.service';

@Component({
  selector: 'app-square-config-dialog',
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
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatStepperModule
  ],
  templateUrl: './square-config-dialog.component.html',
  styleUrl: './square-config-dialog.component.scss'
})
export class SquareConfigDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<SquareConfigDialogComponent>);
  private fb = inject(FormBuilder);
  private squareService = inject(SquareIntegrationService);
  private webhookService = inject(SquareWebhookService);
  private snackBar = inject(MatSnackBar);

  // Component state
  isLoading = signal(false);
  isTesting = signal(false);
  isConfigValid = signal(false);
  availableLocations = signal<any[]>([]);
  currentStep = signal(0);

  // Form groups for each step
  credentialsForm: FormGroup;
  locationForm: FormGroup;
  settingsForm: FormGroup;

  // Environment options
  environments = [
    { value: 'sandbox', label: 'Sandbox (Testing)', description: 'Use for testing and development' },
    { value: 'production', label: 'Production (Live)', description: 'Use for live transactions' }
  ];

  // Sync frequency options
  syncFrequencies = [
    { value: 'realtime', label: 'Real-time', description: 'Immediate updates via webhooks' },
    { value: 'hourly', label: 'Hourly', description: 'Sync every hour' },
    { value: 'daily', label: 'Daily', description: 'Sync once per day' }
  ];

  constructor() {
    this.credentialsForm = this.fb.group({
      applicationId: ['', [Validators.required, Validators.minLength(10)]],
      accessToken: ['', [Validators.required, Validators.minLength(20)]],
      environment: ['sandbox', Validators.required]
    });

    this.locationForm = this.fb.group({
      locationId: ['', Validators.required]
    });

    this.settingsForm = this.fb.group({
      autoSyncEnabled: [true],
      syncFrequency: ['realtime', Validators.required],
      webhookSignatureKey: ['']
    });
  }

  ngOnInit() {
    this.loadExistingConfig();
  }

  private async loadExistingConfig() {
    try {
      this.isLoading.set(true);
      const config = await this.squareService.getSquareConfig().toPromise();
      
      if (config) {
        this.credentialsForm.patchValue({
          applicationId: config.applicationId,
          accessToken: config.accessToken,
          environment: config.environment
        });

        this.locationForm.patchValue({
          locationId: config.locationId
        });

        this.settingsForm.patchValue({
          autoSyncEnabled: config.autoSyncEnabled,
          syncFrequency: config.syncFrequency,
          webhookSignatureKey: config.webhookSignatureKey
        });

        // Auto-advance to location step if credentials are present
        if (config.applicationId && config.accessToken) {
          await this.testConnection();
          if (this.isConfigValid()) {
            this.currentStep.set(1);
            await this.loadLocations();
          }
        }
      }
    } catch (error) {
      console.error('Error loading Square config:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  async testConnection() {
    if (this.credentialsForm.invalid) {
      this.markFormGroupTouched(this.credentialsForm);
      return;
    }

    this.isTesting.set(true);
    
    try {
      const formValue = this.credentialsForm.value;
      const testConfig: SquareConfig = {
        ...formValue,
        locationId: '',
        autoSyncEnabled: false,
        syncFrequency: 'realtime' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: ''
      };

      const isValid = await this.squareService.testConnection(testConfig).toPromise();
      this.isConfigValid.set(!!isValid); // Ensure boolean value

      if (isValid) {
        this.snackBar.open('Connection successful!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        await this.loadLocations();
      } else {
        this.snackBar.open('Connection failed. Please check your credentials.', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      this.isConfigValid.set(false);
      this.snackBar.open('Connection test failed. Please verify your credentials.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isTesting.set(false);
    }
  }

  private async loadLocations() {
    if (!this.isConfigValid()) return;

    try {
      const formValue = this.credentialsForm.value;
      const testConfig: SquareConfig = {
        ...formValue,
        locationId: '',
        autoSyncEnabled: false,
        syncFrequency: 'realtime' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: ''
      };

      const locations = await this.squareService.getSquareLocations(testConfig).toPromise();
      this.availableLocations.set(locations || []);

      // Auto-select if only one location
      if (locations && locations.length === 1) {
        this.locationForm.patchValue({
          locationId: locations[0].id
        });
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      this.snackBar.open('Failed to load Square locations.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    }
  }

  nextStep() {
    const currentStepValue = this.currentStep();
    
    switch (currentStepValue) {
      case 0: // Credentials step
        if (this.credentialsForm.valid && this.isConfigValid()) {
          this.currentStep.set(1);
        } else {
          this.markFormGroupTouched(this.credentialsForm);
          if (!this.isConfigValid()) {
            this.snackBar.open('Please test the connection first.', 'Close', { duration: 3000 });
          }
        }
        break;
      
      case 1: // Location step
        if (this.locationForm.valid) {
          this.currentStep.set(2);
        } else {
          this.markFormGroupTouched(this.locationForm);
        }
        break;
    }
  }

  previousStep() {
    const currentStepValue = this.currentStep();
    if (currentStepValue > 0) {
      this.currentStep.set(currentStepValue - 1);
    }
  }

  async saveConfiguration() {
    if (!this.isAllFormsValid()) {
      this.snackBar.open('Please complete all required fields.', 'Close', { duration: 3000 });
      return;
    }

    this.isLoading.set(true);

    try {
      const config = {
        ...this.credentialsForm.value,
        ...this.locationForm.value,
        ...this.settingsForm.value
      };

      // Save the Square configuration
      await this.squareService.saveSquareConfig(config).toPromise();
      
      // Set up webhooks if real-time sync is enabled
      if (config.syncFrequency === 'realtime') {
        try {
          await this.webhookService.createWebhookSubscription(config);
          this.snackBar.open('Square configuration and webhooks set up successfully!', 'Close', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });
        } catch (webhookError) {
          console.error('Webhook setup failed:', webhookError);
          this.snackBar.open('Configuration saved, but webhook setup failed. Real-time sync may not work properly.', 'Close', {
            duration: 5000,
            panelClass: ['warning-snackbar']
          });
        }
      } else {
        this.snackBar.open('Square configuration saved successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving Square config:', error);
      this.snackBar.open('Failed to save configuration. Please try again.', 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  onCancel() {
    this.dialogRef.close(false);
  }

  isAllFormsValid(): boolean {
    return this.credentialsForm.valid && 
           this.locationForm.valid && 
           this.settingsForm.valid && 
           this.isConfigValid();
  }

  getSelectedLocation(): any {
    const locationId = this.locationForm.get('locationId')?.value;
    return this.availableLocations().find(l => l.id === locationId);
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  getLocationDisplayName(location: any): string {
    return `${location.name} (${location.address?.locality || 'Unknown City'})`;
  }

  getStepStatus(stepIndex: number): 'completed' | 'current' | 'pending' {
    const current = this.currentStep();
    if (stepIndex < current) return 'completed';
    if (stepIndex === current) return 'current';
    return 'pending';
  }

  getEnvironmentIcon(env: string): string {
    return env === 'production' ? 'verified' : 'science';
  }

  getSyncIcon(frequency: string): string {
    switch (frequency) {
      case 'realtime': return 'sync';
      case 'hourly': return 'schedule';
      case 'daily': return 'today';
      default: return 'sync';
    }
  }
}