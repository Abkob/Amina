import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM events ORDER BY day_index ASC, start_hour ASC').all());
});

router.post('/', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const e = { id, created_at: now, updated_at: now, ...req.body };
  db.prepare(`INSERT INTO events (id,title,type,day_index,start_hour,duration_hours,time_str,description,week_start,connected_resource_json,created_at,updated_at)
    VALUES (@id,@title,@type,@day_index,@start_hour,@duration_hours,@time_str,@description,@week_start,@connected_resource_json,@created_at,@updated_at)`)
    .run(e);
  res.json({ id });
});

router.patch('/:id', (req, res) => {
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE events SET ${sets} WHERE id = @id`).run({ ...updates, id: req.params.id });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export { router as eventsRouter };
