import { createMiddleware } from 'hono/factory';
import { createClientForToken } from './supabase';
import type { Env, Variables } from './types';

/**
 * Requires a valid Supabase access token in `Authorization: Bearer <token>`.
 * Validates it via `auth.getUser()`, then stashes the user id and a
 * JWT-scoped Supabase client on the context for downstream handlers.
 *
 * Perf note: `getUser()` is a round-trip to Supabase Auth. If it becomes a
 * bottleneck, verify the JWT locally with `jose` against the project JWKS.
 */
export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const header = c.req.header('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return c.json({ error: 'Missing bearer token' }, 401);

    const supabase = createClientForToken(c.env, token);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return c.json({ error: 'Invalid or expired token' }, 401);

    c.set('userId', data.user.id);
    c.set('supabase', supabase);
    await next();
  },
);
