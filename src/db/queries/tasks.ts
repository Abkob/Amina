import type { DBTask, DBTaskNote, TaskKind } from '../schema';
import type { GoalTaskMetrics } from '../../utils/goalTaskMetrics';
import { apiFetch, apiPost, apiPatch, apiDelete, ApiError } from '../../utils/apiFetch';

const API = '/api';

export async function syncGoalMetricsFromTasks(goalId: string): Promise<GoalTaskMetrics> {
  return apiPost<GoalTaskMetrics>(`${API}/goals/${goalId}/sync-metrics`, {});
}

export async function getTasksByGoal(goalId: string): Promise<DBTask[]> {
  return apiFetch<DBTask[]>(`${API}/tasks?goal_id=${goalId}`);
}

export async function getTasksByGoalAndKind(goalId: string, kind: TaskKind): Promise<DBTask[]> {
  const tasks = await getTasksByGoal(goalId);
  return tasks.filter(t => t.kind === kind);
}

export async function getSubtasks(parentTaskId: string): Promise<DBTask[]> {
  return apiFetch<DBTask[]>(`${API}/tasks?parent_task_id=${parentTaskId}`);
}

export async function getTaskById(taskId: string): Promise<DBTask | undefined> {
  try {
    return await apiFetch<DBTask>(`${API}/tasks/${taskId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

export async function getTaskNotesForTask(taskId: string): Promise<DBTaskNote[]> {
  return apiFetch<DBTaskNote[]>(`${API}/tasks/${taskId}/notes`);
}

export async function createTask(
  data: Omit<DBTask, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const { id } = await apiPost<{ id: string }>(`${API}/tasks`, data);
  return id;
}

export async function createSubtask(
  parentTaskId: string,
  data: Omit<DBTask, 'id' | 'parent_task_id' | 'created_at' | 'updated_at'>
): Promise<string> {
  return createTask({ ...data, parent_task_id: parentTaskId });
}

export async function toggleTask(taskId: string): Promise<{ completed: boolean; metrics?: GoalTaskMetrics }> {
  return apiPost<{ completed: boolean; metrics?: GoalTaskMetrics }>(`${API}/tasks/${taskId}/toggle`, {});
}

export async function completeTask(taskId: string, completionNote: string): Promise<{ metrics?: GoalTaskMetrics }> {
  return apiPost<{ metrics?: GoalTaskMetrics }>(`${API}/tasks/${taskId}/complete`, { completion_note: completionNote });
}

export async function touchTask(taskId: string): Promise<void> {
  await apiPost(`${API}/tasks/${taskId}/touch`, {});
}

export async function deactivateTask(taskId: string): Promise<void> {
  await apiPost(`${API}/tasks/${taskId}/deactivate`, {});
}

export async function updateTask(
  taskId: string,
  updates: Partial<Omit<DBTask, 'id' | 'created_at'>>
): Promise<void> {
  await apiPatch(`${API}/tasks/${taskId}`, updates);
}

export async function deleteTask(taskId: string): Promise<void> {
  await apiDelete(`${API}/tasks/${taskId}`);
}

export async function addTaskNote(taskId: string, content: string): Promise<string> {
  const { id } = await apiPost<{ id: string }>(`${API}/tasks/${taskId}/notes`, { content });
  return id;
}

export async function deleteTaskNote(noteId: string): Promise<void> {
  await apiDelete(`${API}/tasks/notes/${noteId}`);
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
