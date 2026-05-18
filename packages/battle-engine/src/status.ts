import type { BattlePokemon, StatusKind, LogEntry } from './types';

export const STATUS_DURATION = 3;

export function applyStatus(
  pokemon: BattlePokemon,
  kind: StatusKind,
  log: LogEntry[],
): void {
  if (pokemon.status) return;
  pokemon.status = { kind, remainingTurns: STATUS_DURATION };
  log.push({ text: statusApplyMessage(pokemon.name, kind), kind: 'meta' });

  if (kind === 'atk_down') pokemon.stages.atk = clampStage(pokemon.stages.atk - 1);
  if (kind === 'def_down') pokemon.stages.def = clampStage(pokemon.stages.def - 1);
  if (kind === 'spe_down') pokemon.stages.spe = clampStage(pokemon.stages.spe - 1);
}

function clampStage(s: number): number {
  return Math.max(-6, Math.min(6, s));
}

export function applyEndOfTurnStatusDamage(
  pokemon: BattlePokemon,
  log: LogEntry[],
): void {
  if (!pokemon.status) return;
  const { kind } = pokemon.status;
  if (kind === 'poison' || kind === 'burn') {
    const dmg = Math.floor(pokemon.maxHp * 0.05);
    pokemon.currentHp = Math.max(0, pokemon.currentHp - dmg);
    log.push({
      text: `${pokemon.name} sufre daño por ${kind === 'poison' ? 'veneno' : 'quemadura'}.`,
      kind: 'normal',
    });
  }
}

export function tickStatus(pokemon: BattlePokemon, log: LogEntry[]): void {
  if (!pokemon.status) return;
  pokemon.status.remainingTurns -= 1;
  if (pokemon.status.remainingTurns <= 0) {
    log.push({ text: `${pokemon.name} se recuperó de su estado.`, kind: 'meta' });
    pokemon.status = null;
  }
}

export function clearStatusAndStages(pokemon: BattlePokemon): void {
  pokemon.status = null;
  pokemon.stages = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

function statusApplyMessage(name: string, kind: StatusKind): string {
  const m: Record<StatusKind, string> = {
    poison: `¡${name} fue envenenado!`,
    burn: `¡${name} sufrió una quemadura!`,
    paralysis: `¡${name} fue paralizado!`,
    atk_down: `¡Bajó el ataque de ${name}!`,
    def_down: `¡Bajó la defensa de ${name}!`,
    spe_down: `¡Bajó la velocidad de ${name}!`,
  };
  return m[kind];
}
