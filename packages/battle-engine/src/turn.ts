import type { BattleState, PlayerAction, BattlePokemon, LogEntry } from './types';
import { calcDamage } from './damage';
import { effectiveStat } from './stats';
import {
  applyStatus, applyEndOfTurnStatusDamage, tickStatus, clearStatusAndStages,
} from './status';
import type { Rng } from './rng';

function actionPriority(state: BattleState, action: PlayerAction): number {
  if (action.type === 'switch') return 6;
  const move = findMove(state, action);
  return move?.priority ?? 0;
}

function getActivePokemon(state: BattleState, playerId: string): BattlePokemon {
  const player = state.players.find(p => p.playerId === playerId)!;
  return player.team[player.activeIndex];
}

function findMove(state: BattleState, action: PlayerAction) {
  if (action.type !== 'move') return undefined;
  const active = getActivePokemon(state, action.playerId);
  return active.moves.find(m => m.moveId === action.moveId);
}

function orderActions(
  state: BattleState, a1: PlayerAction, a2: PlayerAction, rng: Rng,
): PlayerAction[] {
  const p1 = actionPriority(state, a1);
  const p2 = actionPriority(state, a2);
  if (p1 !== p2) return p1 > p2 ? [a1, a2] : [a2, a1];

  const s1 = effectiveStat(getActivePokemon(state, a1.playerId), 'spe');
  const s2 = effectiveStat(getActivePokemon(state, a2.playerId), 'spe');
  if (s1 !== s2) return s1 > s2 ? [a1, a2] : [a2, a1];

  return rng.float() < 0.5 ? [a1, a2] : [a2, a1];
}

function applySwitch(state: BattleState, action: PlayerAction, log: LogEntry[]): void {
  const player = state.players.find(p => p.playerId === action.playerId)!;
  const leaving = player.team[player.activeIndex];
  clearStatusAndStages(leaving);
  player.activeIndex = action.switchToIndex!;
  const entering = player.team[player.activeIndex];
  log.push({ text: `¡Adelante, ${entering.name}!`, kind: 'meta', actorId: entering.pokemonId });
}

function applyMove(
  state: BattleState, action: PlayerAction, rng: Rng, log: LogEntry[],
): void {
  const attackerPlayer = state.players.find(p => p.playerId === action.playerId)!;
  const defenderPlayer = state.players.find(p => p.playerId !== action.playerId)!;
  const attacker = attackerPlayer.team[attackerPlayer.activeIndex];
  const defender = defenderPlayer.team[defenderPlayer.activeIndex];

  if (attacker.currentHp <= 0) return;

  const move = attacker.moves.find(m => m.moveId === action.moveId)!;
  const useEntry: LogEntry = { text: `${attacker.name} usó ${move.name}.`, kind: 'normal', actorId: attacker.pokemonId };
  log.push(useEntry);

  const result = calcDamage(attacker, defender, move, state.typeChart, rng);

  if (result.missed) {
    log.push({ text: `¡${attacker.name} falló el ataque!`, kind: 'normal' });
    return;
  }

  useEntry.targetId = defender.pokemonId;

  if (result.damage > 0) {
    defender.currentHp = Math.max(0, defender.currentHp - result.damage);
    useEntry.targetHpAfter = defender.currentHp;
    if (result.crit) log.push({ text: '¡Un golpe crítico!', kind: 'crit' });
    if (result.effectiveness === 'super')
      log.push({ text: '¡Es supereficaz!', kind: 'super' });
    if (result.effectiveness === 'weak')
      log.push({ text: 'No es muy eficaz…', kind: 'weak' });
    if (result.effectiveness === 'immune')
      log.push({ text: `No afecta a ${defender.name}…`, kind: 'weak' });
  }

  if (move.appliesStatus && defender.currentHp > 0) {
    applyStatus(defender, move.appliesStatus, log);
  }

  if (defender.currentHp <= 0) {
    log.push({ text: `¡${defender.name} se debilitó!`, kind: 'meta' });
  }
}

function checkWinner(state: BattleState): string | null {
  for (const player of state.players) {
    const allFainted = player.team.every(p => p.currentHp <= 0);
    if (allFainted) {
      const other = state.players.find(p => p.playerId !== player.playerId)!;
      return other.playerId;
    }
  }
  return null;
}

export function resolveTurn(
  state: BattleState,
  actionA: PlayerAction,
  actionB: PlayerAction,
  rng: Rng,
): { state: BattleState; log: LogEntry[] } {
  const next: BattleState = structuredClone(state);
  const log: LogEntry[] = [];

  const ordered = orderActions(next, actionA, actionB, rng);

  for (const action of ordered) {
    if (next.winnerPlayerId) break;
    if (action.type === 'switch') {
      applySwitch(next, action, log);
    } else {
      applyMove(next, action, rng, log);
    }
    next.winnerPlayerId = checkWinner(next);
  }

  if (!next.winnerPlayerId) {
    for (const player of next.players) {
      const active = player.team[player.activeIndex];
      if (active.currentHp > 0) applyEndOfTurnStatusDamage(active, log);
    }
    next.winnerPlayerId = checkWinner(next);
  }

  for (const player of next.players) {
    const active = player.team[player.activeIndex];
    tickStatus(active, log);
  }

  next.turn += 1;
  next.battleLog.push(...log);
  if (next.winnerPlayerId) next.status = 'finished';

  return { state: next, log };
}
