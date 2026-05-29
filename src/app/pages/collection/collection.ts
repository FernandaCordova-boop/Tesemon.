import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PokemonService } from '../../services/pokemon';
import { PokemonCard } from '../../models/pokemon-card.model';

@Component({
  selector: 'app-collection',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './collection.html',
  styleUrl: './collection.css',
})
export class Collection implements OnInit {
  cards: PokemonCard[] = [];
  loading = true;

  private readonly RARITY_STARS: Record<string, number> = {
    common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5
  };

  constructor(
    private pokemonService: PokemonService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const misCartasIds = Array.from({ length: 1025 - 906 + 1 }, (_, i) => 906 + i);
    this.pokemonService.getSpecificCards(misCartasIds).subscribe({
      next: (cards) => {
        this.cards = cards;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error al cargar cartas:', err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  getRarityStars(level: string): number[] {
    const count = this.RARITY_STARS[level?.toLowerCase()] ?? 1;
    return Array(count).fill(0);
  }

  getEmptyStars(level: string): number[] {
    const count = this.RARITY_STARS[level?.toLowerCase()] ?? 1;
    return Array(Math.max(0, 5 - count)).fill(0);
  }
}
