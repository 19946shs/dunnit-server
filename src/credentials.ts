import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoogleCredential } from './types';

const TABLE = 'google_credentials';

/**
 * Google refresh-token storage — one row per user. Plain functions over a
 * JWT-scoped client so the HTTP routes (and later MCP tools) share the logic.
 * RLS enforces ownership, so queries don't filter by user_id.
 */

/** The caller's stored refresh token, or null if Google isn't connected. */
export async function getCredential(client: SupabaseClient): Promise<GoogleCredential | null> {
  const { data, error } = await client.from(TABLE).select('*').maybeSingle();
  if (error) throw error;
  return (data as GoogleCredential | null) ?? null;
}

/** Store (or replace) the caller's refresh token. */
export async function upsertCredential(
  client: SupabaseClient,
  userId: string,
  refreshToken: string,
): Promise<void> {
  const { error } = await client
    .from(TABLE)
    .upsert(
      { user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw error;
}

/** Forget the caller's refresh token (disconnect). */
export async function deleteCredential(client: SupabaseClient, userId: string): Promise<void> {
  // RLS already scopes to the caller; the explicit filter satisfies supabase-js's
  // requirement that a delete carry a WHERE clause.
  const { error } = await client.from(TABLE).delete().eq('user_id', userId);
  if (error) throw error;
}
