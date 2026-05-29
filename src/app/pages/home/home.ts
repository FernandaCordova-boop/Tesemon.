import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { User } from '@supabase/supabase-js';
import { CommonModule } from '@angular/common';

interface Star {
  x: number;
  y: number;
  size: number;
  delay: string;
}

@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class HomeComponent implements OnInit {
  currentUser: User | null = null;
  username: string = '';
  loading = true;

  /** Estrellas generadas aleatoriamente para el fondo */
  stars: Star[] = this.generateStars(80);

  constructor(
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.authService.isAuthLoading$.subscribe(loading => {
      this.loading = loading;
      this.cdr.detectChanges();
    });

    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user) {
        this.username = user.user_metadata?.['username'] || user.email?.split('@')[0] || 'Entrenador';
      }
      this.cdr.detectChanges();
    });
  }

  onNavigate(route: string) {
    this.router.navigate([`/${route}`]);
  }

  async logout() {
    await this.authService.signOut();
  }

  private generateStars(count: number): Star[] {
    return Array.from({ length: count }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.8,
      delay: `-${(Math.random() * 4).toFixed(2)}s`
    }));
  }
}
