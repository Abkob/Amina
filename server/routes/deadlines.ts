import { Router } from 'express';
import { query } from '../db.js';
import { requireISODate } from '../utils/localDate.js';

const router = Router();

// GET /api/goal-deadlines?goal_id=xxx
router.get('/', async (req, res) => {
  const { goal_id } = req.query;
  const { rows } = goal_id
    ? await query('SELECT * FROM goal_deadlines WHERE goal_id=$1 ORDER BY date ASC, created_at ASC', [goal_id])
    : await query('SELECT * FROM goal_deadlines ORDER BY date ASC LIMIT 500');
  res.json(rows);
});

// POST /api/goal-deadlines
router.post('/', async (req, res) => {
  const id  = crypto.randomUUID();
  const now = new Date().toISOString();
  const { goal_id, title = '', date, color = '#ef4444' } = req.body;
  try { requireISODate(date, 'date'); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
  await query(
    'INSERT INTO goal_deadlines (id,goal_id,title,date,color,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, goal_id, title, date, color, now],
  );
  res.json({ id });
});

// PUT /api/goal-deadlines/:id
router.put('/:id', async (req, res) => {
  const { title, date, color } = req.body;
  try { if (date !== undefined) requireISODate(date, 'date'); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
  const { rows: existing } = await query('SELECT id FROM goal_deadlines WHERE id=$1', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Not found' });
  await query(
    'UPDATE goal_deadlines SET title=$1, date=$2, color=$3 WHERE id=$4',
    [title, date, color, req.params.id],
  );
  res.json({ ok: true });
});

// DELETE /api/goal-deadlines/:id
router.delete('/:id', async (req, res) => {
  await query('UPDATE tasks SET deadline_id=NULL WHERE deadline_id=$1', [req.params.id]);
  await query('DELETE FROM goal_deadlines WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// PATCH /api/goal-deadlines/assign — assign or unassign a task
router.patch('/assign', async (req, res) => {
  const { task_id, deadline_id } = req.body;
  await query(
    'UPDATE tasks SET deadline_id=$1, updated_at=$2 WHERE id=$3',
    [deadline_id ?? null, new Date().toISOString(), task_id],
  );
  res.json({ ok: true });
});

export { router as deadlinesRouter };
