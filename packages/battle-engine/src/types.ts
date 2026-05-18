export type StatusKind =
  | 'poison' | 'burn' | 'paralysis'
  | 'atk_down' | 'def_down' | 'spe_down';

export type DamageClass = 'physical' | 'special' | 'status';

export interface StatusEffect {
  kind: StatusKind;
  remainingTurns: number;
}

export interface BattleMove {
  moveId: string;
  name: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  priority: number;
  damageClass: DamageClass;
  appliesStatus?: StatusKind;
}

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface BattlePokemon {
  pokemonId: string;
  pokedexId: number;
  name: string;
  types: string[];
  spriteUrl: string;
  level: number;
  ivs: Record<StatKey, number>;
  baseStats: Record<StatKey, number>;
  battleStats: Record<StatKey, number>;
  currentHp: number;
  maxHp: number;
  stages: Record<StatKey, number>;
  status: StatusEffect | null;
  moves: BattleMove[];
}

export interface PlayerState {
  playerId: string;
  name: string;
  team: BattlePokemon[];
  activeIndex: number;
}

export interface PlayerAction {
  playerId: string;
  type: 'move' | 'switch';
  moveId?: string;
  switchToIndex?: number;
}

export type LogKind = 'meta' | 'super' | 'weak' | 'crit' | 'normal';

export interface LogEntry {
  text: string;
  kind: LogKind;
}

export type TypeChart = Record<string, Record<string, number>>;

export interface BattleState {
  roomCode: string;
  turn: number;
  status: 'active' | 'finished';
  players: [PlayerState, PlayerState];
  typeChart: TypeChart;
  battleLog: LogEntry[];
  winnerPlayerId: string | null;
}
