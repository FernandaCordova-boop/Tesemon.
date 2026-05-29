export interface PokemonCard {
  id: number;
  name: string;
  image: string;
  types: string[];
  attack: number;
  defense: number;
  hp: number;
  specialAbility: string;
  level: string; // Common, Uncommon, Rare, Epic, Legendary
  description: string;
}
