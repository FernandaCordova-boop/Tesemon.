import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface AttackAnimationEvent {
  attackerGameId: string;
  defenderGameId: string;
  damage: number;
  isSuperEffective: boolean;
  attackerType: string;
  defenderDefeated: boolean;
}

export interface AbilityAnimationEvent {
  cardGameId: string;
  abilityType: 'heal' | 'attack_boost' | 'draw' | 'defense_boost';
  cardType: string;
}

export interface SummonAnimationEvent {
  cardGameId: string;
  cardType: string;
}

export interface BattleAnimationState {
  attackingCardId: string | null;
  damagedCardId: string | null;
  defeatedCardId: string | null;
  summoningCardId: string | null;
  abilityCardId: string | null;
  screenFlash: 'none' | 'red' | 'gold' | 'blue' | 'green' | 'white';
  floatingTexts: FloatingText[];
  shakeBoard: boolean;
}

export interface FloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  size: 'small' | 'medium' | 'large';
}

@Injectable({ providedIn: 'root' })
export class BattleAnimationService {
  private state = new BehaviorSubject<BattleAnimationState>({
    attackingCardId: null,
    damagedCardId: null,
    defeatedCardId: null,
    summoningCardId: null,
    abilityCardId: null,
    screenFlash: 'none',
    floatingTexts: [],
    shakeBoard: false,
  });

  animationState$ = this.state.asObservable();

  private floatingTextCounter = 0;

  /** Obtiene el estado actual */
  getState(): BattleAnimationState {
    return this.state.getValue();
  }

  /** Animación de ataque: el atacante se lanza, el defensor recibe daño */
  async playAttackAnimation(event: AttackAnimationEvent): Promise<void> {
    const { attackerGameId, defenderGameId, damage, isSuperEffective, attackerType, defenderDefeated } = event;

    // 1. Fase de ataque — el atacante se lanza
    this.patchState({ attackingCardId: attackerGameId, screenFlash: 'none' });
    await this.wait(350);

    // 2. Flash de impacto + daño al defensor
    const flashColor = this.getTypeFlashColor(attackerType);
    this.patchState({
      attackingCardId: null,
      damagedCardId: defenderGameId,
      screenFlash: flashColor,
      shakeBoard: isSuperEffective,
    });

    // Texto flotante de daño
    this.spawnFloatingText(
      `-${damage}`,
      isSuperEffective ? '#ff4444' : '#ffffff',
      isSuperEffective ? 'large' : 'medium'
    );

    if (isSuperEffective) {
      await this.wait(100);
      this.spawnFloatingText('¡SÚPER EFECTIVO!', '#ffcc00', 'large');
    }

    await this.wait(400);

    // 3. Si el defensor fue derrotado, animación de derrota
    if (defenderDefeated) {
      this.patchState({
        damagedCardId: null,
        defeatedCardId: defenderGameId,
        screenFlash: 'none',
        shakeBoard: false,
      });
      await this.wait(600);
    }

    // 4. Limpiar todo
    this.patchState({
      attackingCardId: null,
      damagedCardId: null,
      defeatedCardId: null,
      screenFlash: 'none',
      shakeBoard: false,
    });
  }

  /** Animación de invocación de carta al campo */
  async playSummonAnimation(event: SummonAnimationEvent): Promise<void> {
    this.patchState({ summoningCardId: event.cardGameId, screenFlash: 'blue' });
    this.spawnFloatingText('¡INVOCADO!', '#60a5fa', 'small');
    await this.wait(700);
    this.patchState({ summoningCardId: null, screenFlash: 'none' });
  }

  /** Animación de habilidad especial */
  async playAbilityAnimation(event: AbilityAnimationEvent): Promise<void> {
    const { cardGameId, abilityType, cardType } = event;

    this.patchState({ abilityCardId: cardGameId, screenFlash: 'gold' });

    const texts: Record<string, { text: string; color: string }> = {
      heal:          { text: '✨ CURACIÓN', color: '#22c55e' },
      attack_boost:  { text: '⚔️ ¡PODER UP!', color: '#ef4444' },
      draw:          { text: '🃏 ROBAR CARTA', color: '#60a5fa' },
      defense_boost: { text: '🛡️ DEFENSA UP', color: '#3b82f6' },
    };

    const t = texts[abilityType] || { text: '🌟 HABILIDAD', color: '#ffcc00' };
    this.spawnFloatingText(t.text, t.color, 'large');

    await this.wait(800);
    this.patchState({ abilityCardId: null, screenFlash: 'none' });
  }

  /** Animación de victoria */
  async playVictoryAnimation(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      this.patchState({ screenFlash: 'gold' });
      await this.wait(200);
      this.patchState({ screenFlash: 'none' });
      await this.wait(150);
    }
    this.spawnFloatingText('¡VICTORIA!', '#ffcc00', 'large');
  }

  /** Animación de derrota */
  async playDefeatAnimation(): Promise<void> {
    this.patchState({ screenFlash: 'red', shakeBoard: true });
    await this.wait(600);
    this.patchState({ screenFlash: 'none', shakeBoard: false });
    this.spawnFloatingText('DERROTA...', '#ef4444', 'large');
  }

  /** Limpia todos los textos flotantes */
  clearFloatingTexts(): void {
    this.patchState({ floatingTexts: [] });
  }

  // ── Helpers privados ──────────────────────────────────────────

  private patchState(partial: Partial<BattleAnimationState>): void {
    this.state.next({ ...this.state.getValue(), ...partial });
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private spawnFloatingText(text: string, color: string, size: 'small' | 'medium' | 'large'): void {
    const id = `ft-${++this.floatingTextCounter}`;
    const x = 30 + Math.random() * 40; // 30–70% horizontal
    const y = 20 + Math.random() * 40; // 20–60% vertical
    const current = this.state.getValue();
    const newTexts = [...current.floatingTexts, { id, text, x, y, color, size }];
    this.patchState({ floatingTexts: newTexts });

    // Auto-eliminar después de 1.5s
    setTimeout(() => {
      const s = this.state.getValue();
      this.patchState({ floatingTexts: s.floatingTexts.filter(t => t.id !== id) });
    }, 1500);
  }

  private getTypeFlashColor(type: string): BattleAnimationState['screenFlash'] {
    const map: Record<string, BattleAnimationState['screenFlash']> = {
      fire:     'red',
      fighting: 'red',
      dragon:   'red',
      water:    'blue',
      ice:      'blue',
      flying:   'blue',
      grass:    'green',
      bug:      'green',
      electric: 'gold',
      psychic:  'gold',
      fairy:    'gold',
    };
    return map[type] || 'white';
  }
}
