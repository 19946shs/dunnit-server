import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { calendarRoutes } from './routes/calendar';
import { journalRoutes } from './routes/journal';
import { tagsRoutes } from './routes/tags';
import type { Env, Variables } from './types';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// CORS — origins come from env so we don't hardcode. "*" is fine for dev.
app.use('*', (c, next) => {
  const raw = c.env.ALLOWED_ORIGINS ?? '*';
  const origins = raw.split(',').map((s) => s.trim());
  return cors({
    origin: origins.includes('*') ? '*' : origins,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })(c, next);
});

app.get('/health', (c) => c.json({ ok: true }));

app.route('/journal', journalRoutes);
app.route('/tags', tagsRoutes);
app.route('/calendar', calendarRoutes);

app.onError((err, c) => {
  // Surface Postgres constraint violations (CHECK, unique, etc.) as 400s.
  const code = (err as { code?: string }).code;
  if (code && /^23/.test(code)) {
    return c.json({ error: (err as Error).message, code }, 400);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal error' }, 500);
});

export default app;
