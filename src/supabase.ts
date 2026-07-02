import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './types';

/**
 * A Supabase client that forwards the caller's JWT on every request, so the
 * database sees the queries as that user and RLS policies apply exactly as they
 * would if the app talked to Supabase directly. The gateway never uses the
 * service_role key for user data.
 */
export function createClientForToken(env: Env, token: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
