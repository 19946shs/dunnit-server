import type { CalendarEventInput, Env } from './types';

/**
 * Thin wrappers over Google's OAuth token endpoint and Calendar API. Kept free
 * of Hono/Supabase so the calendar route (and any future MCP tool) can reuse it.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
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

/** The subset of a Google Calendar event we return to the app. */
export type CalendarEvent = {
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
): Promise<CalendarEvent> {
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

  const data = (await res.json().catch(() => ({}))) as CalendarEvent & { error?: unknown };
  if (!res.ok) {
    throw new Error(`Google Calendar insert failed (${res.status})`);
  }
  return data;
}
