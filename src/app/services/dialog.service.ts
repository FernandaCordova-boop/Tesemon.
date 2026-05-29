import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface DialogOptions {
  type: 'alert' | 'confirm';
  title?: string;
  message: string;
  resolve: (value: boolean) => void;
}

@Injectable({
  providedIn: 'root'
})
export class DialogService {
  private dialogSubject = new Subject<DialogOptions | null>();
  dialog$ = this.dialogSubject.asObservable();

  alert(message: string, title: string = 'Aviso'): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.dialogSubject.next({
        type: 'alert',
        title,
        message,
        resolve
      });
    });
  }

  confirm(message: string, title: string = 'Confirmar'): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.dialogSubject.next({
        type: 'confirm',
        title,
        message,
        resolve
      });
    });
  }

  close(dialog: DialogOptions, value: boolean) {
    dialog.resolve(value);
    this.dialogSubject.next(null);
  }
}
