import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalEntry } from './types';

export type DayActivity = { date: string; count: number };

const SECTIONS = [
  'morning',
  'work_log',
  'ideas_log',
  'hobby_personal',
  'reflections',
  'tomorrow',
] as const;

/** Journal updates: sleep change + one per non-empty timestamped line. */
export function journalCheckInCount(
  entry: Pick<JournalEntry, 'sleep_hours' | (typeof SECTIONS)[number]>,
): number {
  let count = 0;
  if (entry.sleep_hours != null) count += 1;
  for (const key of SECTIONS) {
    count += entry[key].split('\n').filter((l) => l.trim()).length;
  }
  return count;
}

/**
 * Daily check-in counts in a date range. Each mood/energy reading, fitness log,
 * and journal update (sleep or section line) counts as one check-in.
 */
export async function listActivity(
  client: SupabaseClient,
  from: string,
  to: string,
): Promise<DayActivity[]> {
  const [readingsRes, fitnessRes, entriesRes] = await Promise.all([
    client.from('metric_readings').select('entry_date').gte('entry_date', from).lte('entry_date', to),
    client.from('fitness_entries').select('entry_date').gte('entry_date', from).lte('entry_date', to),
    client.from('journal_entries').select('*').gte('entry_date', from).lte('entry_date', to),
  ]);

  if (readingsRes.error) throw readingsRes.error;
  if (fitnessRes.error) throw fitnessRes.error;
  if (entriesRes.error) throw entriesRes.error;

  const counts = new Map<string, number>();

  for (const row of readingsRes.data ?? []) {
    const date = row.entry_date as string;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  for (const row of fitnessRes.data ?? []) {
    const date = row.entry_date as string;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  for (const row of entriesRes.data ?? []) {
    const entry = row as JournalEntry;
    const n = journalCheckInCount(entry);
    if (n > 0) {
      counts.set(entry.entry_date, (counts.get(entry.entry_date) ?? 0) + n);
    }
  }

  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
