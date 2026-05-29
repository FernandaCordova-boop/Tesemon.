import { Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css'] // Podemos reusar parte del CSS de register, pero lo dejaremos aquí
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  errorMessage: string = '';
  isLoading: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
  }

  ngOnInit() {
    // Esperar a que la autenticación termine de cargar para evitar redirecciones prematuras.
    // Solo si la carga finalizó y hay un usuario activo, se hace la redirección automática.
    this.authService.isAuthLoading$.subscribe(loading => {
      if (!loading) {
        const user = this.authService.getCurrentUser();
        if (user) {
          this.ngZone.run(() => {
            this.router.navigate(['/'], { replaceUrl: true });
          });
        }
      }
    });
  }

  async onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { email, password } = this.loginForm.value;
      await this.authService.signIn(email, password);
      this.ngZone.run(() => {
        // replaceUrl: true reemplaza la ruta /login en el historial del navegador.
        // Esto evita que el botón de retroceso vuelva a la pantalla de login.
        this.router.navigate(['/'], { replaceUrl: true });
      });
    } catch (error: any) {
      this.ngZone.run(() => {
        this.errorMessage = error.message || 'Credenciales incorrectas.';
        this.isLoading = false;
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
      });
    }
  }

  get f() { return this.loginForm.controls; }
}

