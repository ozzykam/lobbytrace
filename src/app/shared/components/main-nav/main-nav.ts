import { Component, inject, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-main-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './main-nav.html',
  styleUrl: './main-nav.scss'
})
export class MainNav {
  private authService = inject(AuthService);
  private router = inject(Router);

  @Output() mobileMenuToggle = new EventEmitter<void>();

  // Observable to check if user is authenticated
  isAuthenticated$ = this.authService.isAuthenticated();
  userProfile$ = this.authService.userProfile$;

  // Navigation links for marketing/public pages
  publicNavLinks = [
    { path: '/', label: 'Home', exact: true },
    { path: '/features', label: 'Features' },
    { path: '/pricing', label: 'Pricing' },
    { path: '/about', label: 'About' }
  ];

  // Navigation links for authenticated users
  appNavLinks = [
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/inventory', label: 'Inventory' },
    { path: '/products', label: 'Products' },
    { path: '/orders', label: 'Orders' },
    { path: '/expenses', label: 'Expenses' },
    { path: '/account', label: 'Account' }
  ];

  onMobileMenuToggle() {
    this.mobileMenuToggle.emit();
  }

  async onSignOut() {
    try {
      await this.authService.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }

  navigateToSignup() {
    this.router.navigate(['/signup']);
  }
}
