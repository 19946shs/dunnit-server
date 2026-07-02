import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import * as journal from '../journal';
import type { Env, Variables } from '../types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const journalRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Everything under /journal requires a valid token.
journalRoutes.use('*', authMiddleware);

journalRoutes.get('/', async (c) => {
  const entries = await journal.listEntries(c.get('supabase'));
  return c.json(entries);
});

journalRoutes.get('/:date', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const entry = await journal.getEntryForDate(c.get('supabase'), date);
  if (!entry) return c.json({ error: 'Not found' }, 404);
  return c.json(entry);
});

journalRoutes.put('/:date', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const patch = await c.req.json().catch(() => ({}));
  const entry = await journal.upsertEntry(c.get('supabase'), c.get('userId'), date, patch);
  return c.json(entry);
});

journalRoutes.delete('/:date', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  await journal.deleteEntry(c.get('supabase'), date);
  return c.body(null, 204);
});
