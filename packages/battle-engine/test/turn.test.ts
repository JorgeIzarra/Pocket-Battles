import { describe, it, expect } from 'bun:test';
import { resolveTurn } from '../src/turn';
import { fixedRng } from '../src/rng';
import type { BattleState, BattlePokemon, BattleMove, PlayerAction } from '../src/types';

const testChart = {
  normal: {},
  fire: {},
};

const tackle: BattleMove = {
  moveId: 'tackle',
  name: 'Tackle',
  type: 'normal',
  power: 40,
  accuracy: 100,
  priority: 0,
  damageClass: 'physical',
};

// fixedRng({ int: 100, float: 0.5 }): no miss, no crit, randomFactor=1
const rng = fixedRng({ int: 100, float: 0.5 });

function makePokemon(overrides: Partial<BattlePokemon> = {}): BattlePokemon {
  return {
    pokemonId: 'test',
    pokedexId: 1,
    name: 'TestMon',
    types: ['normal'],
    spriteFrontUrl: '',
    spriteBackUrl: '',
    level: 50,
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
    battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 },
    currentHp: 115,
    maxHp: 115,
    stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    status: null,
    moves: [tackle],
    ...overrides,
  };
}

function makeState(p1mon: BattlePokemon, p2mon: BattlePokemon): BattleState {
  return {
    roomCode: 'TEST',
    turn: 1,
    status: 'active',
    players: [
      { playerId: 'p1', name: 'Player 1', team: [p1mon], activeIndex: 0 },
      { playerId: 'p2', name: 'Player 2', team: [p2mon], activeIndex: 0 },
    ],
    typeChart: testChart,
    battleLog: [],
    winnerPlayerId: null,
  };
}

describe('resolveTurn — turn counter', () => {
  it('increments turn by 1 each resolution', () => {
    const state = makeState(makePokemon(), makePokemon());
    const a1: PlayerAction = { playerId: 'p1', type: 'move', moveId: 'tackle' };
    const a2: PlayerAction = { playerId: 'p2', type: 'move', moveId: 'tackle' };

    const { state: next } = resolveTurn(state, a1, a2, rng);
    expect(next.turn).toBe(2);
  });
});

describe('resolveTurn — action ordering by speed', () => {
  it('faster pokemon acts first (its attack log appears first)', () => {
    const fast = makePokemon({
      name: 'FastMon',
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 100 },
    });
    const slow = makePokemon({
      name: 'SlowMon',
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 10 },
    });
    const state = makeState(fast, slow);

    const a1: PlayerAction = { playerId: 'p1', type: 'move', moveId: 'tackle' };
    const a2: PlayerAction = { playerId: 'p2', type: 'move', moveId: 'tackle' };

    const { log } = resolveTurn(state, a1, a2, rng);

    const attackLogs = log.filter(e => e.text.includes('usó'));
    expect(attackLogs.length).toBeGreaterThanOrEqual(1);
    expect(attackLogs[0].text).toContain('FastMon');
  });

  it('slower pokemon acts first when order is reversed', () => {
    const fast = makePokemon({
      name: 'FastMon',
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 100 },
    });
    const slow = makePokemon({
      name: 'SlowMon',
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 10 },
    });
    // p1 = slow, p2 = fast → p2 (fast) acts first
    const state: BattleState = {
      roomCode: 'TEST',
      turn: 1,
      status: 'active',
      players: [
        { playerId: 'p1', name: 'Player 1', team: [slow], activeIndex: 0 },
        { playerId: 'p2', name: 'Player 2', team: [fast], activeIndex: 0 },
      ],
      typeChart: testChart,
      battleLog: [],
      winnerPlayerId: null,
    };

    const a1: PlayerAction = { playerId: 'p1', type: 'move', moveId: 'tackle' };
    const a2: PlayerAction = { playerId: 'p2', type: 'move', moveId: 'tackle' };

    const { log } = resolveTurn(state, a1, a2, rng);

    const attackLogs = log.filter(e => e.text.includes('usó'));
    expect(attackLogs[0].text).toContain('FastMon');
  });
});

describe('resolveTurn — switch priority', () => {
  it('switch always acts before a move action', () => {
    const p1mon = makePokemon({ name: 'Mon1' });
    const bench = makePokemon({ name: 'Bench' });
    // Give p2mon high speed so it would normally go first if it were a speed race
    const p2mon = makePokemon({
      name: 'FastMon',
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 200 },
    });

    const state: BattleState = {
      roomCode: 'TEST',
      turn: 1,
      status: 'active',
      players: [
        { playerId: 'p1', name: 'Player 1', team: [p1mon, bench], activeIndex: 0 },
        { playerId: 'p2', name: 'Player 2', team: [p2mon], activeIndex: 0 },
      ],
      typeChart: testChart,
      battleLog: [],
      winnerPlayerId: null,
    };

    const switchAction: PlayerAction = { playerId: 'p1', type: 'switch', switchToIndex: 1 };
    const moveAction: PlayerAction = { playerId: 'p2', type: 'move', moveId: 'tackle' };

    const { log } = resolveTurn(state, switchAction, moveAction, rng);

    const switchIdx = log.findIndex(e => e.text.includes('Bench'));
    const attackIdx = log.findIndex(e => e.text.includes('usó'));

    expect(switchIdx).toBeGreaterThanOrEqual(0);
    expect(attackIdx).toBeGreaterThanOrEqual(0);
    expect(switchIdx).toBeLessThan(attackIdx);
  });
});

describe('resolveTurn — win condition', () => {
  it('debilitating the last pokemon sets winnerPlayerId and status finished', () => {
    // p1 is faster, p2 has 1 HP → p1 attacks and wins
    const p1mon = makePokemon({
      name: 'Winner',
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 100 },
    });
    const p2mon = makePokemon({
      name: 'Loser',
      currentHp: 1,
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 10 },
    });
    const state = makeState(p1mon, p2mon);

    const a1: PlayerAction = { playerId: 'p1', type: 'move', moveId: 'tackle' };
    const a2: PlayerAction = { playerId: 'p2', type: 'move', moveId: 'tackle' };

    const { state: next } = resolveTurn(state, a1, a2, rng);

    expect(next.winnerPlayerId).toBe('p1');
    expect(next.status).toBe('finished');
  });

  it('adds fainted message to log', () => {
    const p1mon = makePokemon({
      name: 'Winner',
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 100 },
    });
    const p2mon = makePokemon({
      name: 'Loser',
      currentHp: 1,
      battleStats: { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 10 },
    });
    const state = makeState(p1mon, p2mon);

    const a1: PlayerAction = { playerId: 'p1', type: 'move', moveId: 'tackle' };
    const a2: PlayerAction = { playerId: 'p2', type: 'move', moveId: 'tackle' };

    const { log } = resolveTurn(state, a1, a2, rng);

    const faintLog = log.find(e => e.text.includes('se debilitó'));
    expect(faintLog).toBeDefined();
    expect(faintLog!.text).toContain('Loser');
  });
});

describe('resolveTurn — immutability', () => {
  it('does not mutate the input state', () => {
    const p1mon = makePokemon();
    const p2mon = makePokemon();
    const state = makeState(p1mon, p2mon);
    const originalHp = state.players[1].team[0].currentHp;

    const a1: PlayerAction = { playerId: 'p1', type: 'move', moveId: 'tackle' };
    const a2: PlayerAction = { playerId: 'p2', type: 'move', moveId: 'tackle' };

    resolveTurn(state, a1, a2, rng);

    // Original state must be unchanged
    expect(state.players[1].team[0].currentHp).toBe(originalHp);
    expect(state.turn).toBe(1);
  });
});
