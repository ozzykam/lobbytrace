import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MainNav } from './shared/components/main-nav/main-nav';
import { MobileNav } from './shared/components/mobile-nav/mobile-nav';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MainNav, MobileNav],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'lobbytrace';
  isMobileMenuOpen = false;

  onMobileMenuToggle() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  onMobileMenuClose() {
    this.isMobileMenuOpen = false;
  }
}
