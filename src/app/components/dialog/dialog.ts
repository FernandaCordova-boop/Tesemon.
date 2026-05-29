import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogService, DialogOptions } from '../../services/dialog.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dialog.html',
  styleUrl: './dialog.css'
})
export class DialogComponent implements OnInit, OnDestroy {
  activeDialog: DialogOptions | null = null;
  private sub!: Subscription;

  constructor(
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.sub = this.dialogService.dialog$.subscribe(dialog => {
      this.activeDialog = dialog;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }

  onConfirm() {
    if (this.activeDialog) {
      this.dialogService.close(this.activeDialog, true);
    }
  }

  onCancel() {
    if (this.activeDialog) {
      this.dialogService.close(this.activeDialog, false);
    }
  }
}
