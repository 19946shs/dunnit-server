import type { SupabaseClient } from '@supabase/supabase-js';
import type { MetricReading, MetricReadingInput } from './types';

const TABLE = 'metric_readings';

/**
 * Time-series mood/energy readings. Plain functions over a JWT-scoped client so
 * the HTTP routes and (later) MCP tools share the same logic. RLS enforces
 * ownership, so reads don't filter by user_id.
 */

export async function listReadings(
  client: SupabaseClient,
  date: string,
): Promise<MetricReading[]> {
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .eq('entry_date', date)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MetricReading[];
}

export async function addReading(
  client: SupabaseClient,
  userId: string,
  date: string,
  input: MetricReadingInput,
): Promise<MetricReading> {
  const { data, error } = await client
    .from(TABLE)
    .insert({
      user_id: userId,
      entry_date: date,
      mood: input.mood ?? null,
      energy: input.energy ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MetricReading;
}

export async function deleteReading(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}
