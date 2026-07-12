import type { SupabaseClient } from '@supabase/supabase-js';

/** Worker environment bindings (see wrangler.jsonc `vars`). */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  ALLOWED_ORIGINS?: string;
  /** Admin/service key — only present if set as a secret; unused by journal routes. */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /**
   * Google OAuth client credentials — the SAME client configured in Supabase's
   * Google provider. Set as secrets (`wrangler secret put …`), not committed vars.
   * Used by the /calendar routes to refresh access tokens from a stored refresh
   * token. Only present when the calendar feature is provisioned.
   */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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

/** A single timestamped mood/energy check-in (time series). */
export type MetricReading = {
  id: string;
  user_id: string;
  entry_date: string;
  recorded_at: string;
  mood: number | null;
  energy: number | null;
};

/** New-reading payload; at least one metric must be present. */
export type MetricReadingInput = { mood?: number | null; energy?: number | null };

/** A single timestamped fitness activity (time series). */
export type FitnessEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  recorded_at: string;
  activity: string;
  duration_min: number | null;
  note: string;
};

/** New-fitness payload; `activity` is required. */
export type FitnessEntryInput = {
  activity: string;
  duration_min?: number | null;
  note?: string;
};

/** Sections that hold timestamped log entries. */
export const LOG_SECTIONS = ['morning', 'reflections', 'tomorrow'] as const;
export type LogSection = (typeof LOG_SECTIONS)[number];

/** One timestamped log entry. Body may contain newlines. */
export type JournalLog = {
  id: string;
  user_id: string;
  entry_date: string;
  section: LogSection;
  recorded_at: string;
  body: string;
  created_at: string;
  updated_at: string;
};

/** New-log payload. */
export type JournalLogInput = { section: LogSection; body: string };

/** A `prefix/word` tag reference. */
export type TagRef = { prefix: string; word: string };

/** Top words per prefix, e.g. { p: ['website', ...], w: [...] }. */
export type FrequentTags = Record<string, string[]>;

/** A stored Google OAuth refresh token (one row per user). */
export type GoogleCredential = {
  user_id: string;
  refresh_token: string;
  created_at: string;
  updated_at: string;
};

/** Payload the app sends to create a calendar event. `start`/`end` are RFC3339 instants. */
export type CalendarEventInput = {
  summary: string;
  start: string;
  end: string;
  /** IANA timezone (e.g. "Asia/Kolkata"); optional, Google infers from the offset otherwise. */
  timeZone?: string;
};

/** Everything a day view needs, in one response (see the /bootstrap route). */
export type Bootstrap = {
  entry: JournalEntry | null;
  logs: JournalLog[];
  readings: MetricReading[];
  fitness: FitnessEntry[];
  /** Previous day's `tomorrow` logs (the "yesterday" carryover). */
  carryover: JournalLog[];
  frequent: FrequentTags;
};
