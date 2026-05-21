import { describe, it, expect } from 'bun:test';
import {
  applyStatus,
  applyEndOfTurnStatusDamage,
  tickStatus,
  clearStatusAndStages,
  STATUS_DURATION,
} from '../src/status';
import type { BattlePokemon, LogEntry } from '../src/types';

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
    moves: [],
    ...overrides,
  };
}

describe('STATUS_DURATION', () => {
  it('is 3', () => {
    expect(STATUS_DURATION).toBe(3);
  });
});

describe('applyStatus', () => {
  it('sets status with remainingTurns = 3', () => {
    const pokemon = makePokemon();
    const log: LogEntry[] = [];

    applyStatus(pokemon, 'poison', log);

    expect(pokemon.status).not.toBeNull();
    expect(pokemon.status!.kind).toBe('poison');
    expect(pokemon.status!.remainingTurns).toBe(3);
    expect(log.length).toBe(1);
  });

  it('does not overwrite existing status (no stacking)', () => {
    const pokemon = makePokemon();
    const log: LogEntry[] = [];

    applyStatus(pokemon, 'poison', log);
    applyStatus(pokemon, 'burn', log);

    expect(pokemon.status!.kind).toBe('poison');
    expect(log.length).toBe(1); // only one message
  });

  it('atk_down immediately reduces atk stage by 1', () => {
    const pokemon = makePokemon();
    const log: LogEntry[] = [];

    applyStatus(pokemon, 'atk_down', log);

    expect(pokemon.stages.atk).toBe(-1);
  });
});

describe('poison — 3-turn lifecycle', () => {
  it('deals 5% maxHp each turn and clears on the 3rd tick', () => {
    const pokemon = makePokemon(); // maxHp = 115
    const log: LogEntry[] = [];

    applyStatus(pokemon, 'poison', log);

    // floor(115 * 0.05) = floor(5.75) = 5 HP per turn
    const dmgPerTurn = Math.floor(pokemon.maxHp * 0.05);
    expect(dmgPerTurn).toBe(5);

    for (let turn = 1; turn <= 3; turn++) {
      applyEndOfTurnStatusDamage(pokemon, log);
      tickStatus(pokemon, log);
      expect(pokemon.currentHp).toBe(115 - dmgPerTurn * turn);
    }

    // After 3 ticks: status cleared, total damage = 15
    expect(pokemon.status).toBeNull();
    expect(pokemon.currentHp).toBe(100);
  });

  it('remainingTurns decrements each tick', () => {
    const pokemon = makePokemon();
    const log: LogEntry[] = [];

    applyStatus(pokemon, 'poison', log);
    expect(pokemon.status!.remainingTurns).toBe(3);

    tickStatus(pokemon, log);
    expect(pokemon.status!.remainingTurns).toBe(2);

    tickStatus(pokemon, log);
    expect(pokemon.status!.remainingTurns).toBe(1);

    tickStatus(pokemon, log);
    expect(pokemon.status).toBeNull();
  });
});

describe('clearStatusAndStages', () => {
  it('removes status and resets all stages to 0', () => {
    const pokemon = makePokemon({
      stages: { hp: 0, atk: 2, def: -1, spa: 0, spd: 0, spe: 1 },
    });
    const log: LogEntry[] = [];

    applyStatus(pokemon, 'poison', log);
    clearStatusAndStages(pokemon);

    expect(pokemon.status).toBeNull();
    expect(pokemon.stages).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });

  it('works even if no status was active', () => {
    const pokemon = makePokemon({ stages: { hp: 0, atk: 3, def: 0, spa: 0, spd: 0, spe: -2 } });

    clearStatusAndStages(pokemon);

    expect(pokemon.status).toBeNull();
    expect(pokemon.stages.atk).toBe(0);
    expect(pokemon.stages.spe).toBe(0);
  });
});
