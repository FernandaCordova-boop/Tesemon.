import { PokemonCard } from './pokemon-card.model';

export interface InGameAttack {
  name: string;
  damagePower: number; // calculated base damage
}

export interface InGameCard extends PokemonCard {
  gameId: string; // Unique ID for this specific instance in a match
  currentHp: number;
  canAttack: boolean;
  isDefending: boolean;
  abilityUsed: boolean;
  pose: 'attack' | 'defense';
  attacks: InGameAttack[];
  hasAttackedThisTurn?: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  deck: InGameCard[];
  hand: InGameCard[];
  field: InGameCard[];
  discard: InGameCard[];
  pokemonDefeated: number;
  lifePoints: number;
}

export interface GameState {
  status: 'waiting' | 'playing' | 'won' | 'lost';
  turnNumber: number;
  activePlayerId: string; // 'player' or 'ai'
  player: PlayerState;
  ai: PlayerState;
  log: string[]; // Battle log messages
}
