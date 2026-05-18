import { Hono } from 'hono';
import * as battleService from '../services/battleService';
import type { PlayerAction } from '@pocket-battles/battle-engine';

const battle = new Hono();

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Error interno del servidor';
}

// POST /battle/:code/action — un jugador envía su decisión
battle.post('/:code/action', async (c) => {
  try {
    const code = c.req.param('code').toUpperCase();
    const body = await c.req.json<PlayerAction>();
    if (!body.playerId) return c.json({ error: 'playerId es requerido' }, 400);
    if (!body.type) return c.json({ error: 'type es requerido (move | switch)' }, 400);
    const result = await battleService.submitAction(code, body);
    return c.json(result);
  } catch (err) {
    return c.json({ error: errMsg(err) }, 400);
  }
});

// GET /battle/:code/state — estado completo (carga inicial / plan B)
battle.get('/:code/state', async (c) => {
  try {
    const state = await battleService.getState(c.req.param('code').toUpperCase());
    if (!state) return c.json({ error: 'Batalla no encontrada' }, 404);
    return c.json(state);
  } catch (err) {
    return c.json({ error: errMsg(err) }, 404);
  }
});

// GET /battle/:code/stream — SSE: el cliente recibe el estado nuevo tras cada turno
battle.get('/:code/stream', async (c) => {
  const code = c.req.param('code').toUpperCase();

  const initialState = await battleService.getState(code);
  if (!initialState) return c.json({ error: 'Batalla no encontrada' }, 404);

  const enc = new TextEncoder();
  let clientCtrl: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      clientCtrl = ctrl;
      battleService.addSSEClient(code, ctrl);
      // Push current state immediately so the client doesn't have to poll
      ctrl.enqueue(enc.encode(`data: ${JSON.stringify(initialState)}\n\n`));
    },
    cancel() {
      battleService.removeSSEClient(code, clientCtrl);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',     // disable nginx buffering
    },
  });
});

export default battle;
