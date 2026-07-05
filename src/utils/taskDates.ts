import type { DBTask } from '../db/schema';

export function getEffectiveTaskDueDate(task: DBTask, allTasks: DBTask[]): string | null {
  if (task.due_date) return task.due_date;
  if (!task.parent_task_id) return null;

  const byId = new Map(allTasks.map(t => [t.id, t]));
  const seen = new Set<string>();
  let parentId: string | null = task.parent_task_id;

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (parent.due_date) return parent.due_date;
    parentId = parent.parent_task_id;
  }

  return null;
}

export function getInheritedTaskDueDate(task: DBTask, allTasks: DBTask[]): string | null {
  if (task.due_date || !task.parent_task_id) return null;
  return getEffectiveTaskDueDate(task, allTasks);
}

export function taskUsesInheritedDueDate(task: DBTask, allTasks: DBTask[]): boolean {
  return getInheritedTaskDueDate(task, allTasks) !== null;
}
