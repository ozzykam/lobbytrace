import { Injectable, inject } from '@angular/core';
import { 
  Auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  user, 
  User, 
  updateProfile as firebaseUpdateProfile, 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider 
} from '@angular/fire/auth';

import { Firestore, doc, setDoc, getDoc, updateDoc } from '@angular/fire/firestore';
import { Observable, from, of, switchMap } from 'rxjs';
import { Router } from '@angular/router';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  photoURL?: string;
  role: 'admin' | 'staff' | 'superAdmin';
  createdAt: Date;
  lastLogin?: Date;
  updatedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private router = inject(Router);

  // Observable of current user
  user$ = user(this.auth);
  
  // Observable of current user profile with role data
  userProfile$ = this.user$.pipe(
    switchMap(user => {
      if (!user) return of(null);
      return this.getUserProfile(user.uid);
    })
  );

  constructor() {}

  // Sign in with email and password
  async signIn(email: string, password: string): Promise<void> {
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, password);
      await this.updateLastLogin(credential.user.uid);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  }

  // Sign up new user with email and password
  async signUp(email: string, password: string, firstName: string, lastName: string, displayName?: string,): Promise<void> {
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email, password);
      
      // Create user profile in Firestore
      await this.createUserProfile(credential.user, firstName, lastName, displayName);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  // Get user profile from Firestore
  private getUserProfile(uid: string): Observable<UserProfile | null> {
    return from(this.getDocAsync(uid)).pipe(
      switchMap(data => of(data))
    );
  }

  // Helper method to handle Firestore call with proper injection context
  private async getDocAsync(uid: string): Promise<UserProfile | null> {
    try {
      const userRef = doc(this.firestore, `users/${uid}`);
      const docSnap = await getDoc(userRef);
      
      if (docSnap.exists()) {
        return docSnap.data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Create user profile in Firestore
  private async createUserProfile(user: User, firstName: string, lastName: string, displayName?: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    
    // Parse displayName into firstName and lastName
    const fullName = displayName || user.displayName || '';
    const nameParts = fullName.split(' ');
    
    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: fullName,
      firstName: firstName,
      lastName: lastName,
      role: 'staff', // Changed from roleId to role for consistency
      createdAt: new Date(),
      lastLogin: new Date()
    };

    await setDoc(userRef, userProfile);
  }

  // Update last login timestamp
  private async updateLastLogin(uid: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${uid}`);
    await setDoc(userRef, { lastLogin: new Date() }, { merge: true });
  }

  // Check if user is authenticated
  isAuthenticated(): Observable<boolean> {
    return this.user$.pipe(
      switchMap(user => of(!!user))
    );
  }

  // Check if user has specific role
  hasRole(requiredRole: string): Observable<boolean> {
    return this.userProfile$.pipe(
      switchMap(profile => {
        if (!profile) return of(false);
        return of(profile.role === requiredRole || profile.role === 'superAdmin');
      })
    );
  }

  // Check if user has admin privileges
  isAdmin(): Observable<boolean> {
    return this.userProfile$.pipe(
      switchMap(profile => {
        if (!profile) return of(false);
        return of(profile.role === 'admin' || profile.role === 'superAdmin');
      })
    );
  }

  // Update user profile (displayName, photoURL)
  async updateProfile(profileData: { displayName?: string; photoURL?: string }): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user found');
    }

    try {
      // Update Firebase Auth profile
      await firebaseUpdateProfile(currentUser, profileData);

      // Update Firestore user document if displayName is provided
      if (profileData.displayName) {
        const userRef = doc(this.firestore, `users/${currentUser.uid}`);
        await setDoc(userRef, { 
          displayName: profileData.displayName,
          updatedAt: new Date()
        }, { merge: true });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  // Change user password
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('No authenticated user found');
    }

    try {
      // Re-authenticate user with current password
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      // Update password
      await updatePassword(currentUser, newPassword);

      // Update Firestore timestamp
      const userRef = doc(this.firestore, `users/${currentUser.uid}`);
      await setDoc(userRef, { 
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  }

  // Sync Firestore user data with current Firebase Auth user data
  async syncUserProfile(): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user found');
    }

    try {
      // Force reload the Firebase Auth user to get latest data
      await currentUser.reload();
      
      const userRef = doc(this.firestore, `users/${currentUser.uid}`);
      
      // Update Firestore with current Firebase Auth data
      await updateDoc(userRef, {
        email: currentUser.email || '',
        displayName: currentUser.displayName || '',
        photoURL: currentUser.photoURL || '',
        updatedAt: new Date()
      });

      console.log('User profile synced successfully');
    } catch (error) {
      console.error('Error syncing user profile:', error);
      throw error;
    }
  }
}