import { describe, it, expect } from 'bun:test';
import { calcDamage, getTypeMultiplier } from '../src/damage';
import { fixedRng } from '../src/rng';
import type { BattlePokemon, BattleMove, TypeChart } from '../src/types';

// Minimal type chart for tests
const chart: TypeChart = {
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, ground: 0 },
  ground: { flying: 0, electric: 2, rock: 2, fire: 2, steel: 2 },
  fire: { grass: 2, water: 0.5, fire: 0.5, rock: 0.5 },
  normal: {},
  water: {},
};

const defaultStats = { hp: 115, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };
const defaultStages = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

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
    battleStats: { ...defaultStats },
    currentHp: 115,
    maxHp: 115,
    stages: { ...defaultStages },
    status: null,
    moves: [],
    ...overrides,
  };
}

// Special move (uses spa/spd)
const thunderbolt: BattleMove = {
  moveId: 'thunderbolt',
  name: 'Thunderbolt',
  type: 'electric',
  power: 90,
  accuracy: 100,
  priority: 0,
  damageClass: 'special',
};

const earthquake: BattleMove = {
  moveId: 'earthquake',
  name: 'Earthquake',
  type: 'ground',
  power: 100,
  accuracy: 100,
  priority: 0,
  damageClass: 'physical',
};

const flamethrower: BattleMove = {
  moveId: 'flamethrower',
  name: 'Flamethrower',
  type: 'fire',
  power: 90,
  accuracy: 100,
  priority: 0,
  damageClass: 'special',
};

// fixedRng({ int: 100, float: 0.5 }):
//   - accuracy check: int(1,100) = 100, so 100 > accuracy is false → no miss
//   - randomFactor: int(85,100) = 100 → 100/100 = 1
//   - crit: float() = 0.5, 0.5 < 1/24 = false → no crit
const rng = fixedRng({ int: 100, float: 0.5 });

describe('getTypeMultiplier', () => {
  it('returns x4 for double weakness (electric vs water/flying)', () => {
    expect(getTypeMultiplier('electric', ['water', 'flying'], chart)).toBe(4);
  });

  it('returns x0 for immunity (ground vs flying)', () => {
    expect(getTypeMultiplier('ground', ['flying'], chart)).toBe(0);
  });

  it('returns x1 for unknown type combination (defaults to 1)', () => {
    expect(getTypeMultiplier('normal', ['normal'], chart)).toBe(1);
  });
});

describe('calcDamage — type effectiveness', () => {
  it('electric vs water/flying deals damage tagged as super, multiplied x4', () => {
    // baseDamage = floor(floor((22 * 90 * 85) / 85) / 50) + 2 = 41
    // damage = floor(41 * 4) = 164
    const attacker = makePokemon({ types: ['normal'] }); // no STAB
    const defender = makePokemon({ types: ['water', 'flying'] });

    const result = calcDamage(attacker, defender, thunderbolt, chart, rng);

    expect(result.missed).toBe(false);
    expect(result.crit).toBe(false);
    expect(result.effectiveness).toBe('super');
    expect(result.damage).toBe(164);
  });

  it('ground vs flying produces immunity: damage 0, effectiveness immune', () => {
    const attacker = makePokemon({ types: ['ground'] });
    const defender = makePokemon({ types: ['flying'] });

    const result = calcDamage(attacker, defender, earthquake, chart, rng);

    expect(result.damage).toBe(0);
    expect(result.effectiveness).toBe('immune');
    expect(result.missed).toBe(false);
    expect(result.crit).toBe(false);
  });
});

describe('calcDamage — STAB bonus', () => {
  it('fire attacker using fire move deals 1.5x damage compared to water attacker', () => {
    const fireAttacker = makePokemon({ types: ['fire'] });
    const waterAttacker = makePokemon({ types: ['water'] });
    const normalDefender = makePokemon({ types: ['normal'] }); // neutral to fire

    // baseDamage = 41 (same calc: spa=85, spd=85, power=90)
    // without STAB: floor(41 * 1) = 41
    // with STAB:    floor(41 * 1.5) = floor(61.5) = 61
    const withStab = calcDamage(fireAttacker, normalDefender, flamethrower, chart, rng);
    const withoutStab = calcDamage(waterAttacker, normalDefender, flamethrower, chart, rng);

    expect(withStab.damage).toBe(61);
    expect(withoutStab.damage).toBe(41);
    expect(withStab.damage).toBe(Math.floor(withoutStab.damage * 1.5));
  });
});

describe('calcDamage — status moves', () => {
  it('status move (no power) deals 0 damage', () => {
    const statusMove: BattleMove = {
      moveId: 'toxic',
      name: 'Toxic',
      type: 'poison',
      power: null,
      accuracy: 90,
      priority: 0,
      damageClass: 'status',
      appliesStatus: 'poison',
    };
    const attacker = makePokemon();
    const defender = makePokemon();

    const result = calcDamage(attacker, defender, statusMove, chart, rng);

    expect(result.damage).toBe(0);
    expect(result.missed).toBe(false);
  });
});
