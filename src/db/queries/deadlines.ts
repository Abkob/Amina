import type { DBDeadline } from '../schema';

const API = '/api/goal-deadlines';

export async function getDeadlinesByGoal(goalId: string): Promise<DBDeadline[]> {
  const r = await fetch(`${API}?goal_id=${goalId}`);
  return r.json();
}

export async function createDeadline(data: Omit<DBDeadline, 'id' | 'created_at'>): Promise<string> {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const { id } = await r.json();
  return id;
}

export async function updateDeadline(id: string, data: Partial<Pick<DBDeadline, 'title' | 'date' | 'color'>>): Promise<void> {
  await fetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteDeadline(id: string): Promise<void> {
  await fetch(`${API}/${id}`, { method: 'DELETE' });
}

export async function assignTaskToDeadline(taskId: string, deadlineId: string | null): Promise<void> {
  await fetch(`${API}/assign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId, deadline_id: deadlineId }),
  });
}
