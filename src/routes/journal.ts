import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import * as fitness from '../fitness';
import * as journal from '../journal';
import * as readings from '../readings';
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

// --- Mood/energy time-series readings ---

journalRoutes.get('/:date/readings', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const rows = await readings.listReadings(c.get('supabase'), date);
  return c.json(rows);
});

journalRoutes.post('/:date/readings', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const mood = body?.mood ?? null;
  const energy = body?.energy ?? null;
  if (mood == null && energy == null) {
    return c.json({ error: 'a reading must include mood and/or energy' }, 400);
  }
  const row = await readings.addReading(c.get('supabase'), c.get('userId'), date, { mood, energy });
  return c.json(row, 201);
});

journalRoutes.delete('/:date/readings/:id', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  await readings.deleteReading(c.get('supabase'), c.req.param('id'));
  return c.body(null, 204);
});

// --- Fitness time-series log ---

journalRoutes.get('/:date/fitness', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const rows = await fitness.listFitness(c.get('supabase'), date);
  return c.json(rows);
});

journalRoutes.post('/:date/fitness', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const activity = typeof body?.activity === 'string' ? body.activity.trim() : '';
  if (!activity) return c.json({ error: 'activity is required' }, 400);
  const row = await fitness.addFitness(c.get('supabase'), c.get('userId'), date, {
    activity,
    duration_min: body?.duration_min ?? null,
    note: typeof body?.note === 'string' ? body.note : '',
  });
  return c.json(row, 201);
});

journalRoutes.delete('/:date/fitness/:id', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  await fitness.deleteFitness(c.get('supabase'), c.req.param('id'));
  return c.body(null, 204);
});
