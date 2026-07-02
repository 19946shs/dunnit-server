import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalEntry, JournalEntryPatch } from './types';

const TABLE = 'journal_entries';

/**
 * Core journal operations. Plain functions over a JWT-scoped client so both the
 * HTTP routes and (later) MCP tools call the exact same logic. RLS enforces
 * ownership, so these don't filter by user_id on reads.
 */

export async function getEntryForDate(
  client: SupabaseClient,
  date: string,
): Promise<JournalEntry | null> {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('entry_date', date)
    .maybeSingle();
  if (error) throw error;
  return data as JournalEntry | null;
}

export async function listEntries(client: SupabaseClient): Promise<JournalEntry[]> {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .order('entry_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as JournalEntry[];
}

export async function upsertEntry(
  client: SupabaseClient,
  userId: string,
  date: string,
  patch: JournalEntryPatch,
): Promise<JournalEntry> {
  const { data, error } = await client
    .from(TABLE)
    .upsert(
      { user_id: userId, entry_date: date, ...patch },
      { onConflict: 'user_id,entry_date', ignoreDuplicates: false },
    )
    .select()
    .single();
  if (error) throw error;
  return data as JournalEntry;
}

export async function deleteEntry(client: SupabaseClient, date: string): Promise<void> {
  const { error } = await client.from(TABLE).delete().eq('entry_date', date);
  if (error) throw error;
}
