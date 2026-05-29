import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { GameState, PlayerState, InGameCard } from '../models/game-state.model';
import { PokemonCard } from '../models/pokemon-card.model';
import { AuthService } from './auth.service';
import { DialogService } from './dialog.service';

@Injectable({
  providedIn: 'root'
})
export class GameEngineService {
  private initialState: GameState = {
    status: 'waiting',
    turnNumber: 0,
    activePlayerId: 'player',
    player: this.createEmptyPlayer('player', 'Tú'),
    ai: this.createEmptyPlayer('ai', 'Rival IA'),
    log: []
  };

  private state = new BehaviorSubject<GameState>(this.initialState);
  gameState$ = this.state.asObservable();

  private createEmptyPlayer(id: string, name: string): PlayerState {
    return { id, name, deck: [], hand: [], field: [], discard: [], pokemonDefeated: 0, lifePoints: 5000 };
  }

  private generateGameId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private mapToInGameCard(card: PokemonCard): InGameCard {
    const firstType = card.types[0] || 'normal';
    const name1 = firstType.toUpperCase() + ' RÁPIDO';
    const name2 = firstType.toUpperCase() + ' IMPACTO';

    return {
      ...card,
      gameId: this.generateGameId(),
      currentHp: card.hp,
      canAttack: false,
      isDefending: false,
      abilityUsed: false,
      pose: 'attack',
      attacks: [
        { name: name1, damagePower: Math.round(card.attack * 0.8) },
        { name: name2, damagePower: Math.round(card.attack * 1.3) }
      ]
    };
  }

  private shuffleDeck(deck: InGameCard[]): InGameCard[] {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  private logMessage(message: string) {
    const currentState = this.state.getValue();
    currentState.log.unshift(`[Turno ${currentState.turnNumber}] ${message}`);
    // Mantener solo los últimos 20 mensajes
    if (currentState.log.length > 20) currentState.log.pop();
    this.updateState({ ...currentState });
  }

  startGame(playerCards: PokemonCard[], aiCards: PokemonCard[]) {
    const playerDeck = this.shuffleDeck(playerCards.map(c => this.mapToInGameCard(c)));
    const aiDeck = this.shuffleDeck(aiCards.map(c => this.mapToInGameCard(c)));

    const newState: GameState = {
      status: 'playing',
      turnNumber: 1,
      activePlayerId: 'player',
      player: { ...this.createEmptyPlayer('player', 'Tú'), deck: playerDeck },
      ai: { ...this.createEmptyPlayer('ai', 'Rival IA'), deck: aiDeck },
      log: []
    };

    this.updateState(newState);
    this.logMessage('¡Comienza la batalla!');

    // Robar 2 cartas iniciales (Mazo es de 3)
    for (let i = 0; i < 2; i++) {
      this.drawCard('player');
      this.drawCard('ai');
    }
  }

  drawCard(playerId: 'player' | 'ai') {
    const currentState = this.state.getValue();
    if (currentState.status !== 'playing') return;

    const player = currentState[playerId];
    if (player.deck.length === 0) {
      this.logMessage(`El mazo de ${player.name} está vacío. No puede robar más.`);
      this.checkWinCondition(currentState);
      this.updateState(currentState);
      return;
    }

    const card = player.deck.pop()!;
    player.hand.push(card);
    this.logMessage(`${player.name} roba una carta.`);

    this.checkWinCondition(currentState);
    this.updateState(currentState);
  }

  async playCard(playerId: 'player' | 'ai', cardGameId: string) {
    const currentState = this.state.getValue();
    if (currentState.activePlayerId !== playerId || currentState.status !== 'playing') return;

    const player = currentState[playerId];
    if (player.field.length >= 3) {
      if (playerId === 'player') {
        await this.dialogService.alert('No hay espacio en el campo (Máx 3).');
      }
      return;
    }

    const cardIndex = player.hand.findIndex(c => c.gameId === cardGameId);
    if (cardIndex > -1) {
      const card = player.hand.splice(cardIndex, 1)[0];
      // La carta no puede atacar el turno que es jugada
      card.canAttack = false;
      card.hasAttackedThisTurn = true;
      player.field.push(card);
      this.logMessage(`${player.name} pone a ${card.name} en el campo.`);
      this.updateState(currentState);
    }
  }

  private getDamageMultiplier(attackerType: string, defenderType: string): number {
    const advantages: { [key: string]: string[] } = {
      'fire': ['grass', 'bug', 'ice', 'steel'],
      'water': ['fire', 'ground', 'rock'],
      'grass': ['water', 'ground', 'rock'],
      'electric': ['water', 'flying'],
      'psychic': ['fighting', 'poison'],
      'fighting': ['normal', 'ice', 'rock', 'dark', 'steel'],
    };

    if (advantages[attackerType] && advantages[attackerType].includes(defenderType)) {
      return 2;
    }
    return 1;
  }

  toggleCardPose(playerId: 'player' | 'ai', cardGameId: string) {
    const currentState = this.state.getValue();
    const player = currentState[playerId];
    const card = player.field.find(c => c.gameId === cardGameId);
    if (!card) return;

    card.pose = card.pose === 'attack' ? 'defense' : 'attack';
    // Si cambia a defensa, ya no puede atacar este turno
    if (card.pose === 'defense') {
      card.canAttack = false;
    } else {
      card.canAttack = !card.hasAttackedThisTurn;
    }

    this.logMessage(`[Pose] ${card.name} de ${player.name} cambia a Pose ${card.pose === 'attack' ? 'de Ataque' : 'Defensiva'}.`);
    this.updateState(currentState);
  }

  attack(attackerGameId: string, targetGameId: string, attackIndex: number) {
    const currentState = this.state.getValue();
    if (currentState.activePlayerId !== 'player' || currentState.status !== 'playing') return;

    this.executeAttack('player', 'ai', attackerGameId, targetGameId, attackIndex, currentState);
  }

  private executeAttack(attackerId: 'player' | 'ai', defenderId: 'player' | 'ai', attackerGameId: string, targetGameId: string, attackIndex: number, currentState: GameState) {
    const attackerPlayer = currentState[attackerId];
    const defenderPlayer = currentState[defenderId];

    const attacker = attackerPlayer.field.find(c => c.gameId === attackerGameId);
    const defender = defenderPlayer.field.find(c => c.gameId === targetGameId);

    if (!attacker || !defender || !attacker.canAttack || attacker.pose !== 'attack') return;

    const attackInfo = attacker.attacks[attackIndex];
    const basePower = attackInfo.damagePower;

    // Calcular daño
    let rawDamage = basePower;
    if (defender.pose === 'defense') {
      rawDamage = basePower - defender.defense;
      if (rawDamage < 10) rawDamage = 10;
    }

    const attackerType = attacker.types[0];
    const defenderType = defender.types[0];
    const multiplier = this.getDamageMultiplier(attackerType, defenderType);
    const finalDamage = rawDamage * multiplier;

    defender.currentHp -= finalDamage;
    defenderPlayer.lifePoints = Math.max(0, defenderPlayer.lifePoints - finalDamage);
    attacker.canAttack = false;
    attacker.hasAttackedThisTurn = true;

    let effectivenessMsg = multiplier === 2 ? ' ¡Es súper efectivo!' : '';
    let poseMsg = defender.pose === 'defense' ? ' (Pose Defensiva)' : '';
    this.logMessage(`${attacker.name} usa ${attackInfo.name} contra ${defender.name} causando ${finalDamage} de daño.${effectivenessMsg}${poseMsg}`);

    if (defender.currentHp <= 0) {
      this.logMessage(`${defender.name} se ha debilitado.`);
      defenderPlayer.field = defenderPlayer.field.filter(c => c.gameId !== targetGameId);
      defenderPlayer.discard.push(defender);
      attackerPlayer.pokemonDefeated += 1;
    }

    this.checkWinCondition(currentState);
    this.updateState(currentState);
  }

  useSpecialAbility(playerId: 'player' | 'ai', cardGameId: string) {
    const currentState = this.state.getValue();
    if (currentState.activePlayerId !== playerId || currentState.status !== 'playing') return;

    const player = currentState[playerId];
    const card = player.field.find(c => c.gameId === cardGameId);

    if (!card || card.abilityUsed) return;

    const primaryType = card.types[0];
    card.abilityUsed = true;
    let effectMessage = '';

    switch (primaryType) {
      case 'grass':
      case 'fairy':
        card.currentHp += 150;
        if (card.currentHp > card.hp) card.currentHp = card.hp;
        effectMessage = `se cura 150 HP.`;
        break;
      case 'fire':
      case 'fighting':
      case 'dragon':
        card.attack += 80;
        effectMessage = `aumenta su ataque permanentemente en 80.`;
        break;
      case 'water':
      case 'psychic':
      case 'electric':
        this.drawCard(playerId);
        effectMessage = `te permite robar una carta.`;
        break;
      default:
        card.defense += 80;
        effectMessage = `aumenta su defensa en 80.`;
        break;
    }

    this.logMessage(`${card.name} usa Habilidad (${card.specialAbility}) y ${effectMessage}`);
    this.updateState(currentState);
  }

  constructor(
    private authService: AuthService,
    private dialogService: DialogService
  ) {
    this.restoreState();
  }

  getCurrentState(): GameState {
    return this.state.getValue();
  }

  private saveState(currentState: GameState) {
    try {
      // Si el estado no está jugando (por ejemplo, ganó o perdió), limpiamos la persistencia
      if (currentState.status === 'won' || currentState.status === 'lost') {
        sessionStorage.removeItem('tesemon_pve_state');
      } else {
        sessionStorage.setItem('tesemon_pve_state', JSON.stringify(currentState));
      }
    } catch (e) {
      console.error('Error al guardar estado PvE:', e);
    }
  }

  private restoreState() {
    try {
      const saved = sessionStorage.getItem('tesemon_pve_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.status === 'playing') {
          this.state.next(parsed);
          console.log('Estado PvE restaurado con éxito.');
        }
      }
    } catch (e) {
      console.error('Error al restaurar estado PvE:', e);
    }
  }

  private updateState(newState: GameState) {
    this.state.next(newState);
    this.saveState(newState);
  }

  resetGame() {
    try {
      sessionStorage.removeItem('tesemon_pve_state');
    } catch (e) { }
    this.state.next(this.initialState);
  }

  private async saveMatchResult(result: 'won' | 'lost', defeatedCount: number) {
    const user = this.authService.getCurrentUser();
    if (!user) return;

    try {
      const supabase = this.authService.getSupabaseClient();
      await supabase
        .from('match_history')
        .insert({
          player_id: user.id,
          opponent_name: 'Computadora (PvE)',
          result: result,
          pokemon_defeated: defeatedCount
        });
      console.log('Historial de combate contra la computadora guardado con éxito.');
    } catch (e) {
      console.error('Error al guardar historial de combate PvE:', e);
    }
  }

  checkWinCondition(currentState: GameState) {
    // Si la partida ya terminó, no volver a verificar ni duplicar el registro
    if (currentState.status === 'won' || currentState.status === 'lost') return;

    if (currentState.player.lifePoints <= 0) {
      currentState.status = 'lost';
      this.logMessage('Tu vida ha llegado a 0. ¡Has perdido la batalla!');
      this.saveMatchResult('lost', currentState.player.pokemonDefeated);
      return;
    } else if (currentState.ai.lifePoints <= 0) {
      currentState.status = 'won';
      this.logMessage('¡Has reducido la vida del Rival a 0! ¡HAS GANADO!');
      this.saveMatchResult('won', currentState.player.pokemonDefeated);
      return;
    }

    // Verificar si se han quedado sin cartas en mazo, mano y campo
    const playerHasCards = currentState.player.deck.length > 0 || 
                           currentState.player.hand.length > 0 || 
                           currentState.player.field.length > 0;
                           
    const aiHasCards = currentState.ai.deck.length > 0 || 
                       currentState.ai.hand.length > 0 || 
                       currentState.ai.field.length > 0;

    if (!playerHasCards) {
      currentState.status = 'lost';
      this.logMessage('Te has quedado sin cartas para jugar. ¡Has perdido la batalla!');
      this.saveMatchResult('lost', currentState.player.pokemonDefeated);
    } else if (!aiHasCards) {
      currentState.status = 'won';
      this.logMessage('El Rival se ha quedado sin cartas para jugar. ¡HAS GANADO!');
      this.saveMatchResult('won', currentState.player.pokemonDefeated);
    }
  }

  endTurn() {
    const currentState = this.state.getValue();
    if (currentState.status !== 'playing') return;

    this.checkWinCondition(currentState);
    if (currentState.status !== 'playing') {
      this.updateState(currentState);
      return;
    }

    const playerState = currentState.activePlayerId === 'player' ? currentState.player : currentState.ai;
    playerState.field.forEach((c: InGameCard) => {
      c.canAttack = true;
      c.hasAttackedThisTurn = false;
    });

    if (currentState.activePlayerId === 'player') {
      // Limpiar el chat cuando el jugador finaliza su turno para que no se acumule
      currentState.log = [];

      currentState.activePlayerId = 'ai';
      this.logMessage('--- Turno del Rival ---');
      this.drawCard('ai');
      this.updateState(currentState);
      this.executeAiTurn();
    } else {
      // Limpiar el chat cuando la IA finaliza su turno
      currentState.log = [];

      currentState.turnNumber++;
      currentState.activePlayerId = 'player';
      this.logMessage(`--- Turno ${currentState.turnNumber}: Tu Turno ---`);
      this.drawCard('player');
      this.updateState(currentState);
    }
  }

  // --- IA MEJORADA Y COMPETITIVA ---
  private executeAiTurn() {
    const currentState = this.state.getValue();
    if (currentState.status !== 'playing') return;

    setTimeout(() => {
      this.processAiActions();
    }, 800);
  }

  private processAiActions() {
    const state = this.state.getValue();
    if (state.status !== 'playing') return;
    const ai = state.ai;
    const player = state.player;

    // 1. Jugar cartas (Dificultad MUY rebajada)
    // Llena el campo, pero la mitad de las veces juega cartas débiles o al azar
    while (ai.field.length < 3 && ai.hand.length > 0) {
      // 50% de probabilidad de jugar la mejor carta, 50% de jugar una carta totalmente al azar
      if (Math.random() > 0.5) {
        ai.hand.sort((a, b) => (b.hp + b.attack) - (a.hp + a.attack));
      } else {
        ai.hand.sort(() => 0.5 - Math.random());
      }
      this.playCard('ai', ai.hand[0].gameId);
    }

    // 2. Activar Habilidades y Cambiar Pose (IA inteligente)
    ai.field.forEach(aiCard => {
      // 50% de probabilidad de ponerse en defensa si le queda poca vida
      if (aiCard.currentHp < aiCard.hp * 0.4 && aiCard.pose === 'attack' && Math.random() < 0.6) {
        aiCard.pose = 'defense';
        aiCard.canAttack = false;
        this.logMessage(`[Pose] ${aiCard.name} del rival cambia a Pose Defensiva.`);
        return;
      }

      if (!aiCard.abilityUsed) {
        // 50% de probabilidad de que la IA olvide o decida no activar la habilidad este turno
        if (Math.random() < 0.5) return;

        // Usa curación si le falta vida
        if (['grass', 'fairy'].includes(aiCard.types[0]) && aiCard.currentHp < aiCard.hp - 50) {
          this.useSpecialAbility('ai', aiCard.gameId);
        }
        // Usa daño extra o robar cartas agresivamente
        else if (['fire', 'fighting', 'dragon', 'water', 'electric', 'psychic'].includes(aiCard.types[0])) {
          this.useSpecialAbility('ai', aiCard.gameId);
        }
      }
    });

    // 3. Atacar (Dificultad MUY rebajada)
    const attackers = ai.field.filter(c => c.canAttack && c.pose === 'attack');

    attackers.forEach(aiCard => {
      // 30% de probabilidad de que el Pokémon de la IA se distraiga y pierda su ataque este turno
      if (Math.random() < 0.3) {
        this.logMessage(`¡${aiCard.name} del rival parece distraído y no ataca!`);
        aiCard.canAttack = false; // Desactivar ataque para este turno
        return;
      }

      if (player.field.length > 0) {
        let bestTarget;

        // 40% de probabilidad de atacar con estrategia, 60% de probabilidad de atacar a un objetivo al azar
        if (Math.random() > 0.6) {
          // Priorizar al objetivo con menos vida para matarlo rápido
          const targets = [...player.field].sort((a, b) => a.currentHp - b.currentHp);
          // Pero si hay debilidad de tipo a favor de la IA, darle prioridad
          bestTarget = targets.find(t => this.getDamageMultiplier(aiCard.types[0], t.types[0]) === 2) || targets[0];
        } else {
          const randomIndex = Math.floor(Math.random() * player.field.length);
          bestTarget = player.field[randomIndex];
        }

        const attackIndex = Math.floor(Math.random() * 2); // Elegir ataque 1 o 2 al azar
        this.executeAttack('ai', 'player', aiCard.gameId, bestTarget.gameId, attackIndex, this.state.getValue());
      }
    });

    // 4. Terminar Turno
    setTimeout(() => {
      this.endTurn();
    }, 1200);
  }
}
