import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface CreateSuperAdminRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface CreateSuperAdminResponse {
  success: boolean;
  uid: string;
  message: string;
}

export interface UpdateUserRoleRequest {
  targetUserId: string;
  newRole: 'admin' | 'staff' | 'superadmin';
}

export interface UpdateUserRoleResponse {
  success: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private functions = inject(Functions);

  /**
   * Creates the initial superadmin user (one-time setup)
   */
  createSuperAdmin(request: CreateSuperAdminRequest): Observable<CreateSuperAdminResponse> {
    const createSuperAdmin = httpsCallable<CreateSuperAdminRequest, CreateSuperAdminResponse>(
      this.functions, 
      'createSuperAdmin'
    );
    return from(createSuperAdmin(request)).pipe(
      map(result => result.data)
    );
  }

  /**
   * Updates a user's role (superadmin only)
   */
  updateUserRole(request: UpdateUserRoleRequest): Observable<UpdateUserRoleResponse> {
    const updateUserRole = httpsCallable<UpdateUserRoleRequest, UpdateUserRoleResponse>(
      this.functions, 
      'updateUserRole'
    );
    return from(updateUserRole(request)).pipe(
      map(result => result.data)
    );
  }
}