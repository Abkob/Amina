import { db } from '../db';
import type { DBGoal } from '../schema';
import { removeAllEdgesForNode } from './edges';

function id()  { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

export async function getGoals(): Promise<DBGoal[]> {
  return db.goals.orderBy('created_at').reverse().toArray();
}

export async function getGoalById(goalId: string): Promise<DBGoal | undefined> {
  return db.goals.get(goalId);
}

export async function createGoal(
  data: Omit<DBGoal, 'id' | 'created_at' | 'updated_at' | 'archived_at'> & { archived_at?: string | null }
): Promise<string> {
  const goal: DBGoal = {
    ...data,
    archived_at: data.archived_at ?? null,
    id: id(),
    created_at: now(),
    updated_at: now(),
  };
  await db.goals.add(goal);
  return goal.id;
}

export async function updateGoal(
  goalId: string,
  updates: Partial<Omit<DBGoal, 'id' | 'created_at'>>
): Promise<void> {
  await db.goals.update(goalId, { ...updates, updated_at: now() });
}

export async function deleteGoal(goalId: string): Promise<void> {
  // cascade: remove owned tasks, resources via edge lookup, then edges
  const ownedEdges = await db.edges.where('source_id').equals(goalId).toArray();
  for (const edge of ownedEdges) {
    if (edge.relationship === 'contains') {
      await db.tasks.delete(edge.target_id);
      await removeAllEdgesForNode(edge.target_id);
    }
    if (edge.relationship === 'attached_to' || edge.source_type === 'resource') {
      // handled separately below
    }
  }

  // delete resources attached to this goal
  const resourceEdges = await db.edges
    .where('target_id').equals(goalId)
    .filter(e => e.relationship === 'attached_to')
    .toArray();
  for (const edge of resourceEdges) {
    await db.resources.delete(edge.source_id);
    await removeAllEdgesForNode(edge.source_id);
  }

  await removeAllEdgesForNode(goalId);
  await db.goals.delete(goalId);
}

export async function updateGoalProgress(goalId: string, progress: number): Promise<void> {
  await db.goals.update(goalId, {
    progress: Math.min(100, Math.max(0, progress)),
    updated_at: now(),
  });
}

export async function archiveGoal(goalId: string): Promise<void> {
  await db.goals.update(goalId, {
    archived_at: now(),
    updated_at: now(),
  });
}

export async function restoreGoal(goalId: string): Promise<void> {
  await db.goals.update(goalId, {
    archived_at: null,
    updated_at: now(),
  });
}
