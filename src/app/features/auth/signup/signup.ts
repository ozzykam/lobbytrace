import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AdminService } from '../../../core/services/admin.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.scss'
})
export class Signup {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private adminService = inject(AdminService);
  private router = inject(Router);

  signupForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  isCreatingSuperAdmin = false;

  constructor() {
    this.signupForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      agreesToTerms: [false, [Validators.requiredTrue]],
      createAsAdmin: [false] // Toggle for superadmin creation
    }, { validators: this.passwordMatchValidator });
  }

  // Custom validator to check if passwords match
  private passwordMatchValidator(form: FormGroup) {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }
    return null;
  }

  get f() {
    return this.signupForm.controls;
  }

  get passwordsMatch(): boolean {
    const password = this.signupForm.get('password')?.value;
    const confirmPassword = this.signupForm.get('confirmPassword')?.value;
    return password === confirmPassword;
  }

  onToggleAdminCreation() {
    this.isCreatingSuperAdmin = this.signupForm.get('createAsAdmin')?.value || false;
    this.errorMessage = '';
  }

  async onSubmit() {
    if (this.signupForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const formValue = this.signupForm.value;
      
      if (this.isCreatingSuperAdmin) {
        // Create superadmin via Cloud Function
        const response = await this.adminService.createSuperAdmin({
          email: formValue.email,
          password: formValue.password,
          firstName: formValue.firstName,
          lastName: formValue.lastName
        }).toPromise();

        if (response?.success) {
          // Sign in the newly created superadmin
          await this.authService.signIn(formValue.email, formValue.password);
        }
      } else {
        // Regular user signup - use firstName as displayName
        await this.authService.signUp(
          formValue.email, 
          formValue.password, 
          formValue.firstName,
          formValue.lastName
        );
      }

      // Navigation is handled by AuthService
    } catch (error: any) {
      console.error('Signup error:', error);
      this.errorMessage = this.getErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  private markFormGroupTouched() {
    Object.keys(this.signupForm.controls).forEach(key => {
      this.signupForm.get(key)?.markAsTouched();
    });
  }

  private getErrorMessage(error: any): string {
    // Handle Firebase Auth errors
    if (error.code) {
      switch (error.code) {
        case 'auth/email-already-in-use':
          return 'An account with this email already exists.';
        case 'auth/weak-password':
          return 'Password should be at least 6 characters long.';
        case 'auth/invalid-email':
          return 'Please enter a valid email address.';
        case 'auth/operation-not-allowed':
          return 'Email/password accounts are not enabled. Please contact support.';
        default:
          return 'An error occurred during signup. Please try again.';
      }
    }

    // Handle Cloud Function errors
    if (error.message) {
      if (error.message.includes('superadmin user already exists')) {
        return 'A superadmin user already exists. Please sign up as a regular user instead.';
      }
      return error.message;
    }

    return 'An unexpected error occurred. Please try again.';
  }

  // Helper methods for form validation display
  isFieldInvalid(fieldName: string): boolean {
    const field = this.signupForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(fieldName: string): string {
    const field = this.signupForm.get(fieldName);
    if (!field || !field.errors || !field.touched) return '';

    if (field.errors['required']) {
      return `${this.getFieldDisplayName(fieldName)} is required.`;
    }
    if (field.errors['email']) {
      return 'Please enter a valid email address.';
    }
    if (field.errors['minlength']) {
      const requiredLength = field.errors['minlength'].requiredLength;
      return `${this.getFieldDisplayName(fieldName)} must be at least ${requiredLength} characters.`;
    }

    return '';
  }

  private getFieldDisplayName(fieldName: string): string {
    const displayNames: { [key: string]: string } = {
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password',
      firstName: 'First Name',
      lastName: 'Last Name',
      agreesToTerms: 'Terms agreement'
    };
    return displayNames[fieldName] || fieldName;
  }
}
