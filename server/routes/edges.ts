import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { source_id, target_id } = req.query;
  if (source_id) return res.json(db.prepare('SELECT * FROM edges WHERE source_id = ?').all(source_id as string));
  if (target_id) return res.json(db.prepare('SELECT * FROM edges WHERE target_id = ?').all(target_id as string));
  res.json(db.prepare('SELECT * FROM edges').all());
});

router.post('/', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const e = { id, created_at: now, ...req.body };
  db.prepare('INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at) VALUES (@id,@source_id,@source_type,@target_id,@target_type,@relationship,@metadata,@created_at)').run(e);
  res.json({ id });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM edges WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export { router as edgesRouter };
