import { Hono } from 'hono';
import * as roomService from '../services/roomService';
import { optionalAuth } from '../middleware/auth';
import type { AppEnv } from '../types';

const rooms = new Hono<AppEnv>();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Error interno del servidor';
}

// POST /rooms — crear sala
rooms.post('/', optionalAuth, async (c) => {
  try {
    const body = await c.req.json<{ playerName?: string; avatarId?: string | null }>();
    if (!body.playerName?.trim())
      return c.json({ error: 'playerName es requerido' }, 400);
    const clerkUserId = c.get('clerkUserId') ?? null;
    const result = await roomService.createRoom(body.playerName.trim(), clerkUserId, body.avatarId ?? null);
    return c.json(result, 201);
  } catch (err) {
    return c.json({ error: errMsg(err) }, 400);
  }
});

// POST /rooms/:code/join — segundo jugador se une
rooms.post('/:code/join', optionalAuth, async (c) => {
  try {
    const body = await c.req.json<{ playerName?: string; avatarId?: string | null }>();
    if (!body.playerName?.trim())
      return c.json({ error: 'playerName es requerido' }, 400);
    const clerkUserId = c.get('clerkUserId') ?? null;
    const result = await roomService.joinRoom(
      c.req.param('code').toUpperCase(),
      body.playerName.trim(),
      clerkUserId,
      body.avatarId ?? null,
    );
    return c.json(result);
  } catch (err) {
    return c.json({ error: errMsg(err) }, 400);
  }
});

// GET /rooms/:code — estado del lobby
rooms.get('/:code', async (c) => {
  try {
    const result = await roomService.getRoomState(c.req.param('code').toUpperCase());
    return c.json(result);
  } catch (err) {
    return c.json({ error: errMsg(err) }, 404);
  }
});

// POST /rooms/:code/team — enviar equipo armado
rooms.post('/:code/team', async (c) => {
  try {
    const body = await c.req.json<{
      playerId?: string;
      team?: { pokemonId: string; moveIds: string[] }[];
    }>();
    if (!body.playerId)
      return c.json({ error: 'playerId es requerido' }, 400);
    if (!body.team)
      return c.json({ error: 'team es requerido' }, 400);
    await roomService.submitTeam(
      c.req.param('code').toUpperCase(),
      body.playerId,
      body.team,
    );
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: errMsg(err) }, 400);
  }
});

// POST /rooms/:code/start — iniciar la partida
rooms.post('/:code/start', async (c) => {
  try {
    await roomService.startBattle(c.req.param('code').toUpperCase());
    return c.json({ code: c.req.param('code').toUpperCase() });
  } catch (err) {
    return c.json({ error: errMsg(err) }, 400);
  }
});

export default rooms;
