import type { DBResource, ResourceType } from '../schema';

const API = '/api';

export async function getResourcesForGoal(goalId: string): Promise<DBResource[]> {
  return fetch(`${API}/resources?goal_id=${goalId}`).then(r => r.json());
}

export async function getAllResources(): Promise<DBResource[]> {
  return fetch(`${API}/resources`).then(r => r.json());
}

export async function getResourcesForTask(taskId: string): Promise<DBResource[]> {
  return fetch(`${API}/resources?task_id=${taskId}`).then(r => r.json());
}

export async function createResource(
  data: Omit<DBResource, 'id' | 'created_at'>,
  goalId: string,
  taskId?: string,
): Promise<string> {
  const r = await fetch(`${API}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, attach_to_id: taskId ?? goalId, attach_to_type: taskId ? 'task' : 'goal' }),
  });
  const { id } = await r.json();
  return id;
}

export async function getAllResourcesGrouped(
  goalId: string,
  taskIds: string[],
): Promise<{ goalResources: DBResource[]; taskResources: Record<string, DBResource[]> }> {
  const [goalResources, ...taskResourceArrays] = await Promise.all([
    getResourcesForGoal(goalId),
    ...taskIds.map(id => getResourcesForTask(id).then(res => [id, res] as const)),
  ]);
  const taskResources: Record<string, DBResource[]> = {};
  for (const [taskId, res] of taskResourceArrays as [string, DBResource[]][]) {
    if (res.length) taskResources[taskId] = res;
  }
  return { goalResources: goalResources as DBResource[], taskResources };
}

export async function deleteResource(resourceId: string): Promise<void> {
  await fetch(`${API}/resources/${resourceId}`, { method: 'DELETE' });
}

export function detectResourceType(input: string): ResourceType {
  const isLink = input.startsWith('http://') || input.startsWith('https://');
  if (isLink && input.toLowerCase().includes('figma')) return 'figma';
  if (isLink) return 'link';
  return 'document';
}
