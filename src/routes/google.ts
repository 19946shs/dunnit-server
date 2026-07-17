import { type Context, Hono } from 'hono';
import { authMiddleware } from '../auth';
import * as credentials from '../credentials';
import {
  insertEvent,
  insertTask,
  listTasks,
  pendingFrom,
  refreshAccessToken,
  RefreshTokenInvalidError,
  setTaskCompleted,
} from '../google';
import type { CalendarEventInput, Env, TaskInput, Variables } from '../types';

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

export const googleRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Everything under /google requires a valid token.
googleRoutes.use('*', authMiddleware);

/** Whether the caller has a stored Google refresh token. */
googleRoutes.get('/status', async (c) => {
  const cred = await credentials.getCredential(c.get('supabase'));
  return c.json({ connected: cred !== null });
});

/** Store the Google refresh token captured during the Connect-Google OAuth flow. */
googleRoutes.post('/connect', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token.trim() : '';
  if (!refreshToken) return c.json({ error: 'refresh_token is required' }, 400);
  await credentials.upsertCredential(c.get('supabase'), c.get('userId'), refreshToken);
  return c.json({ connected: true });
});

/** Forget the stored refresh token (disconnect Google). */
googleRoutes.delete('/connect', async (c) => {
  await credentials.deleteCredential(c.get('supabase'), c.get('userId'));
  return c.body(null, 204);
});

/** Refresh an access token, dropping a dead credential so the app can reconnect. */
async function accessTokenOrReauth(c: Ctx) {
  const sb = c.get('supabase');
  const cred = await credentials.getCredential(sb);
  if (!cred) return { error: c.json({ error: 'google_not_connected' }, 400) } as const;
  try {
    return { accessToken: await refreshAccessToken(c.env, cred.refresh_token) } as const;
  } catch (err) {
    if (err instanceof RefreshTokenInvalidError) {
      await credentials.deleteCredential(sb, c.get('userId'));
      return { error: c.json({ error: 'google_reauth_required' }, 401) } as const;
    }
    throw err;
  }
}

// --- Google Tasks (the `!` sigil) ---

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The caller's pending tasks: incomplete, and either overdue or undated. `today`
 * is the caller's LOCAL date — see `pendingFrom` for the filtering rule.
 */
googleRoutes.get('/tasks', async (c) => {
  const today = c.req.query('today');
  if (!today || !DATE_RE.test(today)) {
    return c.json({ error: 'today must be YYYY-MM-DD' }, 400);
  }

  const auth = await accessTokenOrReauth(c);
  if ('error' in auth) return auth.error;

  return c.json(pendingFrom(await listTasks(auth.accessToken), today));
});

/** Create a task on the caller's default list from a parsed `!` log. */
googleRoutes.post('/tasks', async (c) => {
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
googleRoutes.post('/tasks/:id/complete', async (c) => {
  const taskId = c.req.param('id');
  const raw = await c.req.json().catch(() => ({}));
  const completed = raw?.completed === true;

  const auth = await accessTokenOrReauth(c);
  if ('error' in auth) return auth.error;

  await setTaskCompleted(auth.accessToken, taskId, completed);
  return c.json({ ok: true });
});

// --- Google Calendar (the `!!` sigil) ---

/** Create a calendar event from a parsed `!!` log. */
googleRoutes.post('/events', async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const summary = typeof raw?.summary === 'string' ? raw.summary.trim() : '';
  const start = typeof raw?.start === 'string' ? raw.start : '';
  const end = typeof raw?.end === 'string' ? raw.end : '';
  if (!summary || !start || !end) {
    return c.json({ error: 'summary, start and end are required' }, 400);
  }
  const input: CalendarEventInput = {
    summary,
    start,
    end,
    timeZone: typeof raw?.timeZone === 'string' ? raw.timeZone : undefined,
  };

  const auth = await accessTokenOrReauth(c);
  if ('error' in auth) return auth.error;

  const event = await insertEvent(auth.accessToken, input);
  return c.json(event, 201);
});
