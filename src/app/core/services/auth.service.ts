import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, user, User } from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { Observable, from, of, switchMap } from 'rxjs';
import { Router } from '@angular/router';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  roleId: 'admin' | 'staff' | 'superadmin';
  createdAt: Date;
  lastLogin?: Date;
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
  async signUp(email: string, password: string, displayName?: string): Promise<void> {
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email, password);
      
      // Create user profile in Firestore
      await this.createUserProfile(credential.user, displayName);
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
      this.router.navigate(['/auth/login']);
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    }
  }

  // Get user profile from Firestore
  private getUserProfile(uid: string): Observable<UserProfile | null> {
    const userRef = doc(this.firestore, `users/${uid}`);
    return from(getDoc(userRef)).pipe(
      switchMap(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          return of(data);
        }
        return of(null);
      })
    );
  }

  // Create user profile in Firestore
  private async createUserProfile(user: User, displayName?: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${user.uid}`);
    
    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: displayName || user.displayName || '',
      roleId: 'staff', // Default role, admin can change later
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
        return of(profile.roleId === requiredRole || profile.roleId === 'superadmin');
      })
    );
  }

  // Check if user has admin privileges
  isAdmin(): Observable<boolean> {
    return this.userProfile$.pipe(
      switchMap(profile => {
        if (!profile) return of(false);
        return of(profile.roleId === 'admin' || profile.roleId === 'superadmin');
      })
    );
  }
}