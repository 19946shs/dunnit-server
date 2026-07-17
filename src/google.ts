import type { CalendarEventInput, Env, TaskInput } from './types';

/**
 * Thin wrappers over Google's OAuth token endpoint, Tasks API, and Calendar API.
 * Kept free of Hono/Supabase so the /google route (and any future MCP tool) can
 * reuse it.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TASKS_URL = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** A refresh token that Google has rejected (revoked / consent removed). */
export class RefreshTokenInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefreshTokenInvalidError';
  }
}

/**
 * Exchange a stored refresh token for a short-lived access token, using the same
 * Google OAuth client (id + secret) that Supabase's Google provider is configured
 * with. Throws RefreshTokenInvalidError on `invalid_grant` so the caller can drop
 * the dead credential and ask the user to reconnect.
 */
export async function refreshAccessToken(env: Env, refreshToken: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    // A revoked or expired refresh token comes back as invalid_grant.
    if (data.error === 'invalid_grant') {
      throw new RefreshTokenInvalidError(data.error_description ?? 'refresh token was rejected');
    }
    throw new Error(`Google token refresh failed (${res.status}): ${data.error ?? 'unknown error'}`);
  }

  return data.access_token;
}

/** The subset of a Google Task we return to the app. */
export type GoogleTask = {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string;
  notes?: string;
};

/** Insert a task on the user's default task list with a fresh access token. */
export async function insertTask(accessToken: string, input: TaskInput): Promise<GoogleTask> {
  const res = await fetch(TASKS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: input.title,
      notes: input.notes,
      due: input.due,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as GoogleTask & { error?: unknown };
  if (!res.ok) {
    throw new Error(`Google Tasks insert failed (${res.status})`);
  }
  return data;
}

/**
 * List the caller's incomplete tasks from the default list. Google caps
 * `maxResults` at 100; we pull a page and let the caller filter/slice, since the
 * "overdue + undated" rule can't be expressed as a Tasks API query (`dueMax`
 * would drop undated tasks).
 */
export async function listTasks(accessToken: string): Promise<GoogleTask[]> {
  const url = `${TASKS_URL}?${new URLSearchParams({
    showCompleted: 'false',
    maxResults: '100',
  })}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await res.json().catch(() => ({}))) as { items?: GoogleTask[] };
  if (!res.ok) throw new Error(`Google Tasks list failed (${res.status})`);
  return data.items ?? [];
}

/** How many pending tasks we hand back. Pagination comes later. */
export const PENDING_LIMIT = 15;

/**
 * The pending slice of a task list: **overdue** (due before `today`) or
 * **undated**. Today's and future-dated tasks are dropped — today's already show
 * inline on the Day screen. Oldest due first, undated last, capped at
 * PENDING_LIMIT.
 *
 * `today` is the caller's LOCAL date (`YYYY-MM-DD`); the server has no timezone
 * context. Google stores `due` as a date-only instant at UTC midnight, so
 * comparing the leading `YYYY-MM-DD` lexically is exact.
 */
export function pendingFrom(tasks: GoogleTask[], today: string): GoogleTask[] {
  return tasks
    .filter((t) => !t.due || t.due.slice(0, 10) < today)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    .slice(0, PENDING_LIMIT);
}

/**
 * Mark a task complete (or reopen it) via the Tasks API's native `status`.
 * Idempotent. If the task was deleted on Google (404/410) we treat it as a
 * no-op success so the log's checkbox still works.
 */
export async function setTaskCompleted(
  accessToken: string,
  taskId: string,
  completed: boolean,
): Promise<void> {
  const res = await fetch(`${TASKS_URL}/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: completed ? 'completed' : 'needsAction' }),
  });
  if (res.status === 404 || res.status === 410) return; // task gone — nothing to do
  if (!res.ok) throw new Error(`Google Tasks update failed (${res.status})`);
}

/** The subset of a Google Calendar event we return to the app. */
export type GoogleEvent = {
  id: string;
  htmlLink: string;
  summary: string;
  start: { dateTime?: string; timeZone?: string };
  end: { dateTime?: string; timeZone?: string };
};

/** Insert an event on the user's primary calendar with a fresh access token. */
export async function insertEvent(
  accessToken: string,
  input: CalendarEventInput,
): Promise<GoogleEvent> {
  const res = await fetch(EVENTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: input.summary,
      start: { dateTime: input.start, timeZone: input.timeZone },
      end: { dateTime: input.end, timeZone: input.timeZone },
    }),
  });

  const data = (await res.json().catch(() => ({}))) as GoogleEvent & { error?: unknown };
  if (!res.ok) {
    throw new Error(`Google Calendar insert failed (${res.status})`);
  }
  return data;
}
