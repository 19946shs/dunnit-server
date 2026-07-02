import type { SupabaseClient } from '@supabase/supabase-js';

/** Worker environment bindings (see wrangler.jsonc `vars`). */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  ALLOWED_ORIGINS?: string;
  /** Admin/service key — only present if set as a secret; unused by journal routes. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

/** Per-request values attached by the auth middleware. */
export type Variables = {
  userId: string;
  /** Supabase client scoped to the caller's JWT — RLS applies. */
  supabase: SupabaseClient;
};

/**
 * A single day's journal entry. Mirrors `public.journal_entries` and the
 * `JournalEntry` type in the Dunnit app repo (src/lib/journal.ts) — keep in sync.
 */
export type JournalEntry = {
  id: string;
  user_id: string;
  /** YYYY-MM-DD */
  entry_date: string;

  mood: number | null;
  energy: number | null;
  sleep_hours: number | null;
  tags: string[];
  projects: string[];
  wins: string[];
  blockers: string[];
  ideas: string[];
  hobby: string[];

  morning: string;
  work_log: string;
  ideas_log: string;
  hobby_personal: string;
  reflections: string;
  tomorrow: string;

  created_at: string;
  updated_at: string;
};

/** Writable fields. `id`/`user_id`/`entry_date`/timestamps are server-managed. */
export type JournalEntryPatch = Partial<
  Omit<JournalEntry, 'id' | 'user_id' | 'entry_date' | 'created_at' | 'updated_at'>
>;
