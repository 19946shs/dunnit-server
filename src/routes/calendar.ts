import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import * as calendar from '../calendar';
import { insertEvent, refreshAccessToken, RefreshTokenInvalidError } from '../google';
import type { CalendarEventInput, Env, Variables } from '../types';

export const calendarRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Everything under /calendar requires a valid token.
calendarRoutes.use('*', authMiddleware);

/** Whether the caller has a stored Google refresh token. */
calendarRoutes.get('/status', async (c) => {
  const cred = await calendar.getCredential(c.get('supabase'));
  return c.json({ connected: cred !== null });
});

/** Store the Google refresh token captured during the Connect-Calendar OAuth flow. */
calendarRoutes.post('/connect', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token.trim() : '';
  if (!refreshToken) return c.json({ error: 'refresh_token is required' }, 400);
  await calendar.upsertCredential(c.get('supabase'), c.get('userId'), refreshToken);
  return c.json({ connected: true });
});

/** Forget the stored refresh token (disconnect Calendar). */
calendarRoutes.delete('/connect', async (c) => {
  await calendar.deleteCredential(c.get('supabase'), c.get('userId'));
  return c.body(null, 204);
});

/** Create an event on the caller's primary calendar from a parsed `!` log. */
calendarRoutes.post('/events', async (c) => {
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

  const sb = c.get('supabase');
  const cred = await calendar.getCredential(sb);
  if (!cred) return c.json({ error: 'calendar_not_connected' }, 400);

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(c.env, cred.refresh_token);
  } catch (err) {
    if (err instanceof RefreshTokenInvalidError) {
      // The refresh token is dead — drop it so the app prompts a reconnect.
      await calendar.deleteCredential(sb, c.get('userId'));
      return c.json({ error: 'calendar_reauth_required' }, 401);
    }
    throw err;
  }

  const event = await insertEvent(accessToken, input);
  return c.json(event, 201);
});
