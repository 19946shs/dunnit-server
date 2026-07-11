import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import * as activity from '../activity';
import * as fitness from '../fitness';
import * as journal from '../journal';
import * as logs from '../logs';
import * as readings from '../readings';
import * as tags from '../tags';
import { previousDate, readStamp } from '../time';
import { LOG_SECTIONS, type Bootstrap, type Env, type LogSection, type Variables } from '../types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const journalRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Everything under /journal requires a valid token.
journalRoutes.use('*', authMiddleware);

journalRoutes.get('/', async (c) => {
  const entries = await journal.listEntries(c.get('supabase'));
  return c.json(entries);
});

journalRoutes.get('/activity', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return c.json({ error: 'from and to must be YYYY-MM-DD' }, 400);
  }
  if (from > to) return c.json({ error: 'from must be on or before to' }, 400);
  const rows = await activity.listActivity(c.get('supabase'), from, to);
  return c.json(rows);
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

// Everything a day view needs, in one round-trip (replaces 6 client calls).
journalRoutes.get('/:date/bootstrap', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const sb = c.get('supabase');
  const [entry, logRows, readingRows, fitnessRows, carryover, frequent] = await Promise.all([
    journal.getEntryForDate(sb, date),
    logs.listLogs(sb, date),
    readings.listReadings(sb, date),
    fitness.listFitness(sb, date),
    logs.listLogs(sb, previousDate(date), 'tomorrow'),
    tags.frequentTags(sb),
  ]);
  const payload: Bootstrap = {
    entry,
    logs: logRows,
    readings: readingRows,
    fitness: fitnessRows,
    carryover,
    frequent,
  };
  return c.json(payload);
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
  const stamped = readStamp(body, date);
  if (!stamped.ok) return c.json({ error: stamped.error }, 400);
  const row = await readings.addReading(
    c.get('supabase'),
    c.get('userId'),
    stamped.entryDate,
    { mood, energy },
    stamped.stamp.recorded_at,
  );
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
  const stamped = readStamp(body, date);
  if (!stamped.ok) return c.json({ error: stamped.error }, 400);
  const row = await fitness.addFitness(
    c.get('supabase'),
    c.get('userId'),
    stamped.entryDate,
    {
      activity,
      duration_min: body?.duration_min ?? null,
      note: typeof body?.note === 'string' ? body.note : '',
    },
    stamped.stamp.recorded_at,
  );
  return c.json(row, 201);
});

journalRoutes.delete('/:date/fitness/:id', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  await fitness.deleteFitness(c.get('supabase'), c.req.param('id'));
  return c.body(null, 204);
});

// --- Journal logs (one row per timestamped entry) ---

function isSection(v: unknown): v is LogSection {
  return typeof v === 'string' && (LOG_SECTIONS as readonly string[]).includes(v);
}

journalRoutes.get('/:date/logs', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const section = c.req.query('section');
  if (section !== undefined && !isSection(section)) {
    return c.json({ error: `section must be one of ${LOG_SECTIONS.join(', ')}` }, 400);
  }
  const rows = await logs.listLogs(c.get('supabase'), date, section);
  return c.json(rows);
});

journalRoutes.post('/:date/logs', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const raw = await c.req.json().catch(() => ({}));
  if (!isSection(raw?.section)) {
    return c.json({ error: `section must be one of ${LOG_SECTIONS.join(', ')}` }, 400);
  }
  const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
  if (!body) return c.json({ error: 'body is required' }, 400);
  const stamped = readStamp(raw, date);
  if (!stamped.ok) return c.json({ error: stamped.error }, 400);
  const row = await logs.addLog(
    c.get('supabase'),
    c.get('userId'),
    stamped.entryDate,
    { section: raw.section, body },
    stamped.stamp.recorded_at,
  );
  return c.json(row, 201);
});

journalRoutes.patch('/:date/logs/:id', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  const raw = await c.req.json().catch(() => ({}));
  const body = typeof raw?.body === 'string' ? raw.body.trim() : '';
  if (!body) return c.json({ error: 'body is required' }, 400);
  const row = await logs.updateLog(c.get('supabase'), c.req.param('id'), body);
  return c.json(row);
});

journalRoutes.delete('/:date/logs/:id', async (c) => {
  const date = c.req.param('date');
  if (!DATE_RE.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  await logs.deleteLog(c.get('supabase'), c.req.param('id'));
  return c.body(null, 204);
});
