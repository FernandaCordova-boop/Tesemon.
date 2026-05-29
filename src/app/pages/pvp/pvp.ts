import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PokemonService } from '../../services/pokemon';
import { DialogService } from '../../services/dialog.service';
import { BattleAnimationService } from '../../services/battle-animation.service';
import { BattleOverlayComponent } from '../../components/battle-overlay/battle-overlay';
import { GameState, PlayerState, InGameCard } from '../../models/game-state.model';
import { PokemonCard } from '../../models/pokemon-card.model';
import { Subscription } from 'rxjs';

export interface PvpGameState {
  status: 'selecting' | 'playing' | 'won' | 'lost';
  turnNumber: number;
  activePlayerId: string;
  player1: PlayerState;
  player2: PlayerState;
  log: string[];
}

@Component({
  selector: 'app-pvp',
  standalone: true,
  imports: [CommonModule, RouterModule, BattleOverlayComponent],
  templateUrl: './pvp.html',
  styleUrl: './pvp.css',
})
export class Pvp implements OnInit, OnDestroy {
  // Datos del Usuario Logueado
  myUserId: string = '';
  myUsername: string = '';

  // Ecosistema de Sala
  roomCode: string = '';
  roomStatus: 'lobby' | 'waiting' | 'selecting' | 'playing' | 'finished' = 'lobby';
  roomId: string = '';
  isPlayer1: boolean = false;
  opponentUsername: string = '';

  // Selección de Cartas
  starterCards: PokemonCard[] = [];
  selectedStarter: PokemonCard | null = null;
  loading: boolean = false;

  // Estado de Combate Local
  gameState: PvpGameState | null = null;
  selectedAttackerId: string | null = null;
  selectedAttackIndex: number | null = null;

  // Estado de animaciones de cartas
  attackingCardId: string | null = null;
  damagedCardId: string | null = null;
  defeatedCardId: string | null = null;
  summoningCardId: string | null = null;
  abilityCardId: string | null = null;

  // Supabase Realtime Channel
  private supabase: any;
  private realtimeChannel: any;
  private matchSaved: boolean = false;

  constructor(
    private authService: AuthService,
    private pokemonService: PokemonService,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private dialogService: DialogService,
    private animService: BattleAnimationService
  ) {
    this.supabase = this.authService.getSupabaseClient();
  }

  ngOnInit(): void {
    // Suscribirse al estado de animaciones
    this.animService.animationState$.subscribe(anim => {
      this.attackingCardId  = anim.attackingCardId;
      this.damagedCardId    = anim.damagedCardId;
      this.defeatedCardId   = anim.defeatedCardId;
      this.summoningCardId  = anim.summoningCardId;
      this.abilityCardId    = anim.abilityCardId;
      this.cdr.detectChanges();
    });

    this.authService.isAuthLoading$.subscribe(loading => {
      if (!loading) {
        const user = this.authService.getCurrentUser();
        if (!user) {
          this.router.navigate(['/login']);
          return;
        }
        this.myUserId = user.id;
        this.myUsername = user.user_metadata?.['username'] || user.email?.split('@')[0] || 'Entrenador';

        // Cargar cartas iniciales para la fase de selección (Paldea: Sprigatito, Fuecoco, Quaxly)
        this.loading = true;
        this.pokemonService.getSpecificCards([906, 909, 912]).subscribe({
          next: (cards) => {
            this.starterCards = cards;
            this.loading = false;
            this.restoreLocalState(); // Intentar restaurar estado previo al recargar/minimizar
          },
          error: async () => {
            await this.dialogService.alert('Error al cargar la selección inicial.');
            this.loading = false;
            this.restoreLocalState(); // Intentar restaurar estado previo incluso en error
          }
        });
      }
    });
  }

  ngOnDestroy(): void {
    if (this.realtimeChannel) {
      this.supabase.removeChannel(this.realtimeChannel);
    }
  }

  @HostListener('document:visibilitychange', [])
  @HostListener('window:focus', [])
  async onWindowFocusOrVisibilityChange() {
    if (document.visibilityState === 'visible') {
      console.log('Ventana enfocada o visible. Sincronizando estado de la partida...');
      await this.syncActiveRoom();
    }
  }

  private async syncActiveRoom() {
    if (!this.roomId) return;

    try {
      console.log('Re-sincronizando sala con ID:', this.roomId);

      // Re-suscribirse a los cambios en tiempo real si el canal no está suscrito o está cerrado
      if (this.realtimeChannel) {
        try {
          this.supabase.removeChannel(this.realtimeChannel);
        } catch (e) {}
      }
      this.subscribeToRoomChanges();

      // Consultar la sala en Supabase para obtener el estado del juego más fresco
      const { data: rooms, error } = await this.supabase
        .from('rooms')
        .select()
        .eq('id', this.roomId);

      if (!error && rooms && rooms.length > 0) {
        const freshRoom = rooms[0];
        console.log('Sala recuperada en sincronización:', freshRoom);

        this.ngZone.run(() => {
          if (freshRoom.status !== this.roomStatus) {
            this.roomStatus = freshRoom.status;
          }
          if (freshRoom.game_state) {
            this.gameState = freshRoom.game_state;
          }
          if (this.isPlayer1) {
            this.opponentUsername = freshRoom.player2_username || 'Esperando...';
          } else {
            this.opponentUsername = freshRoom.player1_username;
          }
          this.cdr.detectChanges();
          if (freshRoom.status !== 'finished') {
            this.saveLocalState();
          }
        });
      }
    } catch (err) {
      console.error('Error al sincronizar sala activa:', err);
    }
  }

  // --- Matchmaking & Lobby ---

  async createRoom() {
    this.loading = true;
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();

    try {
      console.log('Creando sala con código:', code);
      const { data, error } = await this.supabase
        .from('rooms')
        .insert({
          code,
          player1_id: this.myUserId,
          player1_username: this.myUsername,
          status: 'waiting'
        })
        .select();

      if (error) {
        console.error('Error al insertar sala:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        console.error('No se devolvieron datos al crear la sala.');
        throw new Error('No se recibieron datos de la sala creada.');
      }

      const createdRoom = data[0];
      console.log('Sala creada con éxito:', createdRoom);

      this.ngZone.run(() => {
        this.roomId = createdRoom.id;
        this.roomCode = createdRoom.code;
        this.isPlayer1 = true;
        this.roomStatus = 'waiting';
        this.loading = false; // Hide loading screen first to guarantee UI updates immediately!
        this.cdr.detectChanges(); // Force immediate change detection!
        this.saveLocalState(); // Persistir estado inicial de sala

        try {
          this.subscribeToRoomChanges();
        } catch (subErr) {
          console.error('Error al suscribirse a los cambios en tiempo real:', subErr);
        }
      });
    } catch (err: any) {
      console.error('Error en createRoom:', err);
      this.dialogService.alert(err.message || 'Error al crear la sala');
      this.ngZone.run(() => {
        this.loading = false;
        this.cdr.detectChanges();
      });
    }
  }

  async joinRoom(code: string) {
    if (!code || code.trim().length !== 5) {
      this.dialogService.alert('Por favor introduce un código de 5 caracteres válido.');
      return;
    }
    this.loading = true;
    const cleanCode = code.trim().toUpperCase();

    try {
      console.log('Buscando sala con código:', cleanCode);
      // Buscar sala activa con ese código
      const { data: rooms, error: findError } = await this.supabase
        .from('rooms')
        .select()
        .eq('code', cleanCode)
        .eq('status', 'waiting');

      if (findError || !rooms || rooms.length === 0) {
        console.error('Error al buscar sala o sala llena:', findError);
        throw new Error('Sala no encontrada o ya se encuentra llena.');
      }

      const room = rooms[0];
      console.log('Sala encontrada. Uniéndose como Player 2:', room);

      // Unirse como jugador 2
      const { error: updateError } = await this.supabase
        .from('rooms')
        .update({
          player2_id: this.myUserId,
          player2_username: this.myUsername,
          status: 'selecting'
        })
        .eq('id', room.id);

      if (updateError) {
        console.error('Error al actualizar registro de sala al unirse:', updateError);
        throw updateError;
      }

      console.log('Unión a la sala exitosa en la base de datos.');

      this.ngZone.run(() => {
        this.roomId = room.id;
        this.roomCode = room.code;
        this.isPlayer1 = false;
        this.opponentUsername = room.player1_username;
        this.roomStatus = 'selecting';
        this.loading = false; // Hide loading screen first to guarantee UI updates immediately!
        this.cdr.detectChanges(); // Force immediate change detection!
        this.saveLocalState(); // Persistir estado de sala unida

        try {
          this.subscribeToRoomChanges();
        } catch (subErr) {
          console.error('Error al suscribirse a los cambios en tiempo real desde joinRoom:', subErr);
        }
      });
    } catch (err: any) {
      console.error('Error en joinRoom:', err);
      this.dialogService.alert(err.message || 'Error al unirse a la sala');
      this.ngZone.run(() => {
        this.loading = false;
        this.cdr.detectChanges();
      });
    }
  }

  // --- Realtime Subscription ---

  private subscribeToRoomChanges() {
    console.log('Iniciando suscripción Realtime para sala:', this.roomId);
    this.ngZone.runOutsideAngular(() => {
      this.realtimeChannel = this.supabase
        .channel(`room:${this.roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${this.roomId}`
          },
          (payload: any) => {
            console.log('Cambio detectado en base de datos:', payload);
            this.ngZone.run(() => {
              const newRoom = payload.new;
              this.handleRoomUpdate(newRoom);
            });
          }
        )
        .subscribe((status: string, err?: any) => {
          console.log('Estado de la conexión Realtime:', status);
          if (err) {
            console.error('Error en suscripción Realtime:', err);
          }
        });
    });
  }

  private handleRoomUpdate(room: any) {
    if (this.isPlayer1) {
      this.opponentUsername = room.player2_username || 'Esperando...';
    } else {
      this.opponentUsername = room.player1_username;
    }

    if (room.status === 'selecting') {
      this.roomStatus = 'selecting';
      this.gameState = room.game_state;
    } else if (room.status === 'playing') {
      this.roomStatus = 'playing';
      this.gameState = room.game_state;
    } else if (room.status === 'finished') {
      this.roomStatus = 'finished';
      this.gameState = room.game_state;

      const winnerId = room.winner_id;
      if (winnerId) {
        this.saveMatchResult(winnerId);
      }

      try {
        sessionStorage.removeItem('tesemon_pvp_state'); // Limpiar al finalizar
      } catch (e) {}
    }

    // Force immediate change detection whenever the database updates the room state!
    this.cdr.detectChanges();
    if (room.status !== 'finished') {
      this.saveLocalState(); // Guardar estado actualizado de la sala
    }
  }

  // --- Selección de Starter ---

  selectStarter(starter: PokemonCard) {
    this.selectedStarter = starter;
    this.saveLocalState();
    this.confirmStarter();
  }

  private async confirmStarter() {
    if (!this.selectedStarter) return;
    this.loading = true;

    try {
      // 1. Obtener cartas del mazo completo (1 starter + 4 aleatorios de PokeAPI)
      const pool = Array.from({ length: 1025 - 906 + 1 }, (_, i) => 906 + i);
      const randomIds = [...pool].sort(() => 0.5 - Math.random()).slice(0, 4);

      console.log('Obteniendo mazo aleatorio para PvP...', randomIds);
      this.pokemonService.getSpecificCards(randomIds).subscribe({
        next: async (randomCards) => {
          try {
            const fullDeck = [this.selectedStarter!, ...randomCards].map(c => this.mapToInGameCard(c));

            // 2. Traer sala actual para ver qué ha elegido el rival
            const { data: room, error: fetchError } = await this.supabase
              .from('rooms')
              .select()
              .eq('id', this.roomId)
              .single();

            if (fetchError) {
              console.error('Error al obtener sala en confirmStarter:', fetchError);
              throw fetchError;
            }

            let currentGameState: any = room.game_state || {
              status: 'selecting',
              turnNumber: 1,
              activePlayerId: '',
              player1: null,
              player2: null,
              log: []
            };

            const myPlayerState: PlayerState = {
              id: this.myUserId,
              name: this.myUsername,
              deck: fullDeck,
              hand: [],
              field: [],
              discard: [],
              pokemonDefeated: 0,
              lifePoints: 5000
            };

            if (this.isPlayer1) {
              currentGameState.player1 = myPlayerState;
            } else {
              currentGameState.player2 = myPlayerState;
            }

            console.log('Actualizando selección de starter en la sala.', currentGameState);

            // Si ambos han seleccionado su mazo, inicializamos la partida
            if (currentGameState.player1 && currentGameState.player2) {
              currentGameState.status = 'playing';

              // Robar 2 cartas iniciales para ambos
              for (let i = 0; i < 2; i++) {
                this.drawCardState(currentGameState.player1);
                this.drawCardState(currentGameState.player2);
              }

              // Player 1 inicia
              currentGameState.activePlayerId = room.player1_id;
              currentGameState.log.unshift('[Turno 1] ¡Comienza la batalla Pokémon en Línea!');

              console.log('Ambos jugadores listos. Iniciando juego.');

              // Actualizar localmente de inmediato
              this.roomStatus = 'playing';
              this.gameState = currentGameState;
              this.saveLocalState();
              this.cdr.detectChanges();

              const { error: updateError } = await this.supabase
                .from('rooms')
                .update({
                  game_state: currentGameState,
                  status: 'playing'
                })
                .eq('id', this.roomId);

              if (updateError) {
                console.error('Error al iniciar juego en confirmStarter:', updateError);
                throw updateError;
              }
            } else {
              // Guardar selección parcial
              console.log('Esperando selección del rival.');

              // Actualizar localmente de inmediato
              this.gameState = currentGameState;
              this.saveLocalState();
              this.cdr.detectChanges();

              const { error: updateError } = await this.supabase
                .from('rooms')
                .update({
                  game_state: currentGameState
                })
                .eq('id', this.roomId);

              if (updateError) {
                console.error('Error al guardar selección parcial en confirmStarter:', updateError);
                throw updateError;
              }
            }

             this.ngZone.run(() => {
              this.loading = false;
              this.cdr.detectChanges(); // Force immediate change detection!
            });
          } catch (err: any) {
            console.error('Error interno en callback confirmStarter:', err);
            this.dialogService.alert(err.message || 'Error al confirmar la selección.');
            this.ngZone.run(() => {
              this.loading = false;
              this.cdr.detectChanges();
            });
          }
        },
        error: (err) => {
          console.error('Error al obtener cartas de PokeAPI:', err);
          this.dialogService.alert('Error al cargar la selección del mazo.');
          this.ngZone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        }
      });
    } catch (err: any) {
      console.error('Error síncrono en confirmStarter:', err);
      this.dialogService.alert(err.message || 'Error al confirmar selección.');
      this.ngZone.run(() => {
        this.loading = false;
      });
    }
  }

  // --- Mecánicas del Juego (Sincronización a Supabase) ---

  getMyState(): PlayerState | null {
    if (!this.gameState) return null;
    return this.isPlayer1 ? this.gameState.player1 as any : this.gameState.player2 as any;
  }

  getOpponentState(): PlayerState | null {
    if (!this.gameState) return null;
    return this.isPlayer1 ? this.gameState.player2 as any : this.gameState.player1 as any;
  }

  isMyTurn(): boolean {
    if (!this.gameState) return false;
    const myState = this.getMyState();
    return this.gameState.activePlayerId === this.myUserId || (!!myState && this.gameState.activePlayerId === myState.id);
  }

  isWaitingForOpponentSelection(): boolean {
    if (this.roomStatus !== 'selecting') return false;
    if (!this.selectedStarter) return false;

    // Si yo soy Player 1 y Player 2 aún no está listo en el gameState
    if (this.isPlayer1 && (!this.gameState || !this.gameState.player2)) {
      return true;
    }
    // Si yo soy Player 2 y Player 1 aún no está listo en el gameState
    if (!this.isPlayer1 && (!this.gameState || !this.gameState.player1)) {
      return true;
    }

    return false;
  }

  async playCard(cardGameId: string) {
    if (!this.isMyTurn() || !this.gameState) return;
    const state = { ...this.gameState };
    const myState = this.isPlayer1 ? state.player1 : state.player2;

    if (myState.field.length >= 3) {
      this.dialogService.alert('No hay espacio en el campo (Máx 3).');
      return;
    }

    const cardIndex = myState.hand.findIndex(c => c.gameId === cardGameId);
    if (cardIndex > -1) {
      const card = myState.hand.splice(cardIndex, 1)[0];
      card.canAttack = false;
      card.hasAttackedThisTurn = true;
      myState.field.push(card);
      state.log.unshift(`[Turno ${state.turnNumber}] ${myState.name} juega a ${card.name}.`);
      // Animación de invocación
      this.animService.playSummonAnimation({ cardGameId: card.gameId, cardType: card.types[0] });
      await this.updateGameStateInSupabase(state);
    }
  }

  async selectPlayerCard(card: InGameCard) {
    if (!this.isMyTurn()) return;
    this.selectedAttackerId = card.gameId;
    this.selectedAttackIndex = null; // Reset attack choice when selecting a card
  }

  // ── Clases de animación para las cartas ──────────────────────

  getCardClasses(card: InGameCard, zone: 'player' | 'ai'): Record<string, boolean> {
    const hpPercent = (card.currentHp / card.hp) * 100;
    return {
      ['type-' + card.types[0]]: true,
      'in-field': true,
      'can-attack': card.canAttack && card.pose === 'attack' && this.isMyTurn() && zone === 'player',
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

  getSelectedAttacker(): InGameCard | null {
    if (!this.selectedAttackerId || !this.gameState) return null;
    const myState = this.getMyState();
    return myState?.field.find(c => c.gameId === this.selectedAttackerId) || null;
  }

  deselectAttacker() {
    this.selectedAttackerId = null;
    this.selectedAttackIndex = null;
  }

  async selectPlayerCardAttack(card: InGameCard, attackIndex: number, event: Event) {
    event.stopPropagation();
    if (!this.isMyTurn() || !card.canAttack || card.pose !== 'attack') return;
    this.selectedAttackerId = card.gameId;
    this.selectedAttackIndex = attackIndex;
  }

  async selectPose(card: InGameCard, pose: 'attack' | 'defense', event: Event) {
    event.stopPropagation();
    if (!this.isMyTurn() || !this.gameState) return;
    const state = { ...this.gameState } as PvpGameState;
    const myState = this.isPlayer1 ? state.player1 : state.player2;
    const fieldCard = myState.field.find(c => c.gameId === card.gameId);
    if (!fieldCard) return;

    if (fieldCard.pose !== pose) {
      fieldCard.pose = pose;
      if (pose === 'defense') {
        fieldCard.canAttack = false;
        this.selectedAttackIndex = null;
      } else {
        fieldCard.canAttack = !fieldCard.hasAttackedThisTurn;
      }
      state.log.unshift(`[Pose] ${fieldCard.name} cambia a Pose ${pose === 'attack' ? 'de Ataque' : 'Defensiva'}.`);
      await this.updateGameStateInSupabase(state);
    }
  }

  async attackEnemyCard(enemyCard: InGameCard) {
    if (!this.isMyTurn() || !this.selectedAttackerId || this.selectedAttackIndex === null || !this.gameState) return;
    const state = { ...this.gameState } as PvpGameState;
    const myState = this.isPlayer1 ? state.player1 : state.player2;
    const enemyState = this.isPlayer1 ? state.player2 : state.player1;

    const attacker = myState.field.find((c: InGameCard) => c.gameId === this.selectedAttackerId);
    const defender = enemyState.field.find((c: InGameCard) => c.gameId === enemyCard.gameId);

    if (!attacker || !defender || !attacker.canAttack || attacker.pose !== 'attack') return;

    const attackInfo = attacker.attacks[this.selectedAttackIndex];
    const basePower = attackInfo.damagePower;

    // Calcular daño
    let rawDamage = basePower;
    if (defender.pose === 'defense') {
      rawDamage = basePower - defender.defense;
      if (rawDamage < 10) rawDamage = 10;
    }

    const multiplier = this.getDamageMultiplier(attacker.types[0], defender.types[0]);
    const finalDamage = rawDamage * multiplier;

    defender.currentHp -= finalDamage;
    enemyState.lifePoints = Math.max(0, enemyState.lifePoints - finalDamage);
    attacker.canAttack = false;
    attacker.hasAttackedThisTurn = true;

    let effMsg = multiplier === 2 ? ' ¡Súper efectivo!' : '';
    let defMsg = defender.pose === 'defense' ? ' (Pose Defensiva)' : '';
    state.log.unshift(`[Turno ${state.turnNumber}] ${attacker.name} usa ${attackInfo.name} contra ${defender.name} causando ${finalDamage} HP.${effMsg}${defMsg}`);

    if (defender.currentHp <= 0) {
      state.log.unshift(`[Turno ${state.turnNumber}] ${defender.name} de ${enemyState.name} ha sido debilitado.`);
      enemyState.field = enemyState.field.filter((c: InGameCard) => c.gameId !== defender.gameId);
      enemyState.discard.push(defender);
      myState.pokemonDefeated += 1;
    }

    this.selectedAttackerId = null;
    this.selectedAttackIndex = null;
    this.checkWinCondition(state);
    await this.updateGameStateInSupabase(state);
  }

  async useAbility(card: InGameCard, event: Event) {
    event.stopPropagation();
    if (!this.isMyTurn() || card.abilityUsed || !this.gameState) return;
    const state = { ...this.gameState } as PvpGameState;
    const myState = this.isPlayer1 ? state.player1 : state.player2;
    const activeCard = myState.field.find((c: InGameCard) => c.gameId === card.gameId);

    if (!activeCard) return;

    activeCard.abilityUsed = true;
    let desc = '';
    const primaryType = activeCard.types[0];

    switch (primaryType) {
      case 'grass':
      case 'fairy':
        activeCard.currentHp = Math.min(activeCard.hp, activeCard.currentHp + 150);
        desc = 'se cura 150 HP.';
        break;
      case 'fire':
      case 'fighting':
      case 'dragon':
        activeCard.attack += 80;
        desc = 'aumenta su ataque en 80.';
        break;
      case 'water':
      case 'psychic':
      case 'electric':
        this.drawCardState(myState);
        desc = 'le permite robar una carta.';
        break;
      default:
        activeCard.defense += 80;
        desc = 'aumenta su defensa en 80.';
        break;
    }

    state.log.unshift(`[Turno ${state.turnNumber}] ${activeCard.name} usa su habilidad especial y ${desc}`);
    await this.updateGameStateInSupabase(state);
  }

  async endTurn() {
    if (!this.isMyTurn() || !this.gameState) return;
    const state = { ...this.gameState } as PvpGameState;
    const myState = this.isPlayer1 ? state.player1 : state.player2;
    const enemyState = this.isPlayer1 ? state.player2 : state.player1;

    // Habilitar ataques para el siguiente turno
    myState.field.forEach((c: InGameCard) => {
      c.canAttack = true;
      c.hasAttackedThisTurn = false;
    });

    // Limpiar logs para evitar saturación
    state.log = [];

    // Cambiar turno activo
    state.activePlayerId = enemyState.id;
    state.turnNumber++;
    state.log.unshift(`--- Turno ${state.turnNumber}: Turno de ${enemyState.name} ---`);

    // Robar carta para el oponente
    this.drawCardState(enemyState);

    await this.updateGameStateInSupabase(state);
  }

  // --- Helpers de Reglas de Juego ---

  private drawCardState(player: PlayerState) {
    if (player.deck.length === 0) return;
    player.hand.push(player.deck.pop()!);
  }

  private getDamageMultiplier(att: string, def: string): number {
    const advantages: { [key: string]: string[] } = {
      'fire': ['grass', 'bug', 'ice', 'steel'],
      'water': ['fire', 'ground', 'rock'],
      'grass': ['water', 'ground', 'rock'],
      'electric': ['water', 'flying'],
      'psychic': ['fighting', 'poison'],
      'fighting': ['normal', 'ice', 'rock', 'dark', 'steel'],
    };
    return (advantages[att] && advantages[att].includes(def)) ? 2 : 1;
  }

  private checkWinCondition(state: any) {
    if (state.player1.lifePoints <= 0) {
      state.status = 'lost'; // Player 2 gana
    } else if (state.player2.lifePoints <= 0) {
      state.status = 'won'; // Player 1 gana
    }
  }

  private async updateGameStateInSupabase(newState: any) {
    // Actualizar localmente de inmediato para que la UI sea reactiva y fluida
    this.gameState = newState;
    this.cdr.detectChanges();
    if (newState.status !== 'finished') {
      this.saveLocalState();
    }

    let updateFields: any = { game_state: newState };

    if (newState.status === 'won' || newState.status === 'lost') {
      updateFields.status = 'finished';
      const winnerId = newState.status === 'won' ? this.gameState?.player1.id : this.gameState?.player2.id;
      updateFields.winner_id = winnerId;

      // Guardar en el PC de Bill (Historial)
      await this.saveMatchResult(winnerId!);
    }

    try {
      const { error } = await this.supabase
        .from('rooms')
        .update(updateFields)
        .eq('id', this.roomId);

      if (error) throw error;
      console.log('Estado de la partida PvP actualizado en Supabase con éxito.');
    } catch (err) {
      console.error('Error al actualizar el estado de la partida PvP en Supabase:', err);
    }
  }

  private async saveMatchResult(winnerId: string) {
    if (this.matchSaved) return;
    this.matchSaved = true;

    const myResult = winnerId === this.myUserId ? 'won' : 'lost';
    const opponent = this.opponentUsername || 'Entrenador Rival';
    const myState = this.getMyState();

    try {
      await this.supabase
        .from('match_history')
        .insert({
          player_id: this.myUserId,
          opponent_name: opponent,
          result: myResult,
          pokemon_defeated: myState?.pokemonDefeated || 0
        });
    } catch (e) {
      console.error('Error guardando historial de combate:', e);
    }
  }

  private saveLocalState() {
    try {
      const stateToSave = {
        roomId: this.roomId,
        roomCode: this.roomCode,
        isPlayer1: this.isPlayer1,
        roomStatus: this.roomStatus,
        opponentUsername: this.opponentUsername,
        selectedStarter: this.selectedStarter
      };
      sessionStorage.setItem('tesemon_pvp_state', JSON.stringify(stateToSave));
      console.log('Estado local de PvP guardado en sessionStorage.');
    } catch (e) {
      console.error('Error al guardar estado local:', e);
    }
  }

  private async restoreLocalState() {
    try {
      const saved = sessionStorage.getItem('tesemon_pvp_state');
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (!parsed.roomId || !parsed.roomCode) return;

      console.log('Restaurando estado local de PvP previo:', parsed);

      this.ngZone.run(async () => {
        this.roomId = parsed.roomId;
        this.roomCode = parsed.roomCode;
        this.isPlayer1 = parsed.isPlayer1;
        this.roomStatus = parsed.roomStatus;
        this.opponentUsername = parsed.opponentUsername;
        this.selectedStarter = parsed.selectedStarter;
        this.loading = true;
        this.cdr.detectChanges();

        try {
          // Re-suscribirse a los cambios en tiempo real
          this.subscribeToRoomChanges();

          // Consultar la sala en Supabase para obtener el estado del juego más fresco
          const { data: rooms, error } = await this.supabase
            .from('rooms')
            .select()
            .eq('id', this.roomId);

          if (!error && rooms && rooms.length > 0) {
            const freshRoom = rooms[0];
            console.log('Sala recuperada desde Supabase con éxito:', freshRoom);

            // Si el estado de la sala cambió en la BD, lo sincronizamos
            if (freshRoom.status !== this.roomStatus) {
              this.roomStatus = freshRoom.status;
            }
            if (freshRoom.game_state) {
              this.gameState = freshRoom.game_state;
            }
            this.saveLocalState();
          }
        } catch (restoreErr) {
          console.error('Error al restaurar conexión de sala:', restoreErr);
        } finally {
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    } catch (e) {
      console.error('Error al restaurar estado local:', e);
    }
  }

  async exitRoom() {
    // Si la partida está activa (playing o selecting) y el jugador decide salir, se rinde
    if (this.roomStatus === 'playing' || this.roomStatus === 'selecting') {
      const confirmExit = await this.dialogService.confirm('¿Estás seguro de que quieres abandonar la batalla? Se te contará como una derrota y se le dará la victoria al rival.');
      if (!confirmExit) return;

      this.loading = true;
      this.cdr.detectChanges();

      try {
        const state = { ...this.gameState } as PvpGameState;
        // Si yo me rindo, marco el estado de la partida:
        // Si soy Player 1 (isPlayer1 === true), el estado final debe ser 'lost' (gana P2)
        // Si soy Player 2 (isPlayer1 === false), el estado final debe ser 'won' (gana P1)
        state.status = this.isPlayer1 ? 'lost' : 'won';
        state.log.unshift(`[Surrender] ${this.myUsername} se ha retirado de la batalla.`);

        await this.updateGameStateInSupabase(state);
      } catch (err) {
        console.error('Error al tramitar la rendición:', err);
      }
    } else if (this.roomStatus === 'waiting') {
      try {
        // Cancelar la sala de espera poniéndola como terminada en Supabase
        await this.supabase
          .from('rooms')
          .update({ status: 'finished' })
          .eq('id', this.roomId);
      } catch (e) {
        console.error('Error al cancelar la sala de espera:', e);
      }
    }

    try {
      sessionStorage.removeItem('tesemon_pvp_state');
    } catch (e) {}

    // Desvincular canal en tiempo real
    if (this.realtimeChannel) {
      try {
        this.supabase.removeChannel(this.realtimeChannel);
      } catch (e) {}
      this.realtimeChannel = null;
    }

    // Resetear variables del componente para un inicio limpio
    this.roomId = '';
    this.roomCode = '';
    this.roomStatus = 'lobby';
    this.gameState = null;
    this.selectedStarter = null;
    this.opponentUsername = '';

    this.router.navigate(['/']);
  }

  private mapToInGameCard(card: PokemonCard): InGameCard {
    const firstType = card.types[0] || 'normal';
    const name1 = firstType.toUpperCase() + ' RÁPIDO';
    const name2 = firstType.toUpperCase() + ' IMPACTO';

    return {
      ...card,
      gameId: Math.random().toString(36).substr(2, 9),
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
}
