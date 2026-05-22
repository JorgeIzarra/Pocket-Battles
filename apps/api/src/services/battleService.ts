import { Battle } from '../models/Battle';
import { resolveTurn as engineResolveTurn, realRng } from '@pocket-battles/battle-engine';
import type { BattleState, PlayerAction, LogEntry } from '@pocket-battles/battle-engine';

// --- SSE types ---

export interface SSEPayload {
  state: BattleState;
  turnLog: LogEntry[];
  firstActorPlayerId: string | null;
}

// --- SSE registry ---

type SSECtrl = ReadableStreamDefaultController<Uint8Array>;
const sseClients = new Map<string, Set<SSECtrl>>();
const encoder = new TextEncoder();

export function addSSEClient(code: string, ctrl: SSECtrl): void {
  if (!sseClients.has(code)) sseClients.set(code, new Set());
  sseClients.get(code)!.add(ctrl);
}

export function removeSSEClient(code: string, ctrl: SSECtrl): void {
  sseClients.get(code)?.delete(ctrl);
}

function broadcastSSE(code: string, payload: SSEPayload): void {
  const clients = sseClients.get(code);
  if (!clients || clients.size === 0) return;
  const msg = encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  for (const ctrl of [...clients]) {
    try {
      ctrl.enqueue(msg);
    } catch {
      // Client disconnected
      clients.delete(ctrl);
    }
  }
}

// --- Public API ---

export async function getState(code: string): Promise<BattleState | null> {
  const doc = await Battle.findOne({ roomCode: code }).lean();
  return doc ? (doc as unknown as BattleState) : null;
}

export async function submitAction(
  code: string,
  action: PlayerAction,
): Promise<{ status: 'waiting' | 'resolved'; state?: BattleState }> {
  const battleDoc = await Battle.findOne({ roomCode: code });
  if (!battleDoc) throw new Error('Batalla no encontrada');

  const doc = battleDoc as unknown as any;
  if (doc.status === 'finished') throw new Error('La batalla ya terminó');

  const players = doc.players as Array<{
    playerId: string;
    activeIndex: number;
    team: Array<{ currentHp: number; moves: Array<{ moveId: string }> }>;
  }>;

  // 1. Player belongs to this battle
  const player = players.find(p => p.playerId === action.playerId);
  if (!player) throw new Error('No perteneces a esta batalla');

  const active = player.team[player.activeIndex];

  // 3. Action-specific validation
  if (action.type === 'move') {
    // Moves require the active Pokémon to be alive; switch is valid even when fainted
    if (active.currentHp <= 0)
      throw new Error('Tu Pokémon activo está debilitado — debes cambiar primero');
    if (!action.moveId) throw new Error('moveId es requerido');
    if (!active.moves.some(m => m.moveId === action.moveId))
      throw new Error('Ese movimiento no pertenece a tu Pokémon activo');
  } else if (action.type === 'switch') {
    if (action.switchToIndex === undefined || !Number.isInteger(action.switchToIndex))
      throw new Error('switchToIndex debe ser un entero');
    if (action.switchToIndex < 0 || action.switchToIndex >= player.team.length)
      throw new Error('switchToIndex fuera de rango');
    if (action.switchToIndex === player.activeIndex)
      throw new Error('Ese Pokémon ya está activo');
    if (player.team[action.switchToIndex].currentHp <= 0)
      throw new Error('No puedes cambiar a un Pokémon debilitado');
  } else {
    throw new Error('Tipo de acción inválido: usa "move" o "switch"');
  }

  // 4. Player hasn't acted yet this turn
  const pending = doc.pendingActions as PlayerAction[];
  if (pending.some((a: PlayerAction) => a.playerId === action.playerId))
    throw new Error('Ya enviaste tu acción para este turno');

  // 5. Persist the action
  await Battle.updateOne({ roomCode: code }, { $push: { pendingActions: action } });

  // 6. If both players have now acted, resolve
  if (pending.length === 1) {
    const newState = await resolveTurnDB(code);
    return { status: 'resolved', state: newState };
  }

  return { status: 'waiting' };
}

// --- Internal: resolve turn ---

async function resolveTurnDB(code: string): Promise<BattleState> {
  const doc = await Battle.findOne({ roomCode: code }).lean();
  if (!doc) throw new Error('Batalla no encontrada al resolver turno');

  const battleState = doc as unknown as BattleState;
  const [a, b] = (doc as any).pendingActions as [PlayerAction, PlayerAction];

  const { state: newState, log } = engineResolveTurn(battleState, a, b, realRng);

  const firstActorPokemonId = log.find(e => e.actorId)?.actorId ?? null;
  const firstActorPlayerId = firstActorPokemonId
    ? (newState.players.find(p => p.team.some(pk => pk.pokemonId === firstActorPokemonId))?.playerId ?? null)
    : null;

  await Battle.replaceOne(
    { roomCode: code },
    { ...newState, pendingActions: [] },
  );

  broadcastSSE(code, { state: newState, turnLog: log, firstActorPlayerId });
  return newState;
}
