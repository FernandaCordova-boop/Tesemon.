import { Component, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.html',
  styleUrls: ['./register.css']
})
export class RegisterComponent implements OnInit {
  registerForm: FormGroup;
  errorMessage: string = '';
  isLoading: boolean = false;
  isSuccess: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.registerForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [
        Validators.required, 
        Validators.minLength(8),
        Validators.pattern(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}/)
      ]]
    });
  }

  ngOnInit() {
    // Esperar a que la autenticación termine de cargar para evitar redirecciones prematuras.
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
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const { email, password, username } = this.registerForm.value;
      await this.authService.signUp(email, password, username);
      this.ngZone.run(() => {
        this.isSuccess = true;
        this.isLoading = false;
      });
    } catch (error: any) {
      this.ngZone.run(() => {
        this.errorMessage = error.message || 'Error al registrar el usuario.';
        this.isLoading = false;
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
      });
    }
  }


  get f() { return this.registerForm.controls; }
}


