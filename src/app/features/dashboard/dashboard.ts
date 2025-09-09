import { Component } from '@angular/core';
import { ComingSoon } from '../../shared/components/coming-soon/coming-soon';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ComingSoon],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class Dashboard {

}
