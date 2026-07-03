import type { DBGoal } from '../schema';
import { apiFetch, apiPost, apiPatch, apiDelete, ApiError } from '../../utils/apiFetch';

const API = '/api';

export async function getGoals(): Promise<DBGoal[]> {
  return apiFetch<DBGoal[]>(`${API}/goals`);
}

export async function getGoalById(goalId: string): Promise<DBGoal | undefined> {
  try {
    return await apiFetch<DBGoal>(`${API}/goals/${goalId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

export async function createGoal(
  data: Omit<DBGoal, 'id' | 'created_at' | 'updated_at' | 'archived_at'> & { archived_at?: string | null }
): Promise<string> {
  const { id } = await apiPost<{ id: string }>(`${API}/goals`, data);
  return id;
}

export async function updateGoal(
  goalId: string,
  updates: Partial<Omit<DBGoal, 'id' | 'created_at'>>
): Promise<void> {
  await apiPatch(`${API}/goals/${goalId}`, updates);
}

export async function deleteGoal(goalId: string): Promise<void> {
  await apiDelete(`${API}/goals/${goalId}`);
}

export async function updateGoalProgress(goalId: string, progress: number): Promise<void> {
  await updateGoal(goalId, { progress: Math.min(100, Math.max(0, progress)) });
}

export async function archiveGoal(goalId: string): Promise<void> {
  await updateGoal(goalId, { archived_at: new Date().toISOString() });
}

export async function restoreGoal(goalId: string): Promise<void> {
  await updateGoal(goalId, { archived_at: null });
}
