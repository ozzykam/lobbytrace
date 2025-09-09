import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ImageUploadComponent, ImageUploadEvent } from '../../shared/components/image-upload/image-upload.component';
import { ImageUploadConfig } from '../../shared/services/image-upload.service';
import { Firestore, doc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { Auth, reauthenticateWithCredential, EmailAuthProvider, verifyBeforeUpdateEmail } from '@angular/fire/auth';
import { MatDialog } from '@angular/material/dialog';
import { PasswordDialogComponent } from '../../shared/components/password-dialog/password-dialog.component';
import { first, Observable, Subscription } from 'rxjs';

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
export class Account implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  // Component state
  currentUserProfile$ = this.authService.userProfile$;
  userProfile = signal<UserProfile | null>(null);
  isLoading = signal(false);
  isSaving = signal(false);
  isChangingPassword = signal(false);
  successMessage = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  
  // Subscription management
  private authSubscription?: Subscription;
  private visibilitySubscription?: Subscription;
  private periodicCheckInterval?: ReturnType<typeof setInterval>;

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
    this.setupVisibilityListener();
    this.setupPeriodicCheck();
    
    await this.loadUserProfile();
  }

  ngOnDestroy() {
    // Clean up subscriptions and intervals
    this.authSubscription?.unsubscribe();
    this.visibilitySubscription?.unsubscribe();
    if (this.periodicCheckInterval) {
      clearInterval(this.periodicCheckInterval);
    }
  }

  // Set up automatic sync when user returns to the page
  private setupVisibilityListener() {
    // Listen for page visibility changes
    if (typeof document !== 'undefined') {
      this.visibilitySubscription = new Observable<boolean>(subscriber => {
        const handleVisibilityChange = () => {
          subscriber.next(!document.hidden);
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
      }).subscribe(async (isVisible) => {
        if (isVisible && !this.isLoading()) {
          // Auto-sync when page becomes visible (user returns from email)
          await this.autoSyncProfile();
        }
      });
    }
  }

  // Set up periodic check for email changes (backup method)
  private setupPeriodicCheck() {
    // Check every 5 seconds when on the account page
    this.periodicCheckInterval = setInterval(async () => {
      if (!document.hidden && !this.isLoading()) {
        await this.autoSyncProfile();
      }
    }, 5000);
  }

  // Automatic profile sync (silent, no success message)
  private async autoSyncProfile() {
    try {
      const currentUser = this.auth.currentUser;
      if (!currentUser) return;
      
      // Check if email was verified by comparing Auth vs Firestore
      const currentProfile = this.userProfile();
      if (currentProfile && currentUser.email !== currentProfile.email) {
        console.log('Email change detected, syncing profile...');
        await this.authService.syncUserProfile();
        await this.loadUserProfile();
      }
    } catch (error) {
      console.error('Auto-sync error:', error);
      // Silent fail - don't show error to user for auto-sync
    }
  }

  // Method to load/reload user profile data
  private async loadUserProfile() {
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

      // Always update phone number first (since it doesn't require verification)
      const phoneChanged = formValue.phoneNumber !== currentProfile.phoneNumber;
      if (phoneChanged) {
        await this.updateFirestoreProfile({
          phoneNumber: formValue.phoneNumber || '',
          updatedAt: new Date()
        });
      }

      // Then check if email has changed and handle separately
      const emailChanged = formValue.email !== currentProfile.email;
      if (emailChanged) {
        try {
          await this.updateUserEmail(formValue.email);
          // If we reach here, email was updated without verification
          await this.updateFirestoreProfile({
            email: formValue.email,
            updatedAt: new Date()
          });
        } catch (error: any) {
          if (error.message === 'VERIFICATION_EMAIL_SENT') {
            // Show the verification dialog instead of success message
            if (phoneChanged) {
              this.successMessage.set('Phone number updated! Verification email sent for email change - please check your inbox.');
            } else {
              this.showVerificationSentDialog();
            }
            return; // Don't show general success message
          } else {
            throw error; // Re-throw other errors
          }
        }
      }

      // Show success message for completed updates
      if (phoneChanged && !emailChanged) {
        this.successMessage.set('Phone number updated successfully!');
      } else if (!phoneChanged && !emailChanged) {
        this.successMessage.set('No changes to save.');
      } else {
        this.successMessage.set('Profile updated successfully!');
      }
      
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
    const currentUser = this.auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('No authenticated user found');
    }

    // Open password dialog to get user's current password
    const password = await this.promptForPassword();
    if (!password) {
      throw new Error('Password verification cancelled');
    }

    try {
      // Re-authenticate the user
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);

      // Send verification email to the new email address
      await verifyBeforeUpdateEmail(currentUser, newEmail);
      
      console.log('Verification email sent to new address');
      
      // Throw a special error to indicate verification email was sent
      throw new Error('VERIFICATION_EMAIL_SENT');
    } catch (error: any) {
      console.error('Error updating email in Firebase Auth:', error);
      
      // Handle the verification email sent case
      if (error.message === 'VERIFICATION_EMAIL_SENT') {
        throw error;
      }
      
      // Re-throw with user-friendly message
      if (error.code === 'auth/wrong-password') {
        throw new Error('Incorrect password. Please try again.');
      } else if (error.code === 'auth/email-already-in-use') {
        throw new Error('This email address is already in use by another account.');
      } else if (error.code === 'auth/invalid-email') {
        throw new Error('Please enter a valid email address.');
      } else if (error.code === 'auth/requires-recent-login') {
        throw new Error('Session expired. Please sign out and sign in again.');
      } else {
        throw error;
      }
    }
  }

  // Helper method to prompt user for their current password using Material Dialog
  private async promptForPassword(): Promise<string | null> {
    return new Promise((resolve) => {
      const dialogRef = this.dialog.open(PasswordDialogComponent, {
        width: '450px',
        disableClose: true,
        autoFocus: true,
        restoreFocus: true
      });

      dialogRef.afterClosed().subscribe(result => {
        resolve(result || null);
      });
    });
  }

  // Helper method to show verification email sent dialog
  private showVerificationSentDialog(): void {
    const dialogRef = this.dialog.open(PasswordDialogComponent, {
      width: '450px',
      disableClose: true,
      autoFocus: true,
      restoreFocus: true
    });

    // Switch to success state immediately
    dialogRef.componentInstance.showVerificationSent();
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

  // Public method to refresh profile data
  async refreshProfile() {
    this.clearMessages();
    
    try {
      // First sync Firestore with Firebase Auth data
      await this.authService.syncUserProfile();
      // Then reload the profile data
      await this.loadUserProfile();
      this.successMessage.set('Profile data refreshed successfully!');
    } catch (error) {
      console.error('Error refreshing profile:', error);
      this.errorMessage.set('Failed to refresh profile data. Please try again.');
    }
  }

  // Password form validation helpers
  get passwordsMatch(): boolean {
    const newPassword = this.passwordForm.get('newPassword')?.value;
    const confirmPassword = this.passwordForm.get('confirmPassword')?.value;
    return newPassword === confirmPassword;
  }
}
