import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// SQLite can't bind JS booleans — coerce to 0/1 and undefined to null
function sanitize(v: unknown): string | number | bigint | Buffer | null {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v as string | number | bigint | Buffer | null;
}

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all() as Record<string, unknown>[];
  res.json(rows.map(r => ({
    ...r,
    suggested_action_applied: Boolean(r.suggested_action_applied),
    suggested_action_ignored: Boolean(r.suggested_action_ignored),
  })));
});

router.post('/', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const b = req.body;
  db.prepare(`INSERT INTO notes (id,title,content,type,date_str,suggested_action_text,suggested_action_applied,suggested_action_ignored,extracted_tasks_json,relevant_docs_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id,
      sanitize(b.title),
      sanitize(b.content),
      sanitize(b.type) ?? 'capture',
      sanitize(b.date_str),
      sanitize(b.suggested_action_text),
      sanitize(b.suggested_action_applied),
      sanitize(b.suggested_action_ignored),
      sanitize(b.extracted_tasks_json) ?? '[]',
      sanitize(b.relevant_docs_json) ?? '[]',
      now,
      now,
    );
  res.json({ id });
});

router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const updates = req.body as Record<string, unknown>;
  const sanitized: Record<string, unknown> = { id: req.params.id, updated_at: now };
  for (const [k, v] of Object.entries(updates)) {
    sanitized[k] = sanitize(v);
  }
  const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE notes SET ${sets}, updated_at = @updated_at WHERE id = @id`).run(sanitized);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...row,
    suggested_action_applied: Boolean(row.suggested_action_applied),
    suggested_action_ignored: Boolean(row.suggested_action_ignored),
  });
});

export { router as notesRouter };
