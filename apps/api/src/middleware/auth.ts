import { verifyToken, createClerkClient } from '@clerk/backend';
import type { Context, Next } from 'hono';
import type { AppEnv } from '../types';

export const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

const TOKEN_OPTIONS = { secretKey: process.env.CLERK_SECRET_KEY! };

/**
 * Middleware opcional: si hay Bearer token válido, inyecta clerkUserId en el contexto.
 * Si no hay token o es inválido, continúa sin bloquear (modo invitado).
 */
export async function optionalAuth(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = await verifyToken(token, TOKEN_OPTIONS);
      c.set('clerkUserId', payload.sub);
    } catch {
      // token inválido — continuar como invitado
    }
  }
  await next();
}

/**
 * Middleware obligatorio: devuelve 401 si no hay token válido.
 */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer '))
    return c.json({ error: 'Unauthorized' }, 401);

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, TOKEN_OPTIONS);
    c.set('clerkUserId', payload.sub);
  } catch {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
}
