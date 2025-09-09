import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  private authService = inject(AuthService);
  
  // Check if user is authenticated to show different CTA
  isAuthenticated$ = this.authService.isAuthenticated();

  features = [
    {
      icon: 'inventory_2',
      title: 'Smart Inventory Management',
      description: 'Track stock levels, set reorder alerts, and manage supplier relationships with ease.'
    },
    {
      icon: 'restaurant',
      title: 'Recipe & Menu Management',
      description: 'Define product details, calculate costs, and optimize your menu for maximum profitability.'
    },
    {
      icon: 'receipt',
      title: 'Receipt Scanner & OCR',
      description: 'Digitize receipts instantly with AI-powered OCR for seamless expense tracking.'
    },
    {
      icon: 'analytics',
      title: 'Business Analytics',
      description: 'Make data-driven decisions with comprehensive reporting and forecasting tools.'
    },
    {
      icon: 'shopping_cart',
      title: 'Order Management',
      description: 'Streamline order processing and automatically update inventory levels.'
    },
    {
      icon: 'trending_up',
      title: 'Sales Forecasting',
      description: 'Predict demand, optimize ordering, and reduce waste with intelligent forecasting.'
    }
  ];

  testimonials = [
    {
      name: 'Sarah Chen',
      business: 'Brew & Bean Coffee',
      quote: 'LobbyTrace transformed how we manage inventory. We reduced waste by 30% in the first month!',
      rating: 5
    },
    {
      name: 'Mike Rodriguez',
      business: 'Corner Cafe',
      quote: 'The receipt scanner is a game-changer. No more manual data entry for expenses.',
      rating: 5
    },
    {
      name: 'Emma Thompson',
      business: 'Artisan Coffee House',
      quote: 'Finally, a system that understands the needs of small coffee shop owners.',
      rating: 5
    }
  ];

  pricingPlans = [
    {
      name: 'Starter',
      price: 29,
      period: 'month',
      description: 'Perfect for small cafes and coffee shops',
      features: [
        'Inventory management for up to 100 items',
        'Basic recipe management',
        'Receipt scanning (50/month)',
        'Essential reporting',
        'Email support'
      ],
      popular: false
    },
    {
      name: 'Professional',
      price: 59,
      period: 'month',
      description: 'Ideal for growing businesses',
      features: [
        'Unlimited inventory management',
        'Advanced recipe costing',
        'Unlimited receipt scanning',
        'Advanced analytics & forecasting',
        'Multi-location support',
        'Priority support'
      ],
      popular: true
    },
    {
      name: 'Enterprise',
      price: 99,
      period: 'month',
      description: 'For established coffee shop chains',
      features: [
        'Everything in Professional',
        'Custom integrations',
        'Advanced user management',
        'White-label options',
        'Dedicated account manager',
        '24/7 phone support'
      ],
      popular: false
    }
  ];
}
