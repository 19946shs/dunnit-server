import { Hono } from 'hono';
import { authMiddleware } from '../auth';
import * as tags from '../tags';
import type { Env, TagRef, Variables } from '../types';

export const tagsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

tagsRoutes.use('*', authMiddleware);

tagsRoutes.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const list: TagRef[] = Array.isArray(body?.tags)
    ? body.tags.filter((t: TagRef) => t && typeof t.prefix === 'string' && typeof t.word === 'string')
    : [];
  await tags.registerTags(c.get('supabase'), list);
  return c.body(null, 204);
});

tagsRoutes.get('/frequent', async (c) => {
  return c.json(await tags.frequentTags(c.get('supabase')));
});

tagsRoutes.get('/search', async (c) => {
  const prefix = c.req.query('prefix') ?? '';
  const q = c.req.query('q') ?? '';
  if (!prefix) return c.json([]);
  return c.json(await tags.searchTags(c.get('supabase'), prefix, q));
});
