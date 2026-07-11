import type { SupabaseClient } from '@supabase/supabase-js';
import type { FitnessEntry, FitnessEntryInput } from './types';

const TABLE = 'fitness_entries';

/**
 * Time-series fitness log. Plain functions over a JWT-scoped client so the HTTP
 * routes and (later) MCP tools share the same logic. RLS enforces ownership.
 */

export async function listFitness(
  client: SupabaseClient,
  date: string,
): Promise<FitnessEntry[]> {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('entry_date', date)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FitnessEntry[];
}

export async function addFitness(
  client: SupabaseClient,
  userId: string,
  date: string,
  input: FitnessEntryInput,
  recordedAt: string,
): Promise<FitnessEntry> {
  const { data, error } = await client
    .from(TABLE)
    .insert({
      user_id: userId,
      entry_date: date,
      activity: input.activity,
      duration_min: input.duration_min ?? null,
      note: input.note ?? '',
      recorded_at: recordedAt,
    })
    .select()
    .single();
  if (error) throw error;
  return data as FitnessEntry;
}

export async function deleteFitness(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
