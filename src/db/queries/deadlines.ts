import type { DBDeadline } from '../schema';
import { apiFetch, apiPost, apiPut, apiPatch, apiDelete } from '../../utils/apiFetch';

const API = '/api/goal-deadlines';

export async function getDeadlinesByGoal(goalId: string): Promise<DBDeadline[]> {
  return apiFetch<DBDeadline[]>(`${API}?goal_id=${goalId}`);
}

export async function createDeadline(data: Omit<DBDeadline, 'id' | 'created_at'>): Promise<string> {
  const { id } = await apiPost<{ id: string }>(API, data);
  return id;
}

export async function updateDeadline(id: string, data: Partial<Pick<DBDeadline, 'title' | 'date' | 'color'>>): Promise<void> {
  await apiPut(`${API}/${id}`, data);
}

export async function deleteDeadline(id: string): Promise<void> {
  await apiDelete(`${API}/${id}`);
}

export async function assignTaskToDeadline(taskId: string, deadlineId: string | null): Promise<void> {
  await apiPatch(`${API}/assign`, { task_id: taskId, deadline_id: deadlineId });
}
