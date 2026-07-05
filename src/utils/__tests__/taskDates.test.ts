import { describe, expect, it } from 'vitest';
import type { DBTask } from '../../db/schema';
import { getEffectiveTaskDueDate, getInheritedTaskDueDate, taskUsesInheritedDueDate } from '../taskDates';

function task(overrides: Partial<DBTask>): DBTask {
  return {
    id: 'task',
    goal_id: 'goal',
    parent_task_id: null,
    title: 'Task',
    description: '',
    status: 'todo',
    priority: 'medium',
    kind: 'manual',
    critical_path_status: null,
    tags_json: '[]',
    due_date: null,
    estimated_duration: null,
    estimated_minutes: null,
    actual_minutes: null,
    weight_percent: null,
    completed: false,
    position: 0,
    created_at: '2026-07-05T00:00:00.000Z',
    updated_at: '2026-07-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('task due date inheritance', () => {
  it('keeps top-level tasks undated when they have no task deadline', () => {
    const parent = task({ id: 'parent', due_date: null });
    expect(getEffectiveTaskDueDate(parent, [parent])).toBeNull();
    expect(taskUsesInheritedDueDate(parent, [parent])).toBe(false);
  });

  it('inherits the nearest parent task due date for an undated child', () => {
    const parent = task({ id: 'parent', due_date: '2026-07-20' });
    const child = task({ id: 'child', parent_task_id: 'parent', due_date: null });

    expect(getEffectiveTaskDueDate(child, [parent, child])).toBe('2026-07-20');
    expect(getInheritedTaskDueDate(child, [parent, child])).toBe('2026-07-20');
  });

  it('lets a child explicit due date override the parent', () => {
    const parent = task({ id: 'parent', due_date: '2026-07-20' });
    const child = task({ id: 'child', parent_task_id: 'parent', due_date: '2026-07-12' });

    expect(getEffectiveTaskDueDate(child, [parent, child])).toBe('2026-07-12');
    expect(getInheritedTaskDueDate(child, [parent, child])).toBeNull();
  });

  it('walks ancestor tasks but never looks at goal dates', () => {
    const grandparent = task({ id: 'grandparent', due_date: '2026-08-01' });
    const parent = task({ id: 'parent', parent_task_id: 'grandparent', due_date: null });
    const child = task({ id: 'child', parent_task_id: 'parent', due_date: null });

    expect(getEffectiveTaskDueDate(child, [grandparent, parent, child])).toBe('2026-08-01');
  });
});
