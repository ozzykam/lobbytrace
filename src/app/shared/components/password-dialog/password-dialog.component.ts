import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-password-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule
  ],
  templateUrl: './password-dialog.component.html',
  styleUrl: './password-dialog.component.scss'
})
export class PasswordDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<PasswordDialogComponent>);

  passwordForm: FormGroup;
  hidePassword = true;
  isLoading = false;
  showSuccessState = false;

  constructor() {
    this.passwordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  onSubmit() {
    if (this.passwordForm.valid) {
      const password = this.passwordForm.get('password')?.value;
      this.dialogRef.close(password);
    }
  }

  showVerificationSent() {
    this.showSuccessState = true;
  }

  closeDialog() {
    this.dialogRef.close(null);
  }

  onCancel() {
    this.dialogRef.close(null);
  }

  togglePasswordVisibility() {
    this.hidePassword = !this.hidePassword;
  }

  get password() {
    return this.passwordForm.get('password');
  }

  getErrorMessage(): string {
    const passwordControl = this.password;
    if (passwordControl?.hasError('required')) {
      return 'Password is required';
    }
    if (passwordControl?.hasError('minlength')) {
      return 'Password must be at least 6 characters';
    }
    return '';
  }
}