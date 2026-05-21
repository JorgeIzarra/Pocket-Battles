import { Hono } from 'hono';
import { Pokemon } from '../models/Pokemon';
import { Move } from '../models/Move';

const catalog = new Hono();

// GET /catalog/pokemon?name=&type=&page=1&limit=20
catalog.get('/pokemon', async (c) => {
  try {
    const { name, type, page = '1', limit = '20' } = c.req.query();
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const filter: Record<string, unknown> = {};
    if (name) filter.name = { $regex: name.trim(), $options: 'i' };
    if (type) filter.types = type.trim().toLowerCase();

    const [pokemon, total] = await Promise.all([
      Pokemon.find(filter)
        .select('pokedexId name types baseStats spriteFrontUrl isLegendary isFinalEvolution')
        .sort({ pokedexId: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Pokemon.countDocuments(filter),
    ]);

    return c.json({ pokemon, total, page: pageNum, limit: limitNum });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return c.json({ error: msg }, 500);
  }
});

// GET /catalog/pokemon/:id — detalle con movimientos poblados
catalog.get('/pokemon/:id', async (c) => {
  try {
    const pokemon = await Pokemon.findById(c.req.param('id')).lean();
    if (!pokemon) return c.json({ error: 'Pokémon no encontrado' }, 404);

    const allMoveIds = [
      ...(pokemon as any).damagingMoveIds as string[],
      ...(pokemon as any).statusMoveIds as string[],
    ];
    const moves = await Move.find({ moveId: { $in: allMoveIds } })
      .select('moveId name type power accuracy priority damageClass appliesStatus')
      .lean();

    return c.json({ ...pokemon, moves });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno';
    return c.json({ error: msg }, 500);
  }
});

export default catalog;
