import type { DBTask } from '../db/schema';

const MAX_TASK_MINUTES = 60 * 1000;

export function normalizeTaskMinutes(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.min(MAX_TASK_MINUTES, Math.max(0, Math.round(value)));
}

export function parseTaskTimeInput(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  // (?![a-zA-Z]) prevents matching letters that are part of a longer word (e.g. "min" in "mining")
  // but allows unit letters immediately followed by digits (e.g. "1h30m")
  const unitMatches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h|minutes?|mins?|min|m)(?![a-zA-Z])/g)];
  if (unitMatches.length > 0) {
    const total = unitMatches.reduce((sum, match) => {
      const amount = Number(match[1]);
      const unit = match[2];
      if (Number.isNaN(amount)) return sum;
      return sum + (unit.startsWith('h') ? amount * 60 : amount);
    }, 0);
    return normalizeTaskMinutes(total);
  }

  const plainNumber = Number(normalized.replace(/[^\d.]/g, ''));
  if (Number.isNaN(plainNumber) || plainNumber <= 0) return null;

  // Plain small numbers usually mean hours; larger plain numbers usually mean minutes.
  return normalizeTaskMinutes(plainNumber <= 12 ? plainNumber * 60 : plainNumber);
}

export function formatTaskTime(minutes: number | null | undefined): string {
  const normalized = normalizeTaskMinutes(minutes);
  if (normalized === null || normalized === 0) return 'Time';
  if (normalized < 60) return `${normalized}m`;

  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

export function formatTaskTimeLong(minutes: number): string {
  const normalized = normalizeTaskMinutes(minutes) ?? 0;
  if (normalized < 60) return `${normalized} min`;

  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  if (mins === 0) return `${hours} hr${hours === 1 ? '' : 's'}`;
  return `${hours} hr${hours === 1 ? '' : 's'} ${mins} min`;
}

export function getTaskEstimatedMinutes(task: DBTask): number | null {
  const explicit = normalizeTaskMinutes(task.estimated_minutes);
  if (explicit !== null && explicit > 0) return explicit;
  return parseTaskTimeInput(task.estimated_duration);
}

export interface RolledUpTime {
  /** Best total minutes to display: children's sum if any children have times, else own estimate. */
  minutes: number | null;
  /** True when the value came from summing descendants rather than the task's own field. */
  isRollup: boolean;
  /**
   * True when the task has its own explicit time AND descendants also have times that differ —
   * a signal the user set a top-down estimate that no longer matches the bottom-up sum.
   */
  conflict: boolean;
  /** Raw sum of all descendent leaf-task minutes (null when no descendants have times). */
  childrenSum: number | null;
}

function getLeafDescendants(taskId: string, allTasks: DBTask[]): DBTask[] {
  const direct = allTasks.filter(t => t.parent_task_id === taskId);
  if (direct.length === 0) return [];
  const result: DBTask[] = [];
  for (const child of direct) {
    const childLeaves = getLeafDescendants(child.id, allTasks);
    if (childLeaves.length === 0) result.push(child);
    else result.push(...childLeaves);
  }
  return result;
}

/**
 * Returns a 0–1 completion ratio for a task based on its leaf descendants.
 * If the task itself is marked completed/done, returns 1 immediately.
 * If it has no descendants, returns 0 (incomplete) or 1 (completed).
 */
export function getTaskLeafProgress(task: DBTask, allTasks: DBTask[]): number {
  if (task.completed || task.status === 'done') return 1;
  const leaves = getLeafDescendants(task.id, allTasks);
  if (leaves.length === 0) return 0;
  const done = leaves.filter(l => l.completed || l.status === 'done').length;
  return done / leaves.length;
}

/**
 * Recursively sums estimated_minutes from all descendants.
 * Children's times always take precedence over a parent's own estimate when they are present.
 */
export function getRolledUpTime(task: DBTask, allTasks: DBTask[]): RolledUpTime {
  const directChildren = allTasks.filter(t => t.parent_task_id === task.id);
  const ownMinutes = getTaskEstimatedMinutes(task);

  if (directChildren.length === 0) {
    return { minutes: ownMinutes, isRollup: false, conflict: false, childrenSum: null };
  }

  let sum = 0;
  let anyChildHasTime = false;

  for (const child of directChildren) {
    const childResult = getRolledUpTime(child, allTasks);
    if (childResult.minutes !== null) {
      sum += childResult.minutes;
      anyChildHasTime = true;
    }
  }

  if (!anyChildHasTime) {
    return { minutes: ownMinutes, isRollup: false, conflict: false, childrenSum: null };
  }

  const childrenSum = sum;
  const conflict = ownMinutes !== null && ownMinutes > 0 && ownMinutes !== childrenSum;

  return { minutes: childrenSum, isRollup: true, conflict, childrenSum };
}
