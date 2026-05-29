import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PokemonService } from '../../services/pokemon';
import { GameEngineService } from '../../services/game-engine.service';
import { DialogService } from '../../services/dialog.service';
import { BattleAnimationService } from '../../services/battle-animation.service';
import { BattleOverlayComponent } from '../../components/battle-overlay/battle-overlay';
import { GameState, InGameCard } from '../../models/game-state.model';
import { PokemonCard } from '../../models/pokemon-card.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-pve',
  standalone: true,
  imports: [CommonModule, RouterModule, BattleOverlayComponent],
  templateUrl: './pve.html',
  styleUrl: './pve.css',
})
export class Pve implements OnInit, OnDestroy {
  gameState!: GameState;
  loading = true;
  phase: 'selecting' | 'battling' = 'selecting';
  starterCards: PokemonCard[] = [];

  private sub!: Subscription;

  // Selección temporal para atacar
  selectedAttackerId: string | null = null;
  selectedAttackIndex: number | null = null;

  // Estado de animaciones de cartas
  attackingCardId: string | null = null;
  damagedCardId: string | null = null;
  defeatedCardId: string | null = null;
  summoningCardId: string | null = null;
  abilityCardId: string | null = null;

  // Seguimiento de puntos de vida anteriores para detectar cambios
  private prevPlayerLp = 5000;
  private prevAiLp = 5000;
  playerLpChanged = false;
  aiLpChanged = false;

  constructor(
    private pokemonService: PokemonService,
    public gameEngine: GameEngineService,
    private cdr: ChangeDetectorRef,
    private dialogService: DialogService,
    private router: Router,
    private animService: BattleAnimationService
  ) {}

  ngOnInit(): void {
    this.loading = true;

    const savedState = this.gameEngine.getCurrentState();
    if (savedState && savedState.status === 'playing') {
      this.phase = 'battling';
      this.loading = false;
      this.cdr.detectChanges();
    } else {
      this.pokemonService.getSpecificCards([906, 909, 912]).subscribe({
        next: (cards) => {
          this.starterCards = cards;
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: async () => {
          await this.dialogService.alert('Error al cargar selección inicial. Intenta recargar la página.');
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    }

    // Suscribirse al estado del juego
    this.sub = this.gameEngine.gameState$.subscribe(state => {
      const prev = this.gameState;
      this.gameState = state;

      if (state.activePlayerId !== 'player') {
        this.selectedAttackerId = null;
      }

      // Detectar cambios en puntos de vida para animación de score
      if (prev) {
        if (state.player.lifePoints !== this.prevPlayerLp) {
          this.triggerScoreAnimation('player');
          this.prevPlayerLp = state.player.lifePoints;
        }
        if (state.ai.lifePoints !== this.prevAiLp) {
          this.triggerScoreAnimation('ai');
          this.prevAiLp = state.ai.lifePoints;
        }
      }

      this.cdr.detectChanges();
    });

    // Suscribirse al estado de animaciones
    this.animService.animationState$.subscribe(anim => {
      this.attackingCardId  = anim.attackingCardId;
      this.damagedCardId    = anim.damagedCardId;
      this.defeatedCardId   = anim.defeatedCardId;
      this.summoningCardId  = anim.summoningCardId;
      this.abilityCardId    = anim.abilityCardId;
      this.cdr.detectChanges();
    });
  }

  selectCard(playerCard: PokemonCard) {
    this.loading = true;

    const pool = Array.from({ length: 1025 - 906 + 1 }, (_, i) => 906 + i);
    const playerDeckIds = [...pool].sort(() => 0.5 - Math.random()).slice(0, 4);
    const aiDeckIds = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
    const allIds = [...playerDeckIds, ...aiDeckIds];

    this.pokemonService.getSpecificCards(allIds).subscribe({
      next: (allCards) => {
        try {
          if (!allCards || allCards.length < 9) {
            throw new Error('No se cargaron las 9 cartas necesarias de la API.');
          }
          const playerCards = allCards.slice(0, 4);
          const aiCards = allCards.slice(4);
          const playerDeck = [playerCard, ...playerCards];

          this.gameEngine.startGame(playerDeck, aiCards);
          this.phase = 'battling';
          this.loading = false;
          this.cdr.detectChanges();
        } catch (e: any) {
          this.dialogService.alert('Error al iniciar el juego: ' + (e.message || e));
          this.loading = false;
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        this.dialogService.alert('Error de red: Hubo un problema al cargar los datos de los Pokémon.');
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
    // Si salimos de la batalla contra la IA y sigue en curso, cancelamos la partida
    if (this.gameState && this.gameState.status === 'playing') {
      this.gameEngine.resetGame();
    }
  }

  // ── Clases de animación para las cartas ──────────────────────

  getCardClasses(card: InGameCard, zone: 'player' | 'ai'): Record<string, boolean> {
    const hpPercent = (card.currentHp / card.hp) * 100;
    return {
      ['type-' + card.types[0]]: true,
      'in-field': true,
      'can-attack': card.canAttack && card.pose === 'attack' && this.gameState?.activePlayerId === 'player' && zone === 'player',
      'selected-attacker': this.selectedAttackerId === card.gameId && zone === 'player',
      'card-attacking': this.attackingCardId === card.gameId,
      'card-damaged':   this.damagedCardId   === card.gameId,
      'card-defeated':  this.defeatedCardId  === card.gameId,
      'card-summoning': this.summoningCardId === card.gameId,
      'card-ability':   this.abilityCardId   === card.gameId,
      'card-low-hp':    hpPercent <= 25 && hpPercent > 0,
    };
  }

  getHpFillClasses(card: InGameCard): Record<string, boolean> {
    const pct = (card.currentHp / card.hp) * 100;
    return {
      'hp-fill': true,
      'hp-critical': pct <= 25,
      'hp-medium':   pct > 25 && pct <= 50,
    };
  }

  // ── Interacciones del Jugador ────────────────────────────────

  onPlayCard(card: InGameCard) {
    if (this.gameState.activePlayerId !== 'player') return;
    // Animación de invocación
    this.animService.playSummonAnimation({ cardGameId: card.gameId, cardType: card.types[0] });
    this.gameEngine.playCard('player', card.gameId);
  }

  onSelectPlayerFieldCard(card: InGameCard) {
    if (this.gameState.activePlayerId !== 'player') return;
    this.selectedAttackerId = card.gameId;
    this.selectedAttackIndex = null;
  }

  getSelectedAttacker(): InGameCard | null {
    if (!this.selectedAttackerId || !this.gameState) return null;
    return this.gameState.player.field.find(c => c.gameId === this.selectedAttackerId) || null;
  }

  deselectAttacker() {
    this.selectedAttackerId = null;
    this.selectedAttackIndex = null;
  }

  onSelectPlayerFieldCardAttack(card: InGameCard, attackIndex: number, event: Event) {
    event.stopPropagation();
    if (this.gameState.activePlayerId !== 'player' || !card.canAttack || card.pose !== 'attack') return;
    this.selectedAttackerId = card.gameId;
    this.selectedAttackIndex = attackIndex;
  }

  onSelectPose(card: InGameCard, pose: 'attack' | 'defense', event: Event) {
    event.stopPropagation();
    if (this.gameState.activePlayerId !== 'player') return;
    if (card.pose !== pose) {
      this.gameEngine.toggleCardPose('player', card.gameId);
      if (pose === 'defense') {
        this.selectedAttackIndex = null;
      }
    }
  }

  onSelectEnemyFieldCard(card: InGameCard) {
    if (
      this.gameState.activePlayerId !== 'player' ||
      !this.selectedAttackerId ||
      this.selectedAttackIndex === null
    ) return;

    // Capturar datos antes del ataque para la animación
    const attacker = this.getSelectedAttacker();
    if (!attacker) return;

    const defenderHpBefore = card.currentHp;
    const attackInfo = attacker.attacks[this.selectedAttackIndex];

    // Ejecutar ataque en el motor
    this.gameEngine.attack(this.selectedAttackerId, card.gameId, this.selectedAttackIndex);

    // Calcular si fue derrotado (HP llegó a 0)
    const newState = this.gameEngine.getCurrentState();
    const defenderAfter = newState.ai.field.find(c => c.gameId === card.gameId);
    const defenderDefeated = !defenderAfter;

    // Calcular multiplicador para saber si fue súper efectivo
    const isSuperEffective = this.checkSuperEffective(attacker.types[0], card.types[0]);

    // Lanzar animación
    this.animService.playAttackAnimation({
      attackerGameId: this.selectedAttackerId!,
      defenderGameId: card.gameId,
      damage: attackInfo.damagePower,
      isSuperEffective,
      attackerType: attacker.types[0],
      defenderDefeated,
    });

    this.selectedAttackerId = null;
    this.selectedAttackIndex = null;
  }

  onUseAbility(card: InGameCard, event: Event) {
    event.stopPropagation();
    if (this.gameState.activePlayerId !== 'player') return;

    // Determinar tipo de habilidad para la animación
    const abilityType = this.getAbilityType(card.types[0]);
    this.animService.playAbilityAnimation({
      cardGameId: card.gameId,
      abilityType,
      cardType: card.types[0],
    });

    this.gameEngine.useSpecialAbility('player', card.gameId);
  }

  onEndTurn() {
    if (this.gameState.activePlayerId === 'player') {
      this.gameEngine.endTurn();
    }
  }

  exitGame() {
    try { sessionStorage.removeItem('tesemon_pve_state'); } catch (e) {}
    this.gameEngine.resetGame();
    this.phase = 'selecting';
    this.router.navigate(['/']);
  }

  // ── Helpers ─────────────────────────────────────────────────

  private checkSuperEffective(attackerType: string, defenderType: string): boolean {
    const advantages: Record<string, string[]> = {
      fire:     ['grass', 'bug', 'ice', 'steel'],
      water:    ['fire', 'ground', 'rock'],
      grass:    ['water', 'ground', 'rock'],
      electric: ['water', 'flying'],
      psychic:  ['fighting', 'poison'],
      fighting: ['normal', 'ice', 'rock', 'dark', 'steel'],
    };
    return !!(advantages[attackerType] && advantages[attackerType].includes(defenderType));
  }

  private getAbilityType(type: string): 'heal' | 'attack_boost' | 'draw' | 'defense_boost' {
    if (['grass', 'fairy'].includes(type)) return 'heal';
    if (['fire', 'fighting', 'dragon'].includes(type)) return 'attack_boost';
    if (['water', 'psychic', 'electric'].includes(type)) return 'draw';
    return 'defense_boost';
  }

  private triggerScoreAnimation(who: 'player' | 'ai') {
    if (who === 'player') {
      this.playerLpChanged = true;
      setTimeout(() => { this.playerLpChanged = false; this.cdr.detectChanges(); }, 500);
    } else {
      this.aiLpChanged = true;
      setTimeout(() => { this.aiLpChanged = false; this.cdr.detectChanges(); }, 500);
    }
  }
}
