import type { SupabaseClient } from '@supabase/supabase-js';
import type { FrequentTags, TagRef } from './types';

const TABLE = 'tags';

/**
 * Per-user tag dictionary. Plain functions over a JWT-scoped client (RLS
 * enforces ownership); reused by HTTP routes and future MCP tools.
 */

/** Create-on-mention or increment usage for each tag (via the register_tag RPC). */
export async function registerTags(client: SupabaseClient, tags: TagRef[]): Promise<void> {
  for (const t of tags) {
    const prefix = t.prefix.toLowerCase();
    const word = t.word;
    if (!prefix || !word) continue;
    const { error } = await client.rpc('register_tag', { p_prefix: prefix, p_word: word });
    if (error) throw error;
  }
}

/** Top `limit` words per prefix, ordered by usage. */
export async function frequentTags(client: SupabaseClient, limit = 3): Promise<FrequentTags> {
  const { data, error } = await client
    .from(TABLE)
    .select('prefix, word, usage_count')
    .order('usage_count', { ascending: false });
  if (error) throw error;

  const out: FrequentTags = {};
  for (const row of (data ?? []) as { prefix: string; word: string }[]) {
    const list = (out[row.prefix] ??= []);
    if (list.length < limit) list.push(row.word);
  }
  return out;
}

/** Words for `prefix` starting with `q`, ordered by usage. */
export async function searchTags(
  client: SupabaseClient,
  prefix: string,
  q: string,
  limit = 8,
): Promise<string[]> {
  const { data, error } = await client
    .from(TABLE)
    .select('word')
    .eq('prefix', prefix.toLowerCase())
    .ilike('word', `${q}%`)
    .order('usage_count', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as { word: string }[]).map((r) => r.word);
}
