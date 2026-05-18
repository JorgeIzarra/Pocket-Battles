import type { BattlePokemon, BattleMove, TypeChart, StatKey } from './types';
import { LEVEL, effectiveStat } from './stats';
import type { Rng } from './rng';

export function getTypeMultiplier(
  moveType: string,
  defenderTypes: string[],
  chart: TypeChart,
): number {
  let multiplier = 1;
  for (const defType of defenderTypes) {
    multiplier *= chart[moveType]?.[defType] ?? 1;
  }
  return multiplier;
}

export type Effectiveness = 'super' | 'normal' | 'weak' | 'immune';

export interface DamageResult {
  damage: number;
  effectiveness: Effectiveness;
  crit: boolean;
  missed: boolean;
}

function chooseStats(move: BattleMove): { atkKey: StatKey; defKey: StatKey } {
  if (move.damageClass === 'physical') return { atkKey: 'atk', defKey: 'def' };
  return { atkKey: 'spa', defKey: 'spd' };
}

export function calcDamage(
  attacker: BattlePokemon,
  defender: BattlePokemon,
  move: BattleMove,
  chart: TypeChart,
  rng: Rng,
): DamageResult {
  if (move.damageClass === 'status' || !move.power) {
    return { damage: 0, effectiveness: 'normal', crit: false, missed: false };
  }

  const accuracy = move.accuracy ?? 100;
  if (rng.int(1, 100) > accuracy) {
    return { damage: 0, effectiveness: 'normal', crit: false, missed: true };
  }

  const { atkKey, defKey } = chooseStats(move);
  const attackStat = effectiveStat(attacker, atkKey);
  const defenseStat = effectiveStat(defender, defKey);

  const baseDamage =
    Math.floor(
      Math.floor(
        (Math.floor((2 * LEVEL) / 5 + 2) * move.power * attackStat) / defenseStat,
      ) / 50,
    ) + 2;

  const typeMultiplier = getTypeMultiplier(move.type, defender.types, chart);
  if (typeMultiplier === 0) {
    return { damage: 0, effectiveness: 'immune', crit: false, missed: false };
  }

  const randomFactor = rng.int(85, 100) / 100;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const crit = rng.float() < 1 / 24;
  const critMod = crit ? 1.5 : 1;
  const isPhysical = move.damageClass === 'physical';
  const burnMod = attacker.status?.kind === 'burn' && isPhysical ? 0.5 : 1;
  const fieldMod = 1;

  const modifier = randomFactor * stab * typeMultiplier * critMod * burnMod * fieldMod;
  const damage = Math.max(1, Math.floor(baseDamage * modifier));

  const effectiveness: Effectiveness =
    typeMultiplier > 1 ? 'super' : typeMultiplier < 1 ? 'weak' : 'normal';

  return { damage, effectiveness, crit, missed: false };
}
