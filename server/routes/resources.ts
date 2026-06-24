import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// GET /api/resources?goal_id=...  or  ?task_id=...
router.get('/', (req, res) => {
  const { goal_id, task_id } = req.query;
  if (goal_id) {
    const rows = db.prepare(`
      SELECT r.* FROM resources r
      JOIN edges e ON e.source_id = r.id AND e.relationship = 'attached_to' AND e.target_id = ?
    `).all(goal_id as string);
    return res.json(rows);
  }
  if (task_id) {
    const rows = db.prepare(`
      SELECT r.* FROM resources r
      JOIN edges e ON e.source_id = r.id AND e.relationship = 'attached_to' AND e.target_id = ?
    `).all(task_id as string);
    return res.json(rows);
  }
  res.json(db.prepare('SELECT * FROM resources ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const r = { id, created_at: now, ...req.body };
  db.prepare('INSERT INTO resources (id,title,url,type,info,created_at) VALUES (@id,@title,@url,@type,@info,@created_at)').run(r);

  if (req.body.attach_to_id) {
    db.prepare('INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), id, 'resource', req.body.attach_to_id, req.body.attach_to_type ?? 'goal', 'attached_to', null, now);
  }
  res.json({ id });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM resources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export { router as resourcesRouter };
