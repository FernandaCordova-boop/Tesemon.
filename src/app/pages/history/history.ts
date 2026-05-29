import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DialogService } from '../../services/dialog.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class History implements OnInit {
  matches: any[] = [];
  loading = true;
  private supabase: any;

  constructor(
    private authService: AuthService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private dialogService: DialogService
  ) {
    this.supabase = this.authService.getSupabaseClient();
  }

  async ngOnInit() {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('match_history')
        .select()
        .eq('player_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this.ngZone.run(() => {
        this.matches = data || [];
        this.loading = false;
        this.cdr.detectChanges();
      });
    } catch (e) {
      console.error('Error loading history:', e);
      this.ngZone.run(() => {
        this.loading = false;
        this.cdr.detectChanges();
      });
    }
  }

  async clearHistory() {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    const confirmed = await this.dialogService.confirm('¿Estás seguro de que deseas limpiar todo tu historial de partidas? Esta acción no se puede deshacer.');
    if (!confirmed) {
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    try {
      const { error } = await this.supabase
        .from('match_history')
        .delete()
        .eq('player_id', user.id);

      if (error) throw error;

      this.ngZone.run(async () => {
        this.matches = [];
        this.loading = false;
        this.cdr.detectChanges();
        await this.dialogService.alert('Historial de partidas limpiado con éxito.');
      });
    } catch (e: any) {
      console.error('Error clearing history:', e);
      this.ngZone.run(async () => {
        this.loading = false;
        this.cdr.detectChanges();
        await this.dialogService.alert('Error al limpiar el historial: ' + (e.message || e));
      });
    }
  }
}
