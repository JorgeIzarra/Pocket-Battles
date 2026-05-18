import type { BattlePokemon, StatKey } from './types';

export const LEVEL = 50;

// hp = floor(((2*baseHp + ivHp) * level) / 100) + level + 10
export function calcHp(baseHp: number, ivHp: number): number {
  return Math.floor(((2 * baseHp + ivHp) * LEVEL) / 100) + LEVEL + 10;
}

// stat = floor(((2*baseStat + ivStat) * level) / 100) + 5
export function calcStat(baseStat: number, ivStat: number): number {
  return Math.floor(((2 * baseStat + ivStat) * LEVEL) / 100) + 5;
}

// stage >= 0 => (2 + stage) / 2 ; else => 2 / (2 - stage)
export function stageMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
}

export function effectiveStat(pokemon: BattlePokemon, key: StatKey): number {
  const base = pokemon.battleStats[key];
  return Math.floor(base * stageMultiplier(pokemon.stages[key] ?? 0));
}
