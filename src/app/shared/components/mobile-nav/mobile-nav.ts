import { Component, inject, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './mobile-nav.html',
  styleUrl: './mobile-nav.scss'
})
export class MobileNav {
  private authService = inject(AuthService);
  private router = inject(Router);

  @Input() isOpen = false;
  @Output() closeMenu = new EventEmitter<void>();

  // Observable to check if user is authenticated
  isAuthenticated$ = this.authService.isAuthenticated();
  userProfile$ = this.authService.userProfile$;

  // Navigation links for marketing/public pages
  publicNavLinks = [
    { path: '/', label: 'Home', icon: 'home' },
    { path: '/features', label: 'Features', icon: 'star' },
    { path: '/pricing', label: 'Pricing', icon: 'attach_money' },
    { path: '/about', label: 'About', icon: 'info' }
  ];

  // Navigation links for authenticated users
  appNavLinks = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/inventory', label: 'Inventory', icon: 'inventory_2' },
    { path: '/products', label: 'Products', icon: 'restaurant' },
    { path: '/orders', label: 'Orders', icon: 'shopping_cart' },
    { path: '/expenses', label: 'Expenses', icon: 'receipt' },
    { path: '/account', label: 'Account', icon: 'account_circle' }
  ];

  // Close menu when clicking outside
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    if (this.isOpen && event.target) {
      const clickedElement = event.target as HTMLElement;
      if (!clickedElement.closest('.mobile-nav-overlay')) {
        this.onCloseMenu();
      }
    }
  }

  // Close menu when pressing Escape key
  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.isOpen) {
      this.onCloseMenu();
    }
  }

  onCloseMenu() {
    this.closeMenu.emit();
  }

  onNavLinkClick() {
    // Close menu when navigating
    this.onCloseMenu();
  }

  async onSignOut() {
    try {
      await this.authService.signOut();
      this.onCloseMenu();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
    this.onCloseMenu();
  }

  navigateToSignup() {
    this.router.navigate(['/signup']);
    this.onCloseMenu();
  }
}
