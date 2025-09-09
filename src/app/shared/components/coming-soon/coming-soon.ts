import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './coming-soon.html',
  styleUrl: './coming-soon.scss'
})
export class ComingSoon {
  @Input() featureName: string = 'This Feature';
  @Input() description: string = 'We\'re working hard to bring you something amazing. Stay tuned!';
  @Input() showBackButton: boolean = true;
  @Input() backButtonText: string = 'Go Back';
  @Input() backButtonLink: string = '/dashboard';
}
