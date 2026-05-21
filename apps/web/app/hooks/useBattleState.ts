import { useEffect, useRef, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface BattleMove {
  moveId: string;
  name: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  priority: number;
  damageClass: 'physical' | 'special' | 'status';
  appliesStatus?: string;
}

export interface StatusEffect {
  kind: string;
  remainingTurns: number;
}

export interface BattlePokemon {
  pokemonId: string;
  pokedexId: number;
  name: string;
  types: string[];
  spriteFrontUrl: string;
  spriteBackUrl: string;
  level: number;
  currentHp: number;
  maxHp: number;
  status: StatusEffect | null;
  moves: BattleMove[];
  stages: Record<string, number>;
}

export interface PlayerState {
  playerId: string;
  name: string;
  team: BattlePokemon[];
  activeIndex: number;
}

export interface LogEntry {
  text: string;
  kind: 'meta' | 'super' | 'weak' | 'crit' | 'normal';
}

export interface BattleState {
  roomCode: string;
  turn: number;
  status: 'active' | 'finished';
  players: [PlayerState, PlayerState];
  battleLog: LogEntry[];
  winnerPlayerId: string | null;
}

export function useBattleState(code: string) {
  const [state, setState] = useState<BattleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!code) return;
    const es = new EventSource(`${BASE}/battle/${code}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        setState(JSON.parse(e.data) as BattleState);
      } catch {
        // ignore malformed frames
      }
    };

    es.onerror = () => {
      setError('Perdiste la conexión con la batalla');
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [code]);

  return { state, error };
}
