import { Router } from 'express';
import { db, rowToTask, sanitizeForSQLite } from '../db.js';
import { syncGoalMetrics } from './goals.js';

const router = Router();

function deleteTaskCascade(taskId: string) {
  const children = db.prepare('SELECT id FROM tasks WHERE parent_task_id = ?').all(taskId) as { id: string }[];
  for (const c of children) deleteTaskCascade(c.id);
  const notes = db.prepare('SELECT id FROM task_notes WHERE task_id = ?').all(taskId) as { id: string }[];
  for (const n of notes) {
    const files = db.prepare('SELECT file_path FROM task_note_files WHERE note_id = ?').all(n.id) as { file_path: string }[];
    for (const f of files) { try { require('fs').unlinkSync(f.file_path); } catch {} }
    db.prepare('DELETE FROM task_note_files WHERE note_id = ?').run(n.id);
  }
  db.prepare('DELETE FROM task_notes WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(taskId, taskId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}

// GET /api/tasks?goal_id=...
router.get('/', (req, res) => {
  const { goal_id } = req.query;
  const rows = goal_id
    ? db.prepare('SELECT * FROM tasks WHERE goal_id = ? ORDER BY position ASC, created_at ASC').all(goal_id as string) as Record<string, unknown>[]
    : db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Record<string, unknown>[];
  res.json(rows.map(rowToTask));
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(rowToTask(row));
});

// POST /api/tasks
router.post('/', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const t = sanitizeForSQLite({ goal_id: null, parent_task_id: null, estimated_minutes: null, weight_percent: null, due_date: null, critical_path_status: null, completed: 0, ...req.body, id, created_at: now, updated_at: now });
  db.prepare(`INSERT INTO tasks (id,goal_id,parent_task_id,title,description,status,priority,kind,critical_path_status,tags_json,due_date,estimated_duration,estimated_minutes,weight_percent,completed,position,created_at,updated_at)
    VALUES (@id,@goal_id,@parent_task_id,@title,@description,@status,@priority,@kind,@critical_path_status,@tags_json,@due_date,@estimated_duration,@estimated_minutes,@weight_percent,@completed,@position,@created_at,@updated_at)`)
    .run(t);

  if (t.goal_id) {
    db.prepare(`INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(crypto.randomUUID(), t.goal_id, 'goal', id, 'task', 'contains', JSON.stringify({ kind: t.kind }), now);
    syncGoalMetrics(t.goal_id as string);
  }
  if (t.parent_task_id) {
    db.prepare(`INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(crypto.randomUUID(), id, 'task', t.parent_task_id, 'task', 'subtask_of', null, now);
  }

  res.json({ id });
});

// PATCH /api/tasks/:id
router.patch('/:id', (req, res) => {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const updates = sanitizeForSQLite({ ...req.body, updated_at: now });
  const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE tasks SET ${sets} WHERE id = @id`).run({ ...updates, id: req.params.id });

  const shouldSync = ['completed', 'status', 'parent_task_id', 'weight_percent'].some(k => k in req.body);
  const goalId = (updates.goal_id ?? existing.goal_id) as string | null;
  if (shouldSync && goalId) syncGoalMetrics(goalId);

  res.json({ ok: true });
});

// POST /api/tasks/:id/toggle
router.post('/:id/toggle', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Not found' });
  const completed = !row.completed;
  const now = new Date().toISOString();
  db.prepare('UPDATE tasks SET completed = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(completed ? 1 : 0, completed ? 'done' : 'todo', now, req.params.id);
  const goalId = row.goal_id as string | null;
  const metrics = goalId ? syncGoalMetrics(goalId) : undefined;
  res.json({ completed, metrics });
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT goal_id FROM tasks WHERE id = ?').get(req.params.id) as { goal_id: string | null } | undefined;
  deleteTaskCascade(req.params.id);
  if (row?.goal_id) syncGoalMetrics(row.goal_id);
  res.json({ ok: true });
});

// ── Task notes ────────────────────────────────────────────────────────────────

// GET /api/tasks/:id/notes
router.get('/:id/notes', (req, res) => {
  const rows = db.prepare('SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC').all(req.params.id);
  res.json(rows);
});

// POST /api/tasks/:id/notes
router.post('/:id/notes', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO task_notes (id, task_id, content, created_at) VALUES (?, ?, ?, ?)')
    .run(id, req.params.id, req.body.content ?? '', now);
  db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  const task = db.prepare('SELECT goal_id FROM tasks WHERE id = ?').get(req.params.id) as { goal_id: string | null } | undefined;
  if (task?.goal_id) syncGoalMetrics(task.goal_id);
  res.json({ id });
});

// PATCH /api/task-notes/:noteId
router.patch('/notes/:noteId', (req, res) => {
  db.prepare('UPDATE task_notes SET content = ? WHERE id = ?').run(req.body.content, req.params.noteId);
  res.json({ ok: true });
});

// DELETE /api/task-notes/:noteId
router.delete('/notes/:noteId', (req, res) => {
  const files = db.prepare('SELECT file_path FROM task_note_files WHERE note_id = ?').all(req.params.noteId) as { file_path: string }[];
  for (const f of files) { try { require('fs').unlinkSync(f.file_path); } catch {} }
  db.prepare('DELETE FROM task_note_files WHERE note_id = ?').run(req.params.noteId);
  db.prepare('DELETE FROM task_notes WHERE id = ?').run(req.params.noteId);
  res.json({ ok: true });
});

export { router as tasksRouter };
