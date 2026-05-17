/**
 * importPokeApi.ts — Seed del catálogo de Pocket Battles
 *
 * Descarga desde PokéAPI y persiste en MongoDB:
 *   - 18 tipos y la TypeChart completa
 *   - Todos los movimientos usables (damagingMoveIds / statusMoveIds)
 *   - 300+ Pokémon filtrados: formas finales de evolución + legendarios/míticos
 *
 * Decisiones de diseño documentadas:
 *   1. Solo se incluyen Pokémon en su forma máxima de evolución, o legendarios/míticos.
 *      Esto hace el simulador más equilibrado y divertido.
 *   2. Se excluyen Pokémon sin sprite (sprites.front_default === null).
 *   3. Se excluyen Pokémon con menos de 4 movimientos usables combinados.
 *      Un movimiento usable es: power > 0 (dañino) o status con efecto soportado.
 *   4. Cada movimiento dañino de tipo 'status' se descarta si no aplica ninguno de:
 *      poison, burn, paralysis, atk_down, def_down, spe_down.
 *
 * Uso:
 *   bun run seed               (MONGO_URL desde env o localhost por defecto)
 *   docker compose run --rm api bun run seed
 */

import mongoose from 'mongoose';
import { Pokemon } from '../models/Pokemon';
import { Move } from '../models/Move';
import { TypeChart } from '../models/TypeChart';

const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://localhost:27017/pocket_battles';
const POKEAPI = 'https://pokeapi.co/api/v2';
const CONCURRENCY = 10;

// ── Mapeos ────────────────────────────────────────────────────────────────────

type StatusKind = 'poison' | 'burn' | 'paralysis' | 'atk_down' | 'def_down' | 'spe_down';

// Ailments de PokéAPI → StatusKind del motor (null = no soportado)
const AILMENT_MAP: Record<string, StatusKind | null> = {
  poison: 'poison',
  'bad-poison': 'poison',
  burn: 'burn',
  paralysis: 'paralysis',
  sleep: null,
  freeze: null,
  confusion: null,
  infatuation: null,
  trap: null,
  'leech-seed': null,
  'no-type': null,
  none: null,
};

// Reducción de stat de PokéAPI → StatusKind de reducción
const STAT_DOWN_MAP: Record<string, StatusKind> = {
  attack: 'atk_down',
  defense: 'def_down',
  speed: 'spe_down',
};

// Nombres de stats de PokéAPI → claves del modelo
const STAT_KEY: Record<string, string> = {
  hp: 'hp',
  attack: 'atk',
  defense: 'def',
  'special-attack': 'spa',
  'special-defense': 'spd',
  speed: 'spe',
};

// ── Utilidades ────────────────────────────────────────────────────────────────

async function fetchJSON(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        console.warn(`  [skip] item ${i}: ${(err as Error).message}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Lógica de estados ─────────────────────────────────────────────────────────

/**
 * Determina el StatusKind que aplica un movimiento.
 * Para movimientos dañinos: solo considera el ailment (efecto secundario).
 * Para movimientos de estado: también considera stat_changes negativos en el rival.
 */
function resolveAppliesStatus(moveData: any): StatusKind | null {
  const ailment: string = moveData.meta?.ailment?.name ?? '';

  if (ailment && ailment in AILMENT_MAP) {
    return AILMENT_MAP[ailment]; // null para ailments no soportados
  }

  // Solo para movimientos de estado puro: reducción de stat del rival
  if (moveData.damage_class?.name === 'status') {
    const statChanges: Array<{ change: number; stat: { name: string } }> =
      moveData.stat_changes ?? [];
    for (const sc of statChanges) {
      if (sc.change < 0 && sc.stat.name in STAT_DOWN_MAP) {
        return STAT_DOWN_MAP[sc.stat.name];
      }
    }
  }

  return null;
}

// ── Paso 1: TypeChart ─────────────────────────────────────────────────────────

async function buildTypeChart(): Promise<Record<string, Record<string, number>>> {
  console.log('\n[1/5] Fetching type chart...');
  const { results: typeList } = await fetchJSON(`${POKEAPI}/type?limit=100`);

  // "unknown" y "shadow" son tipos internos de PokéAPI, no tipos de batalla reales
  const validTypes = typeList.filter(
    (t: any) => !['unknown', 'shadow'].includes(t.name),
  );

  const chart: Record<string, Record<string, number>> = {};

  await mapWithConcurrency(
    validTypes,
    async (t: any) => {
      const d = await fetchJSON(t.url);
      if (!d) return;
      chart[t.name] = {};
      for (const { name } of d.damage_relations.double_damage_to ?? [])
        chart[t.name][name] = 2;
      for (const { name } of d.damage_relations.half_damage_to ?? [])
        chart[t.name][name] = 0.5;
      for (const { name } of d.damage_relations.no_damage_to ?? [])
        chart[t.name][name] = 0;
    },
    CONCURRENCY,
  );

  console.log(`  ✓ ${Object.keys(chart).length} tipos cargados`);
  return chart;
}

// ── Paso 2-3: Pokémon + especies ──────────────────────────────────────────────

interface RawPokemon {
  id: number;
  name: string;
  types: string[];
  baseStats: Record<string, number>;
  spriteUrl: string | null;
  moveNames: string[];
  isLegendary: boolean;
  isMythical: boolean;
  chainUrl: string | null;
}

async function fetchAllPokemon(): Promise<RawPokemon[]> {
  console.log('\n[2/5] Fetching Pokémon list (1025)...');
  const { results: pkList } = await fetchJSON(
    `${POKEAPI}/pokemon?limit=1025&offset=0`,
  );

  console.log('  Fetching Pokémon + species (puede tardar 2-4 min)...');

  const raw = await mapWithConcurrency(
    pkList,
    async (entry: { name: string; url: string }, i: number) => {
      if (i > 0 && i % 250 === 0) console.log(`  ${i} / ${pkList.length}...`);

      const pk = await fetchJSON(entry.url);
      if (!pk) return null;

      const sp = await fetchJSON(pk.species.url);
      if (!sp) return null;

      const baseStats: Record<string, number> = {};
      for (const s of pk.stats ?? []) {
        const key = STAT_KEY[s.stat.name];
        if (key) baseStats[key] = s.base_stat;
      }

      return {
        id: pk.id,
        name: pk.name,
        types: pk.types.map((t: any) => t.type.name),
        baseStats,
        spriteUrl: pk.sprites?.front_default ?? null,
        moveNames: pk.moves.map((m: any) => m.move.name),
        isLegendary: sp.is_legendary ?? false,
        isMythical: sp.is_mythical ?? false,
        chainUrl: sp.evolution_chain?.url ?? null,
      } as RawPokemon;
    },
    CONCURRENCY,
  );

  const valid = raw.filter(Boolean) as RawPokemon[];
  console.log(`  ✓ ${valid.length} Pokémon cargados`);
  return valid;
}

// ── Paso 4: Set de evoluciones finales ────────────────────────────────────────

function walkChain(node: any, finals: Set<string>): void {
  if (!node.evolves_to?.length) {
    finals.add(node.species.name);
  } else {
    for (const child of node.evolves_to) walkChain(child, finals);
  }
}

async function buildFinalEvoSet(rawPokemon: RawPokemon[]): Promise<Set<string>> {
  console.log('\n[3/5] Building final-evolution set...');

  const uniqueChainUrls = [
    ...new Set(rawPokemon.map((p) => p.chainUrl).filter(Boolean) as string[]),
  ];
  console.log(`  ${uniqueChainUrls.length} cadenas evolutivas únicas`);

  const finals = new Set<string>();

  await mapWithConcurrency(
    uniqueChainUrls,
    async (url: string) => {
      const d = await fetchJSON(url);
      if (d) walkChain(d.chain, finals);
    },
    CONCURRENCY,
  );

  console.log(`  ✓ ${finals.size} formas finales de evolución`);
  return finals;
}

// ── Paso 5: Movimientos ───────────────────────────────────────────────────────

interface ProcessedMove {
  moveId: string;
  name: string;
  type: string;
  power: number | null;
  accuracy: number | null;
  priority: number;
  damageClass: string;
  appliesStatus: StatusKind | null;
}

async function fetchMoves(moveNames: string[]): Promise<Map<string, ProcessedMove>> {
  console.log(`\n[4/5] Fetching ${moveNames.length} movimientos únicos...`);

  const moveMap = new Map<string, ProcessedMove>();

  await mapWithConcurrency(
    moveNames,
    async (name: string, i: number) => {
      if (i > 0 && i % 300 === 0) console.log(`  ${i} / ${moveNames.length}...`);

      const d = await fetchJSON(`${POKEAPI}/move/${name}`);
      if (!d || !d.type) return;

      // Nombre en inglés; fallback al slug de PokéAPI
      const englishName =
        d.names?.find((n: any) => n.language.name === 'en')?.name ?? d.name;

      moveMap.set(name, {
        moveId: d.name,
        name: englishName,
        type: d.type.name,
        power: d.power ?? null,
        accuracy: d.accuracy ?? null,
        priority: d.priority ?? 0,
        damageClass: d.damage_class?.name ?? 'status',
        appliesStatus: resolveAppliesStatus(d),
      });
    },
    CONCURRENCY,
  );

  console.log(`  ✓ ${moveMap.size} movimientos procesados`);
  return moveMap;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Pocket Battles — Import PokéAPI   ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await mongoose.connect(MONGO_URL);
  console.log(`MongoDB: ${MONGO_URL}`);

  // Limpiar colecciones (idempotente: re-correr no duplica)
  await Promise.all([
    Pokemon.deleteMany({}),
    Move.deleteMany({}),
    TypeChart.deleteMany({}),
  ]);
  console.log('Colecciones limpiadas.\n');

  // 1. TypeChart
  const chart = await buildTypeChart();
  await TypeChart.create({ chart });

  // 2-3. Pokémon + species
  const rawPokemon = await fetchAllPokemon();

  // 4. Final evolution set
  const finalEvos = await buildFinalEvoSet(rawPokemon);

  // Filtrar: sprite válido + (evolución final OR legendario/mítico)
  const filtered = rawPokemon.filter(
    (p) =>
      p.spriteUrl !== null &&
      (finalEvos.has(p.name) || p.isLegendary || p.isMythical),
  );
  console.log(
    `\n[4.5] Filtro aplicado: ${filtered.length} Pokémon pasan (necesario ≥ 300)`,
  );

  // 5. Movimientos únicos de los Pokémon filtrados
  const allMoveNames = [
    ...new Set(filtered.flatMap((p) => p.moveNames)),
  ];
  const moveMap = await fetchMoves(allMoveNames);

  // Guardar movimientos en MongoDB
  const moveDocs = [...moveMap.values()].filter((m) => m.type);
  await Move.insertMany(moveDocs, { ordered: false }).catch(() => {});
  console.log(`\n[5/5] Moves guardados: ${moveDocs.length}`);

  // Clasificar movimientos por Pokémon y guardar
  let savedPokemon = 0;
  let skippedLessThan4 = 0;
  const pokeDocs = [];

  for (const p of filtered) {
    const damagingMoveIds: string[] = [];
    const statusMoveIds: string[] = [];

    for (const moveName of p.moveNames) {
      const m = moveMap.get(moveName);
      if (!m) continue;

      const isDamaging =
        (m.power ?? 0) > 0 && m.damageClass !== 'status';

      if (isDamaging) {
        damagingMoveIds.push(moveName);
      } else if (m.damageClass === 'status' && m.appliesStatus !== null) {
        statusMoveIds.push(moveName);
      }
      // Resto: descartado (sin efecto soportado)
    }

    // Regla de exclusión: necesita ≥ 4 movimientos usables para poder armar equipo
    if (damagingMoveIds.length + statusMoveIds.length < 4) {
      skippedLessThan4++;
      continue;
    }

    pokeDocs.push({
      pokedexId: p.id,
      name: p.name,
      types: p.types,
      baseStats: p.baseStats,
      spriteUrl: p.spriteUrl!,
      damagingMoveIds,
      statusMoveIds,
      isLegendary: p.isLegendary || p.isMythical,
      isFinalEvolution: finalEvos.has(p.name),
    });
    savedPokemon++;
  }

  await Pokemon.insertMany(pokeDocs, { ordered: false }).catch(() => {});

  // ── Resumen final ────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Seed completo                      ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Pokémon guardados:          ${savedPokemon}`);
  console.log(`  Pokémon omitidos (< 4 mov): ${skippedLessThan4}`);
  console.log(`  Movimientos guardados:      ${moveDocs.length}`);
  console.log(`  Tipos en la TypeChart:      ${Object.keys(chart).length}`);

  if (savedPokemon < 300) {
    console.error('\n⚠  ADVERTENCIA: menos de 300 Pokémon. Revisar filtro.');
    process.exitCode = 1;
  } else {
    console.log(`\n✓  Requisito mínimo de 300 Pokémon cumplido.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed falló:', err);
  process.exit(1);
});
