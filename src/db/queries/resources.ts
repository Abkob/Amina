import { db } from '../db';
import type { DBResource, ResourceType } from '../schema';
import { addEdge, removeAllEdgesForNode } from './edges';

function id()  { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

export async function getResourcesForGoal(goalId: string): Promise<DBResource[]> {
  const edges = await db.edges
    .where('target_id').equals(goalId)
    .filter(e => e.relationship === 'attached_to' && e.source_type === 'resource')
    .toArray();
  const ids = edges.map(e => e.source_id);
  if (ids.length === 0) return [];
  return db.resources.where('id').anyOf(ids).toArray();
}

export async function getAllResources(): Promise<DBResource[]> {
  return db.resources.orderBy('created_at').reverse().toArray();
}

export async function createResource(
  data: Omit<DBResource, 'id' | 'created_at'>,
  goalId: string,
  taskId?: string,
): Promise<string> {
  const resource: DBResource = { ...data, id: id(), created_at: now() };
  await db.resources.add(resource);

  if (taskId) {
    await addEdge({
      source_id: resource.id, source_type: 'resource',
      target_id: taskId,      target_type: 'task',
      relationship: 'attached_to',
      metadata: null,
    });
    await addEdge({
      source_id: resource.id, source_type: 'resource',
      target_id: goalId,      target_type: 'goal',
      relationship: 'attached_to',
      metadata: JSON.stringify({ via_task: taskId }),
    });
  } else {
    await addEdge({
      source_id: resource.id, source_type: 'resource',
      target_id: goalId,      target_type: 'goal',
      relationship: 'attached_to',
      metadata: null,
    });
  }

  return resource.id;
}

export async function getResourcesForTask(taskId: string): Promise<DBResource[]> {
  const edges = await db.edges
    .where('target_id').equals(taskId)
    .filter(e => e.relationship === 'attached_to' && e.source_type === 'resource')
    .toArray();
  const ids = edges.map(e => e.source_id);
  if (ids.length === 0) return [];
  return db.resources.where('id').anyOf(ids).toArray();
}

export async function getAllResourcesGrouped(
  goalId: string,
  taskIds: string[],
): Promise<{ goalResources: DBResource[]; taskResources: Record<string, DBResource[]> }> {
  const allTargetIds = [goalId, ...taskIds];
  const edges = await db.edges
    .filter(e =>
      e.relationship === 'attached_to' &&
      e.source_type === 'resource' &&
      allTargetIds.includes(e.target_id)
    )
    .toArray();

  const resourceIds = [...new Set(edges.map(e => e.source_id))];
  if (resourceIds.length === 0) return { goalResources: [], taskResources: {} };

  const resources = await db.resources.where('id').anyOf(resourceIds).toArray();
  const byId = new Map(resources.map(r => [r.id, r]));

  const goalResources: DBResource[] = [];
  const taskResources: Record<string, DBResource[]> = {};

  for (const edge of edges) {
    const res = byId.get(edge.source_id);
    if (!res) continue;
    if (edge.target_type === 'goal' && !(edge.metadata ?? '').includes('via_task')) {
      goalResources.push(res);
    } else if (edge.target_type === 'task') {
      taskResources[edge.target_id] = [...(taskResources[edge.target_id] ?? []), res];
    }
  }

  return { goalResources, taskResources };
}

export async function deleteResource(resourceId: string): Promise<void> {
  await removeAllEdgesForNode(resourceId);
  await db.resources.delete(resourceId);
}

export function detectResourceType(input: string): ResourceType {
  const isLink = input.startsWith('http://') || input.startsWith('https://');
  if (isLink && input.toLowerCase().includes('figma')) return 'figma';
  if (isLink) return 'link';
  return 'document';
}
