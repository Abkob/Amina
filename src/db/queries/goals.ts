import type { DBGoal } from '../schema';

const API = '/api';

export async function getGoals(): Promise<DBGoal[]> {
  const r = await fetch(`${API}/goals`);
  return r.json();
}

export async function getGoalById(goalId: string): Promise<DBGoal | undefined> {
  const r = await fetch(`${API}/goals/${goalId}`);
  if (r.status === 404) return undefined;
  return r.json();
}

export async function createGoal(
  data: Omit<DBGoal, 'id' | 'created_at' | 'updated_at' | 'archived_at'> & { archived_at?: string | null }
): Promise<string> {
  const r = await fetch(`${API}/goals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const { id } = await r.json();
  return id;
}

export async function updateGoal(
  goalId: string,
  updates: Partial<Omit<DBGoal, 'id' | 'created_at'>>
): Promise<void> {
  await fetch(`${API}/goals/${goalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteGoal(goalId: string): Promise<void> {
  await fetch(`${API}/goals/${goalId}`, { method: 'DELETE' });
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
