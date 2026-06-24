import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const n = { id, created_at: now, updated_at: now, ...req.body };
  db.prepare(`INSERT INTO notes (id,title,content,type,date_str,suggested_action_text,suggested_action_applied,suggested_action_ignored,extracted_tasks_json,relevant_docs_json,created_at,updated_at)
    VALUES (@id,@title,@content,@type,@date_str,@suggested_action_text,@suggested_action_applied,@suggested_action_ignored,@extracted_tasks_json,@relevant_docs_json,@created_at,@updated_at)`)
    .run(n);
  res.json({ id });
});

router.patch('/:id', (req, res) => {
  const updates = { ...req.body, updated_at: new Date().toISOString() };
  const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE notes SET ${sets} WHERE id = @id`).run({ ...updates, id: req.params.id });
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export { router as notesRouter };
