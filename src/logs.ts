import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalLog, JournalLogInput, LogSection } from './types';

const TABLE = 'journal_logs';

/**
 * Timestamped journal log entries — one row per log. Plain functions over a
 * JWT-scoped client so the HTTP routes and (later) MCP tools share the logic.
 * RLS enforces ownership, so reads don't filter by user_id.
 */

export async function listLogs(
  client: SupabaseClient,
  date: string,
  section?: LogSection,
): Promise<JournalLog[]> {
  let query = client.from(TABLE).select('*').eq('entry_date', date);
  if (section) query = query.eq('section', section);
  const { data, error } = await query.order('recorded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as JournalLog[];
}

export async function addLog(
  client: SupabaseClient,
  userId: string,
  date: string,
  input: JournalLogInput,
  recordedAt: string,
): Promise<JournalLog> {
  const { data, error } = await client
    .from(TABLE)
    .insert({
      user_id: userId,
      entry_date: date,
      section: input.section,
      body: input.body,
      recorded_at: recordedAt,
    })
    .select()
    .single();
  if (error) throw error;
  return data as JournalLog;
}

export async function updateLog(
  client: SupabaseClient,
  id: string,
  body: string,
): Promise<JournalLog> {
  const { data, error } = await client
    .from(TABLE)
    .update({ body })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as JournalLog;
}

export async function deleteLog(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
