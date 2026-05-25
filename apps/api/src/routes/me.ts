import { Hono } from 'hono';
import { requireAuth, clerk } from '../middleware/auth';
import { VALID_AVATARS } from '../lib/avatars';
import { Subscription } from '../models/Subscription';
import type { AppEnv } from '../types';

const me = new Hono<AppEnv>();

// GET /me — verifica el JWT y devuelve datos básicos del usuario autenticado
me.get('/', requireAuth, async (c) => {
  const clerkUserId = c.get('clerkUserId')!;
  try {
    const user = await clerk.users.getUser(clerkUserId);
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ?? null;
    return c.json({ userId: clerkUserId, email });
  } catch {
    return c.json({ error: 'Error al obtener datos del usuario' }, 500);
  }
});

// POST /me/avatar — guarda el avatar elegido en publicMetadata de Clerk
me.post('/avatar', requireAuth, async (c) => {
  const body = await c.req.json<{ avatarId?: string }>();
  if (!body.avatarId || !VALID_AVATARS.includes(body.avatarId as any))
    return c.json({ error: 'avatarId inválido' }, 400);
  const clerkUserId = c.get('clerkUserId')!;
  try {
    await clerk.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { avatarId: body.avatarId },
    });
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'Error al guardar el avatar' }, 500);
  }
});

// GET /me/subscription — estado de suscripción Premium del usuario autenticado
me.get('/subscription', requireAuth, async (c) => {
  const clerkUserId = c.get('clerkUserId')!;
  try {
    const sub = await Subscription.findOne({ clerkUserId });
    return c.json({
      isPremium: sub?.status === 'active',
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    });
  } catch {
    return c.json({ error: 'Error al obtener la suscripción' }, 500);
  }
});

export default me;
