import { Router } from 'express';
import { db, rowToGoal, rowToTask } from '../db.js';
import { calculateGoalTaskMetrics } from '../../src/utils/goalTaskMetrics.js';

const router = Router();

function syncGoalMetrics(goalId: string) {
  const tasks = db.prepare('SELECT * FROM tasks WHERE goal_id = ?').all(goalId) as Record<string, unknown>[];
  const mapped = tasks.map(rowToTask) as Parameters<typeof calculateGoalTaskMetrics>[0];
  const metrics = calculateGoalTaskMetrics(mapped);
  db.prepare('UPDATE goals SET progress = ?, activity_level = ?, updated_at = ? WHERE id = ?')
    .run(metrics.progress, metrics.activityLevel, new Date().toISOString(), goalId);
  return metrics;
}

// GET /api/goals
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM goals ORDER BY created_at DESC').all() as Record<string, unknown>[];
  res.json(rows.map(rowToGoal));
});

// GET /api/goals/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToGoal(row));
});

// POST /api/goals
router.post('/', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const g = { id, created_at: now, updated_at: now, archived_at: null, overdue: 0, ...req.body };
  db.prepare(`INSERT INTO goals (id,title,description,category,status,progress,deadline,overdue,activity_level,archived_at,created_at,updated_at)
    VALUES (@id,@title,@description,@category,@status,@progress,@deadline,@overdue,@activity_level,@archived_at,@created_at,@updated_at)`)
    .run(g);
  res.json({ id });
});

// PATCH /api/goals/:id
router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const updates = { ...req.body, updated_at: now };
  const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE goals SET ${sets} WHERE id = @id`).run({ ...updates, id: req.params.id });
  res.json({ ok: true });
});

// DELETE /api/goals/:id  (cascades tasks → notes → note_files → resources → edges)
router.delete('/:id', (req, res) => {
  const goalId = req.params.id;
  const tasks = db.prepare('SELECT id FROM tasks WHERE goal_id = ?').all(goalId) as { id: string }[];
  for (const t of tasks) {
    const notes = db.prepare('SELECT id FROM task_notes WHERE task_id = ?').all(t.id) as { id: string }[];
    for (const n of notes) {
      const files = db.prepare('SELECT file_path FROM task_note_files WHERE note_id = ?').all(n.id) as { file_path: string }[];
      for (const f of files) { try { require('fs').unlinkSync(f.file_path); } catch {} }
      db.prepare('DELETE FROM task_note_files WHERE note_id = ?').run(n.id);
    }
    db.prepare('DELETE FROM task_notes WHERE task_id = ?').run(t.id);
    db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(t.id, t.id);
  }
  const resEdges = db.prepare("SELECT source_id FROM edges WHERE target_id = ? AND relationship = 'attached_to'").all(goalId) as { source_id: string }[];
  for (const e of resEdges) {
    db.prepare('DELETE FROM resources WHERE id = ?').run(e.source_id);
    db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(e.source_id, e.source_id);
  }
  db.prepare('DELETE FROM tasks WHERE goal_id = ?').run(goalId);
  db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(goalId, goalId);
  db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);
  res.json({ ok: true });
});

// POST /api/goals/:id/sync-metrics
router.post('/:id/sync-metrics', (req, res) => {
  const metrics = syncGoalMetrics(req.params.id);
  res.json(metrics);
});

export { router as goalsRouter, syncGoalMetrics };
