import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, tap, catchError, timeout } from 'rxjs/operators';
import { PokemonCard } from '../models/pokemon-card.model';
import { STATIC_POKEMON_CARDS } from './static-cards';

@Injectable({
  providedIn: 'root',
})
export class PokemonService {
  private apiUrl = 'https://pokeapi.co/api/v2';
  private cardCache = new Map<string | number, PokemonCard>();

  constructor(private http: HttpClient) {
    // Pre-cargar la cache con las cartas estáticas para que la app responda al instante (0ms)
    // y sea 100% inmune a la lentitud de red, fallos del servidor o bloqueadores en el navegador.
    for (const card of STATIC_POKEMON_CARDS) {
      this.cardCache.set(card.id, card);
    }
  }

  getPokemonCard(idOrName: string | number): Observable<PokemonCard> {
    if (this.cardCache.has(idOrName)) {
      return of(this.cardCache.get(idOrName)!);
    }

    const idNum = typeof idOrName === 'number' ? idOrName : parseInt(idOrName, 10) || 906;

    // Añadimos timeout de 1.5 segundos para que cargue rapidísimo y no congele el juego
    const pokemonReq = this.http.get<any>(`${this.apiUrl}/pokemon/${idOrName}`).pipe(
      timeout(1500),
      catchError(() => of(null))
    );
    
    const speciesReq = this.http.get<any>(`${this.apiUrl}/pokemon-species/${idOrName}`).pipe(
      timeout(1500),
      catchError(() => of(null))
    );

    return forkJoin([pokemonReq, speciesReq]).pipe(
      map(([pokemonData, speciesData]) => {
        if (!pokemonData) {
          // Devuelve una carta de novena generación correcta si falla
          return this.getFallbackCardForId(idNum);
        }
        return this.mapToPokemonCard(pokemonData, speciesData);
      }),
      tap((card) => {
        this.cardCache.set(idOrName, card);
      }),
      catchError(() => of(this.getFallbackCardForId(idNum)))
    );
  }

  private getFallbackCard(): PokemonCard {
    return this.getFallbackCardForId(906);
  }

  private getFallbackCardForId(id: number): PokemonCard {
    const name = this.getGen9Name(id);
    const type = this.getGen9Type(id);
    
    // Configurar estadísticas coherentes estilo GBA
    const attack = 300 + (id % 15) * 20;
    const defense = 250 + (id % 15) * 20;
    const hp = 500 + (id % 15) * 30;

    return {
      id,
      name,
      image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
      types: [type],
      attack,
      defense,
      hp,
      specialAbility: 'Espíritu Paldea',
      level: id % 10 === 0 ? 'Legendaria' : (id % 5 === 0 ? 'Épica' : 'Común'),
      description: `Un extraordinario Pokémon de la región de Paldea (#${id}) con una presencia asombrosa.`
    };
  }

  private mapToPokemonCard(pokemonData: any, speciesData: any): PokemonCard {
    const id = pokemonData?.id || 0;
    const rawName = pokemonData?.name || 'Desconocido';
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    
    const image = pokemonData?.sprites?.other?.['official-artwork']?.front_default 
      || pokemonData?.sprites?.other?.dream_world?.front_default 
      || pokemonData?.sprites?.front_default
      || '';

    const types = pokemonData?.types?.map((t: any) => t?.type?.name) || ['normal'];

    const baseHp = pokemonData?.stats?.find((s: any) => s?.stat?.name === 'hp')?.base_stat || 50;
    const baseAttack = pokemonData?.stats?.find((s: any) => s?.stat?.name === 'attack')?.base_stat || 50;
    const baseDefense = pokemonData?.stats?.find((s: any) => s?.stat?.name === 'defense')?.base_stat || 50;

    const hp = baseHp * 10;
    const attack = baseAttack * 5;
    const defense = baseDefense * 5;

    const ability = pokemonData?.abilities?.find((a: any) => !a?.is_hidden)?.ability?.name 
                 || pokemonData?.abilities?.[0]?.ability?.name 
                 || 'Ninguna';
    const specialAbility = ability.charAt(0).toUpperCase() + ability.slice(1);

    const exp = pokemonData?.base_experience || 100;
    let level = 'Común';
    if (exp >= 250) level = 'Legendaria';
    else if (exp >= 180) level = 'Épica';
    else if (exp >= 120) level = 'Rara';
    else if (exp >= 80) level = 'Poco Común';

    const flavorTextEntries = speciesData?.flavor_text_entries || [];
    let descriptionEntry = flavorTextEntries.find((entry: any) => entry?.language?.name === 'es');
    if (!descriptionEntry) {
      descriptionEntry = flavorTextEntries.find((entry: any) => entry?.language?.name === 'en');
    }
    const description = descriptionEntry ? descriptionEntry.flavor_text.replace(/[\n\f]/g, ' ') : 'Un Pokémon misterioso.';

    return { id, name, image, types, attack, defense, hp, specialAbility, level, description };
  }

  private getGen9Name(id: number): string {
    const names = [
      "Sprigatito", "Floragato", "Meowscarada", "Fuecoco", "Crocalor", "Skeledirge", 
      "Quaxly", "Quaxwell", "Quaquaval", "Lechonk", "Oinkologne", "Tarountula", 
      "Spidops", "Nymble", "Lokix", "Pawmi", "Pawmo", "Pawmot", "Tandemaus", 
      "Maushold", "Fidough", "Dachsbun", "Smoliv", "Dolliv", "Arboliva", 
      "Squawkabilly", "Nacli", "Naclstack", "Garganacl", "Charcadet", "Armarouge", 
      "Ceruledge", "Tadbulb", "Bellibolt", "Wattrel", "Kilowattrel", "Maschiff", 
      "Mabosstiff", "Shroodle", "Grafaiai", "Bramblin", "Brambleghast", "Toedscool", 
      "Toedscruel", "Klawf", "Capsakid", "Scovillain", "Rellor", "Rabsca", 
      "Flittle", "Espathra", "Tinkatink", "Tinkatuff", "Tinkaton", "Wiglett", 
      "Wugtrio", "Bombirdier", "Finizen", "Palafin", "Varoom", "Revavroom", 
      "Cyclizar", "Orthworm", "Glimmet", "Glimmora", "Greavard", "Houndstone", 
      "Flamigo", "Cetoddle", "Cetitan", "Veluza", "Dondozo", "Tatsugiri", 
      "Annihilape", "Clodsire", "Farigiraf", "Dudunsparce", "Kingambit", 
      "Great Tusk", "Scream Tail", "Brute Bonnet", "Flutter Mane", "Iron Treads", 
      "Iron Bundle", "Iron Jugulis", "Iron Moth", "Iron Thorns", "Frigibax", 
      "Arctibax", "Baxcalibur", "Gimmighoul", "Gholdengo", "Wo-Chien", "Chien-Pao", 
      "Ting-Lu", "Chi-Yu", "Roaring Moon", "Iron Valiant", "Koraidon", "Miraidon", 
      "Walking Wake", "Iron Leaves", "Dipplin", "Poltchageist", "Sinistcha", 
      "Okidogi", "Munkidori", "Fezandipiti", "Ogerpon", "Archaludon", "Hydrapple", 
      "Gouging Fire", "Raging Bolt", "Iron Boulder", "Iron Crown", "Terapagos", "Pecharunt"
    ];
    const index = id - 906;
    if (index >= 0 && index < names.length) {
      return names[index];
    }
    return "Paldea-" + id;
  }

  private getGen9Type(id: number): string {
    const types = [
      "grass", "grass", "grass", "fire", "fire", "fire",
      "water", "water", "water", "normal", "normal", "bug",
      "bug", "bug", "bug", "electric", "electric", "electric", "normal",
      "normal", "fairy", "fairy", "grass", "grass", "grass",
      "normal", "rock", "rock", "rock", "fire", "fire",
      "fire", "electric", "electric", "electric", "electric", "dark",
      "dark", "poison", "poison", "grass", "grass", "ground",
      "ground", "rock", "grass", "grass", "bug", "bug",
      "psychic", "psychic", "fairy", "fairy", "fairy", "water",
      "water", "flying", "water", "water", "steel", "steel",
      "dragon", "steel", "rock", "rock", "ghost", "ghost",
      "flying", "ice", "ice", "water", "water", "water",
      "fighting", "poison", "normal", "normal", "dark",
      "ground", "fairy", "grass", "ghost", "ground",
      "water", "dark", "fire", "rock", "dragon",
      "dragon", "dragon", "ghost", "steel", "dark", "dark",
      "dark", "dark", "dragon", "fairy", "fighting", "electric",
      "water", "grass", "grass", "grass", "grass",
      "poison", "poison", "poison", "grass", "steel", "grass",
      "fire", "electric", "rock", "steel", "normal", "poison"
    ];
    const index = id - 906;
    if (index >= 0 && index < types.length) {
      return types[index];
    }
    return "normal";
  }

  // Método para obtener un conjunto de cartas específicas (colección fija)
  getSpecificCards(ids: number[]): Observable<PokemonCard[]> {
    const requests: Observable<PokemonCard>[] = [];
    for (const id of ids) {
      requests.push(
        this.getPokemonCard(id).pipe(
          catchError(() => of(this.getFallbackCardForId(id)))
        )
      );
    }
    return forkJoin(requests);
  }

  // Método para obtener un mazo/sobre de N cartas aleatorias
  getRandomCards(count: number): Observable<PokemonCard[]> {
    const requests: Observable<PokemonCard>[] = [];
    for (let i = 0; i < count; i++) {
      const randomId = Math.floor(Math.random() * 120) + 906;
      requests.push(this.getPokemonCard(randomId));
    }
    return forkJoin(requests);
  }
}
