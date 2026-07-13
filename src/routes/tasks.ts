import { type Context, Hono } from 'hono';
import { authMiddleware } from '../auth';
import * as credentials from '../credentials';
import { insertTask, refreshAccessToken, RefreshTokenInvalidError, setTaskCompleted } from '../google';
import type { Env, TaskInput, Variables } from '../types';

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

export const tasksRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Everything under /tasks requires a valid token.
tasksRoutes.use('*', authMiddleware);

/** Whether the caller has a stored Google refresh token. */
tasksRoutes.get('/status', async (c) => {
  const cred = await credentials.getCredential(c.get('supabase'));
  return c.json({ connected: cred !== null });
});

/** Store the Google refresh token captured during the Connect-Tasks OAuth flow. */
tasksRoutes.post('/connect', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token.trim() : '';
  if (!refreshToken) return c.json({ error: 'refresh_token is required' }, 400);
  await credentials.upsertCredential(c.get('supabase'), c.get('userId'), refreshToken);
  return c.json({ connected: true });
});

/** Forget the stored refresh token (disconnect Tasks). */
tasksRoutes.delete('/connect', async (c) => {
  await credentials.deleteCredential(c.get('supabase'), c.get('userId'));
  return c.body(null, 204);
});

/** Refresh an access token, dropping a dead credential so the app can reconnect. */
async function accessTokenOrReauth(c: Ctx) {
  const sb = c.get('supabase');
  const cred = await credentials.getCredential(sb);
  if (!cred) return { error: c.json({ error: 'tasks_not_connected' }, 400) } as const;
  try {
    return { accessToken: await refreshAccessToken(c.env, cred.refresh_token) } as const;
  } catch (err) {
    if (err instanceof RefreshTokenInvalidError) {
      await credentials.deleteCredential(sb, c.get('userId'));
      return { error: c.json({ error: 'tasks_reauth_required' }, 401) } as const;
    }
    throw err;
  }
}

/** Create a task on the caller's default list from a parsed `!` log. */
tasksRoutes.post('/', async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
  if (!title) return c.json({ error: 'title is required' }, 400);
  const input: TaskInput = {
    title,
    notes: typeof raw?.notes === 'string' ? raw.notes : undefined,
    due: typeof raw?.due === 'string' ? raw.due : undefined,
  };

  const auth = await accessTokenOrReauth(c);
  if ('error' in auth) return auth.error;

  const task = await insertTask(auth.accessToken, input);
  return c.json(task, 201);
});

/** Check/uncheck a scheduled task — flips the Google task's native status. */
tasksRoutes.post('/:id/complete', async (c) => {
  const taskId = c.req.param('id');
  const raw = await c.req.json().catch(() => ({}));
  const completed = raw?.completed === true;

  const auth = await accessTokenOrReauth(c);
  if ('error' in auth) return auth.error;

  await setTaskCompleted(auth.accessToken, taskId, completed);
  return c.json({ ok: true });
});
