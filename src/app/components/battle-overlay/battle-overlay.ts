import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { BattleAnimationService, BattleAnimationState, FloatingText } from '../../services/battle-animation.service';

@Component({
  selector: 'app-battle-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './battle-overlay.html',
  styleUrl: './battle-overlay.css',
})
export class BattleOverlayComponent implements OnInit, OnDestroy {
  state!: BattleAnimationState;
  private sub!: Subscription;

  constructor(private animService: BattleAnimationService) {}

  ngOnInit(): void {
    this.sub = this.animService.animationState$.subscribe(s => {
      this.state = s;
    });
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }

  trackByText(index: number, item: FloatingText): string {
    return item.id;
  }
}
