import { Room } from '../models/Room';
import { Battle } from '../models/Battle';
import { Pokemon } from '../models/Pokemon';
import { Move } from '../models/Move';
import { TypeChart } from '../models/TypeChart';
import { calcHp, calcStat } from '@pocket-battles/battle-engine';
import type { BattlePokemon, BattleMove, StatKey, StatusKind } from '@pocket-battles/battle-engine';

// --- Room code generation ---

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes 0/O and 1/I

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

async function uniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    if (!(await Room.exists({ code }))) return code;
  }
  throw new Error('No se pudo generar un código único para la sala');
}

// --- Public API ---

export async function createRoom(playerName: string) {
  const code = await uniqueCode();
  const playerId = crypto.randomUUID();
  await Room.create({
    code,
    status: 'waiting',
    players: [{ playerId, name: playerName, ready: false, pendingTeam: null }],
  });
  return { code, playerId };
}

export async function joinRoom(code: string, playerName: string) {
  const room = await Room.findOne({ code });
  if (!room) throw new Error('Sala no encontrada');
  const players = room.players as unknown as any[];
  if (room.status !== 'waiting') throw new Error('La sala ya no acepta jugadores');
  if (players.length >= 2) throw new Error('La sala está llena');

  const playerId = crypto.randomUUID();
  players.push({ playerId, name: playerName, ready: false, pendingTeam: null });
  room.status = 'ready';
  await room.save();
  return { playerId };
}

export async function getRoomState(code: string) {
  const room = await Room.findOne({ code });
  if (!room) throw new Error('Sala no encontrada');
  const players = room.players as unknown as any[];
  return {
    code: room.code,
    status: room.status,
    players: players.map(p => ({ name: p.name, ready: p.ready })),
  };
}

// --- Team submission ---

interface TeamEntry {
  pokemonId: string;   // MongoDB _id string
  moveIds: string[];   // moveId strings ("flamethrower", etc.)
}

async function validateMoveset(pokemonDoc: any, moveIds: string[]): Promise<void> {
  const name = pokemonDoc.name as string;

  if (!Array.isArray(moveIds) || moveIds.length !== 4)
    throw new Error(`${name}: debes elegir exactamente 4 movimientos`);
  if (new Set(moveIds).size !== 4)
    throw new Error(`${name}: no se permiten movimientos repetidos`);

  const valid = new Set<string>([
    ...(pokemonDoc.damagingMoveIds as string[]),
    ...(pokemonDoc.statusMoveIds as string[]),
  ]);
  for (const id of moveIds) {
    if (!valid.has(id))
      throw new Error(`${name}: el movimiento '${id}' no pertenece a este Pokémon`);
  }

  const hasAttack = moveIds.some(id =>
    (pokemonDoc.damagingMoveIds as string[]).includes(id),
  );
  if (!hasAttack)
    throw new Error(`${name}: necesita al menos un movimiento de daño`);
}

export async function submitTeam(
  code: string,
  playerId: string,
  team: TeamEntry[],
): Promise<void> {
  const room = await Room.findOne({ code });
  if (!room) throw new Error('Sala no encontrada');
  if (room.status !== 'ready') throw new Error('La sala no está en estado de preparación');

  const players = room.players as unknown as any[];
  const playerIdx = players.findIndex((p: any) => p.playerId === playerId);
  if (playerIdx === -1) throw new Error('No perteneces a esta sala');

  if (!Array.isArray(team) || team.length < 1 || team.length > 6)
    throw new Error('El equipo debe tener entre 1 y 6 Pokémon');

  for (const entry of team) {
    if (!entry.pokemonId || !Array.isArray(entry.moveIds))
      throw new Error('Formato de equipo inválido: cada entrada necesita pokemonId y moveIds');
    const pokemon = await Pokemon.findById(entry.pokemonId);
    if (!pokemon)
      throw new Error(`Pokémon '${entry.pokemonId}' no encontrado en el catálogo`);
    await validateMoveset(pokemon, entry.moveIds);
  }

  players[playerIdx].pendingTeam = team;
  players[playerIdx].ready = true;
  room.markModified('players');
  await room.save();
}

// --- Start battle ---

function randomIvs(): Record<StatKey, number> {
  const roll = () => Math.floor(Math.random() * 32); // 0–31
  return { hp: roll(), atk: roll(), def: roll(), spa: roll(), spd: roll(), spe: roll() };
}

export async function startBattle(code: string): Promise<void> {
  const room = await Room.findOne({ code });
  if (!room) throw new Error('Sala no encontrada');
  if (room.status !== 'ready') throw new Error('La sala no está lista para iniciar');

  const players = room.players as unknown as any[];
  if (players.length < 2) throw new Error('Se necesitan 2 jugadores para iniciar');
  if (!players.every((p: any) => p.ready))
    throw new Error('Ambos jugadores deben enviar su equipo antes de iniciar');

  // Collect all unique ids for bulk fetches
  const allPokemonIds = players.flatMap((p: any) =>
    (p.pendingTeam as TeamEntry[]).map(e => e.pokemonId),
  );
  const allMoveIds = [
    ...new Set(
      players.flatMap(p =>
        (p.pendingTeam as TeamEntry[]).flatMap(e => e.moveIds),
      ),
    ),
  ];

  const [pokemonDocs, moveDocs, typeChartDoc] = await Promise.all([
    Pokemon.find({ _id: { $in: allPokemonIds } }),
    Move.find({ moveId: { $in: allMoveIds } }),
    TypeChart.findOne({}),
  ]);

  if (!typeChartDoc)
    throw new Error('TypeChart no encontrada en la base de datos — ejecuta el seed primero');

  const pokemonMap = new Map(pokemonDocs.map(p => [p._id.toString(), p]));
  const moveMap = new Map(moveDocs.map(m => [m.moveId as string, m]));

  const playerStates = players.map(player => {
    const team: BattlePokemon[] = (player.pendingTeam as TeamEntry[]).map(entry => {
      const pokemon = pokemonMap.get(entry.pokemonId);
      if (!pokemon) throw new Error(`Pokémon '${entry.pokemonId}' no encontrado`);

      const ivs = randomIvs();
      const bs = pokemon.baseStats as any;
      const battleStats = {
        hp:  calcHp(bs.hp,  ivs.hp),
        atk: calcStat(bs.atk, ivs.atk),
        def: calcStat(bs.def, ivs.def),
        spa: calcStat(bs.spa, ivs.spa),
        spd: calcStat(bs.spd, ivs.spd),
        spe: calcStat(bs.spe, ivs.spe),
      };

      const moves: BattleMove[] = entry.moveIds.map(mid => {
        const m = moveMap.get(mid);
        if (!m) throw new Error(`Movimiento '${mid}' no encontrado en la base de datos`);
        return {
          moveId: m.moveId as string,
          name: m.name as string,
          type: m.type as string,
          power: (m.power as number | null) ?? null,
          accuracy: (m.accuracy as number | null) ?? null,
          priority: (m.priority as number) ?? 0,
          damageClass: m.damageClass as 'physical' | 'special' | 'status',
          ...(m.appliesStatus ? { appliesStatus: m.appliesStatus as StatusKind } : {}),
        };
      });

      return {
        pokemonId: pokemon._id.toString(),
        pokedexId: pokemon.pokedexId as number,
        name: pokemon.name as string,
        types: pokemon.types as string[],
        spriteUrl: (pokemon.spriteUrl as string) ?? '',
        level: 50,
        ivs,
        baseStats: bs as Record<StatKey, number>,
        battleStats,
        currentHp: battleStats.hp,
        maxHp: battleStats.hp,
        stages: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        status: null,
        moves,
      } satisfies BattlePokemon;
    });

    return { playerId: player.playerId, name: player.name, team, activeIndex: 0 };
  });

  await Promise.all([
    Battle.create({
      roomCode: code,
      turn: 1,
      status: 'active',
      players: playerStates,
      pendingActions: [],
      typeChart: (typeChartDoc as any).chart,
      battleLog: [],
      winnerPlayerId: null,
    }),
    Room.updateOne({ code }, { $set: { status: 'in_battle' } }),
  ]);
}
