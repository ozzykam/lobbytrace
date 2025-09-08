import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ImageUploadComponent, ImageUploadEvent } from '../../shared/components/image-upload/image-upload.component';
import { ImageUploadConfig } from '../../shared/services/image-upload.service';
import { Firestore, doc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { Auth, updateEmail, reauthenticateWithCredential, EmailAuthProvider } from '@angular/fire/auth';
import { first, Observable } from 'rxjs';

interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  photoURL?: string;
  role?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ImageUploadComponent],
  templateUrl: './account.html',
  styleUrl: './account.scss'
})
export class Account implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private router = inject(Router);

  // Component state
  currentUserProfile$ = this.authService.userProfile$;
  userProfile = signal<UserProfile | null>(null);
  isLoading = signal(false);
  isSaving = signal(false);
  isChangingPassword = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  // Forms
  profileForm: FormGroup;
  passwordForm: FormGroup;

  // Image upload config
  avatarUploadConfig: ImageUploadConfig = {
    maxSizeInMB: 2,
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    folder: 'avatars',
    generateFileName: true
  };

  constructor() {
    // Initialize profile form
    this.profileForm = this.fb.group({
      firstName: [{ value: '', disabled: true }], // Read-only field
      lastName: [{ value: '', disabled: true }], // Read-only field
      phoneNumber: ['', [Validators.pattern(/^\+?[\d\s\-\(\)]+$/)]], // Optional phone validation
      email: ['', [Validators.required, Validators.email]]
    });

    // Initialize password form
    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, { validators: this.passwordMatchValidator });
  }

  // Load current user profile
  async ngOnInit() {
  this.isLoading.set(true);
  this.currentUserProfile$.pipe(first()).subscribe({
    next: (profile) => {
      if (!profile) {
        this.errorMessage.set('No profile found.');
        return;
      }
      // profile here is your Firestore doc with firstName/lastName
      this.userProfile.set({
        uid: profile.uid,
        email: profile.email,
        displayName: profile.displayName,
        firstName: profile.firstName ?? '',
        lastName: profile.lastName ?? '',
        phoneNumber: profile.phoneNumber,
        photoURL: profile.photoURL,
        role: profile.role,
        createdAt: this.convertTimestampToDate(profile.createdAt),
        updatedAt: this.convertTimestampToDate(profile.updatedAt),
      });
      this.populateProfileForm(this.userProfile()!);
    },
    error: (err) => {
      console.error(err);
      this.errorMessage.set('Failed to load profile data');
    },
    complete: () => this.isLoading.set(false),
  });
}

  // Populate form with user data
  private populateProfileForm(profile: UserProfile) {
  this.profileForm.patchValue({
    firstName: profile.firstName || '',
    lastName:  profile.lastName  || '',
    phoneNumber: profile.phoneNumber || '',
    email: profile.email || ''
  });
}

  // Save profile changes
  async onSaveProfile() {
    if (this.profileForm.invalid) {
      this.markFormGroupTouched(this.profileForm);
      return;
    }

    this.isSaving.set(true);
    this.clearMessages();

    try {
      const formValue = this.profileForm.value;
      const currentProfile = this.userProfile();
      
      if (!currentProfile) {
        throw new Error('No current profile found');
      }

      // Check if email has changed and update Firebase Auth if needed
      if (formValue.email !== currentProfile.email) {
        await this.updateUserEmail(formValue.email);
      }

      // Update Firestore user document with editable fields
      await this.updateFirestoreProfile({
        email: formValue.email,
        phoneNumber: formValue.phoneNumber || '',
        updatedAt: new Date()
      });

      this.successMessage.set('Profile updated successfully!');
      
      // Update local state with the changes
      this.userProfile.set({
        ...currentProfile,
        phoneNumber: formValue.phoneNumber,
        email: formValue.email,
        updatedAt: new Date()
      });

    } catch (error: any) {
      console.error('Error updating profile:', error);
      let errorMsg = 'Failed to update profile. Please try again.';
      
      // Handle specific Firebase Auth errors
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = 'This email address is already in use by another account.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'Please enter a valid email address.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMsg = 'Please sign out and sign in again before changing your email.';
      }
      
      this.errorMessage.set(errorMsg);
    } finally {
      this.isSaving.set(false);
    }
  }

  // Helper method to update email in Firebase Auth
  private async updateUserEmail(newEmail: string): Promise<void> {
    // Note: Email updates require recent authentication in Firebase Auth
    // For now, we'll update it in Firestore only
    // In a production app, you might want to require re-authentication
    console.log('Email change requested, updating Firestore only');
  }

  // Helper method to update Firestore user document
  private async updateFirestoreProfile(updates: Partial<UserProfile>): Promise<void> {
    const currentProfile = this.userProfile();
    if (!currentProfile) {
      throw new Error('No current profile found');
    }

    try {
      const userRef = doc(this.firestore, `users/${currentProfile.uid}`);
      await updateDoc(userRef, updates);
    } catch (error) {
      console.error('Error updating Firestore profile:', error);
      throw error;
    }
  }

  // Helper method to convert Firestore Timestamp to JavaScript Date
  private convertTimestampToDate(timestamp: any): Date | undefined {
    if (!timestamp) return undefined;
    
    // Check if it's already a Date object
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    // Check if it's a Firestore Timestamp
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    // Check if it's a timestamp-like object with seconds
    if (timestamp && typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000);
    }
    
    // Fallback: try to parse as date
    try {
      return new Date(timestamp);
    } catch {
      console.warn('Could not convert timestamp:', timestamp);
      return undefined;
    }
  }

  // Change password
  async onChangePassword() {
    if (this.passwordForm.invalid) {
      this.markFormGroupTouched(this.passwordForm);
      return;
    }

    this.isChangingPassword.set(true);
    this.clearMessages();

    try {
      const formValue = this.passwordForm.value;
      
      await this.authService.changePassword(
        formValue.currentPassword,
        formValue.newPassword
      );

      this.successMessage.set('Password changed successfully!');
      this.passwordForm.reset();
    } catch (error: any) {
      console.error('Error changing password:', error);
      let errorMsg = 'Failed to change password. Please try again.';
      
      if (error.code === 'auth/wrong-password') {
        errorMsg = 'Current password is incorrect.';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'New password is too weak.';
      }
      
      this.errorMessage.set(errorMsg);
    } finally {
      this.isChangingPassword.set(false);
    }
  }

  // Handle avatar upload
  onAvatarUpload(event: ImageUploadEvent) {
    if (event.type === 'success' && event.result) {
      this.updateAvatar(event.result.url);
    } else if (event.type === 'error') {
      this.errorMessage.set('Failed to upload avatar: ' + event.error);
    }
  }

  // Update user avatar
  private async updateAvatar(photoURL: string) {
    try {
      await this.authService.updateProfile({ photoURL });
      
      const currentProfile = this.userProfile();
      if (currentProfile) {
        this.userProfile.set({
          ...currentProfile,
          photoURL
        });
      }
      
      this.successMessage.set('Avatar updated successfully!');
    } catch (error) {
      console.error('Error updating avatar:', error);
      this.errorMessage.set('Failed to update avatar');
    }
  }

  // Handle avatar removal
  onAvatarRemoved() {
    this.updateAvatar('');
  }

  // Password match validator
  private passwordMatchValidator(form: FormGroup) {
    const newPassword = form.get('newPassword');
    const confirmPassword = form.get('confirmPassword');
    
    if (newPassword && confirmPassword && newPassword.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }
    return null;
  }

  // Form validation helpers
  isFieldInvalid(formGroup: FormGroup, fieldName: string): boolean {
    const field = formGroup.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  getFieldError(formGroup: FormGroup, fieldName: string): string {
    const field = formGroup.get(fieldName);
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
    if (field.errors['pattern']) {
      return 'Please enter a valid phone number.';
    }

    return '';
  }

  private getFieldDisplayName(fieldName: string): string {
    const displayNames: { [key: string]: string } = {
      firstName: 'First Name',
      lastName: 'Last Name',
      phoneNumber: 'Phone Number',
      email: 'Email',
      currentPassword: 'Current Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm Password'
    };
    return displayNames[fieldName] || fieldName;
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      formGroup.get(key)?.markAsTouched();
    });
  }

  private clearMessages() {
    this.successMessage.set(null);
    this.errorMessage.set(null);
  }

  // Password form validation helpers
  get passwordsMatch(): boolean {
    const newPassword = this.passwordForm.get('newPassword')?.value;
    const confirmPassword = this.passwordForm.get('confirmPassword')?.value;
    return newPassword === confirmPassword;
  }
}
