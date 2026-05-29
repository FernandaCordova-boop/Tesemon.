import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private authLoadingSubject = new BehaviorSubject<boolean>(true);

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.setupAuthListener();
  }

  private setupAuthListener() {
    this.supabase.auth.getSession().then(({ data }) => {
      this.currentUserSubject.next(data.session?.user || null);
      this.authLoadingSubject.next(false);
    }).catch(() => {
      this.authLoadingSubject.next(false);
    });

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.currentUserSubject.next(session?.user || null);
      this.authLoadingSubject.next(false);
    });
  }

  get currentUser$(): Observable<User | null> {
    return this.currentUserSubject.asObservable();
  }

  get isAuthLoading$(): Observable<boolean> {
    return this.authLoadingSubject.asObservable();
  }

  async signUp(email: string, password: string, username: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });
    
    if (error) throw error;
    return data;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  getSupabaseClient(): SupabaseClient {
    return this.supabase;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.getValue();
  }
}

