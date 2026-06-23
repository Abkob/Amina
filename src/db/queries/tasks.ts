import { db } from '../db';
import type { DBTask, DBTaskNote, TaskKind } from '../schema';
import { addEdge, removeAllEdgesForNode } from './edges';

function id()  { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getTasksByGoal(goalId: string): Promise<DBTask[]> {
  return db.tasks.where('goal_id').equals(goalId).sortBy('position');
}

export async function getTasksByGoalAndKind(goalId: string, kind: TaskKind): Promise<DBTask[]> {
  return db.tasks
    .where('goal_id').equals(goalId)
    .filter(t => t.kind === kind)
    .sortBy('position');
}

export async function getSubtasks(parentTaskId: string): Promise<DBTask[]> {
  return db.tasks.where('parent_task_id').equals(parentTaskId).sortBy('position');
}

export async function getTaskById(taskId: string): Promise<DBTask | undefined> {
  return db.tasks.get(taskId);
}

export async function getTaskNotesForTask(taskId: string): Promise<DBTaskNote[]> {
  return db.task_notes.where('task_id').equals(taskId).sortBy('created_at');
}

// ── Create ───────────────────────────────────────────────────────────────────

export async function createTask(
  data: Omit<DBTask, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const task: DBTask = { ...data, id: id(), created_at: now(), updated_at: now() };
  await db.tasks.add(task);

  if (task.goal_id) {
    await addEdge({
      source_id: task.goal_id, source_type: 'goal',
      target_id: task.id,     target_type: 'task',
      relationship: 'contains',
      metadata: JSON.stringify({ kind: task.kind }),
    });
  }
  if (task.parent_task_id) {
    await addEdge({
      source_id: task.id,             source_type: 'task',
      target_id: task.parent_task_id, target_type: 'task',
      relationship: 'subtask_of',
      metadata: null,
    });
  }

  return task.id;
}

export async function createSubtask(
  parentTaskId: string,
  data: Omit<DBTask, 'id' | 'parent_task_id' | 'created_at' | 'updated_at'>
): Promise<string> {
  return createTask({ ...data, parent_task_id: parentTaskId });
}

// ── Update ───────────────────────────────────────────────────────────────────

export async function toggleTask(taskId: string): Promise<{ completed: boolean }> {
  const task = await db.tasks.get(taskId);
  if (!task) return { completed: false };
  const completed = !task.completed;
  await db.tasks.update(taskId, {
    completed,
    status: completed ? 'done' : 'todo',
    updated_at: now(),
  });
  return { completed };
}

export async function updateTask(
  taskId: string,
  updates: Partial<Omit<DBTask, 'id' | 'created_at'>>
): Promise<void> {
  await db.tasks.update(taskId, { ...updates, updated_at: now() });
}

export async function deleteTask(taskId: string): Promise<void> {
  const subtasks = await db.tasks.where('parent_task_id').equals(taskId).toArray();
  for (const sub of subtasks) await deleteTask(sub.id);
  await removeAllEdgesForNode(taskId);
  await db.task_notes.where('task_id').equals(taskId).delete();
  await db.tasks.delete(taskId);
}

// ── Task notes (inline comments on a task) ───────────────────────────────────

export async function addTaskNote(taskId: string, content: string): Promise<string> {
  const note: DBTaskNote = { id: id(), task_id: taskId, content, created_at: now() };
  await db.task_notes.add(note);
  return note.id;
}

export async function deleteTaskNote(noteId: string): Promise<void> {
  await db.task_notes.delete(noteId);
}

// ── Progress recalculation helper ─────────────────────────────────────────────

export async function recalcGoalProgress(
  goalId: string,
  baseline: number,
  kind: 'ai_generated' | 'critical_path'
): Promise<number> {
  const tasks = await getTasksByGoalAndKind(goalId, kind);
  if (tasks.length === 0) return baseline;
  const completed = tasks.filter(t => t.completed).length;
  const pctPerTask = (100 - baseline) / tasks.length;
  return Math.min(100, Math.round(baseline + completed * pctPerTask));
}
