import type { DBTask, DBTaskNote, TaskKind } from '../schema';
import type { GoalTaskMetrics } from '../../utils/goalTaskMetrics';

const API = '/api';

export async function syncGoalMetricsFromTasks(goalId: string): Promise<GoalTaskMetrics> {
  const r = await fetch(`${API}/goals/${goalId}/sync-metrics`, { method: 'POST' });
  return r.json();
}

export async function getTasksByGoal(goalId: string): Promise<DBTask[]> {
  const r = await fetch(`${API}/tasks?goal_id=${goalId}`);
  return r.json();
}

export async function getTasksByGoalAndKind(goalId: string, kind: TaskKind): Promise<DBTask[]> {
  const tasks = await getTasksByGoal(goalId);
  return tasks.filter(t => t.kind === kind);
}

export async function getSubtasks(parentTaskId: string): Promise<DBTask[]> {
  const r = await fetch(`${API}/tasks?parent_task_id=${parentTaskId}`);
  return r.json();
}

export async function getTaskById(taskId: string): Promise<DBTask | undefined> {
  const r = await fetch(`${API}/tasks/${taskId}`);
  if (r.status === 404) return undefined;
  return r.json();
}

export async function getTaskNotesForTask(taskId: string): Promise<DBTaskNote[]> {
  const r = await fetch(`${API}/tasks/${taskId}/notes`);
  return r.json();
}

export async function createTask(
  data: Omit<DBTask, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const r = await fetch(`${API}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const { id } = await r.json();
  return id;
}

export async function createSubtask(
  parentTaskId: string,
  data: Omit<DBTask, 'id' | 'parent_task_id' | 'created_at' | 'updated_at'>
): Promise<string> {
  return createTask({ ...data, parent_task_id: parentTaskId });
}

export async function toggleTask(taskId: string): Promise<{ completed: boolean; metrics?: GoalTaskMetrics }> {
  const r = await fetch(`${API}/tasks/${taskId}/toggle`, { method: 'POST' });
  return r.json();
}

export async function updateTask(
  taskId: string,
  updates: Partial<Omit<DBTask, 'id' | 'created_at'>>
): Promise<void> {
  await fetch(`${API}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteTask(taskId: string): Promise<void> {
  await fetch(`${API}/tasks/${taskId}`, { method: 'DELETE' });
}

export async function addTaskNote(taskId: string, content: string): Promise<string> {
  const r = await fetch(`${API}/tasks/${taskId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  const { id } = await r.json();
  return id;
}

export async function deleteTaskNote(noteId: string): Promise<void> {
  await fetch(`${API}/tasks/notes/${noteId}`, { method: 'DELETE' });
}

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
