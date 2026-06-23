import { db } from '../db';
import type { DBTask, DBTaskNote, TaskKind } from '../schema';
import { addEdge, removeAllEdgesForNode } from './edges';
import { calculateGoalTaskMetrics, type GoalTaskMetrics } from '../../utils/goalTaskMetrics';

function id()  { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

export async function syncGoalMetricsFromTasks(goalId: string): Promise<GoalTaskMetrics> {
  const tasks = await db.tasks.where('goal_id').equals(goalId).toArray();
  const metrics = calculateGoalTaskMetrics(tasks);
  await db.goals.update(goalId, {
    progress: metrics.progress,
    activity_level: metrics.activityLevel,
    updated_at: now(),
  });
  return metrics;
}

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

  if (task.goal_id) await syncGoalMetricsFromTasks(task.goal_id);

  return task.id;
}

export async function createSubtask(
  parentTaskId: string,
  data: Omit<DBTask, 'id' | 'parent_task_id' | 'created_at' | 'updated_at'>
): Promise<string> {
  return createTask({ ...data, parent_task_id: parentTaskId });
}

// ── Update ───────────────────────────────────────────────────────────────────

export async function toggleTask(taskId: string): Promise<{ completed: boolean; metrics?: GoalTaskMetrics }> {
  const task = await db.tasks.get(taskId);
  if (!task) return { completed: false };
  const completed = !task.completed;
  await db.tasks.update(taskId, {
    completed,
    status: completed ? 'done' : 'todo',
    updated_at: now(),
  });
  const metrics = task.goal_id ? await syncGoalMetricsFromTasks(task.goal_id) : undefined;
  return { completed, metrics };
}

export async function updateTask(
  taskId: string,
  updates: Partial<Omit<DBTask, 'id' | 'created_at'>>
): Promise<void> {
  const task = await db.tasks.get(taskId);
  await db.tasks.update(taskId, { ...updates, updated_at: now() });
  const shouldSync =
    'completed' in updates ||
    'status' in updates ||
    'parent_task_id' in updates ||
    'weight_percent' in updates;
  if (shouldSync && task?.goal_id) await syncGoalMetricsFromTasks(task.goal_id);
}

export async function deleteTask(taskId: string): Promise<void> {
  const task = await db.tasks.get(taskId);
  const goalId = task?.goal_id ?? null;
  const subtasks = await db.tasks.where('parent_task_id').equals(taskId).toArray();
  for (const sub of subtasks) await deleteTask(sub.id);
  await removeAllEdgesForNode(taskId);
  const notesForTask = await db.task_notes.where('task_id').equals(taskId).toArray();
  if (notesForTask.length > 0) {
    await db.task_note_files.where('note_id').anyOf(notesForTask.map(n => n.id)).delete();
  }
  await db.task_notes.where('task_id').equals(taskId).delete();
  await db.tasks.delete(taskId);
  if (goalId) await syncGoalMetricsFromTasks(goalId);
}

// ── Task notes (inline comments on a task) ───────────────────────────────────

export async function addTaskNote(taskId: string, content: string): Promise<string> {
  const timestamp = now();
  const note: DBTaskNote = { id: id(), task_id: taskId, content, created_at: timestamp };
  await db.task_notes.add(note);
  const task = await db.tasks.get(taskId);
  await db.tasks.update(taskId, { updated_at: timestamp });
  if (task?.goal_id) await syncGoalMetricsFromTasks(task.goal_id);
  return note.id;
}

export async function deleteTaskNote(noteId: string): Promise<void> {
  const note = await db.task_notes.get(noteId);
  const task = note ? await db.tasks.get(note.task_id) : undefined;
  await db.task_note_files.where('note_id').equals(noteId).delete();
  await db.task_notes.delete(noteId);
  if (task) {
    await db.tasks.update(task.id, { updated_at: now() });
    if (task.goal_id) await syncGoalMetricsFromTasks(task.goal_id);
  }
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
