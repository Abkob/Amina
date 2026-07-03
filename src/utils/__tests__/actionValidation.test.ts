import { describe, it, expect } from 'vitest';
import { validateModelActions } from '../../../server/services/actionValidation';

describe('validateModelActions — strict model output validation', () => {
  it('accepts a well-formed create_task action', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'create_task', description: 'Add task', params: { title: 'Write spec', estimated_minutes: 60, priority: 'high' } },
    ]);
    expect(a.rejected_reason).toBeUndefined();
    expect(a.type).toBe('create_task');
    expect(a.params.title).toBe('Write spec');
  });

  it('rejects unknown action types', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'delete_all_data', params: {} },
    ]);
    expect(a.rejected_reason).toContain('unknown action type');
  });

  it('rejects unknown fields (strict mode) — model cannot smuggle extra mutations', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'update_task', params: { task_id: 't1', completed: true } },
    ]);
    expect(a.rejected_reason).toBeTruthy();
    expect(a.rejected_reason).toContain('completed');
  });

  it('rejects malformed dates', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'create_task', params: { title: 'x', due_date: 'next tuesday' } },
    ]);
    expect(a.rejected_reason).toContain('YYYY-MM-DD');
  });

  it('rejects out-of-range estimated_minutes', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'create_task', params: { title: 'x', estimated_minutes: 99999 } },
    ]);
    expect(a.rejected_reason).toBeTruthy();
  });

  it('rejects invalid enum values for priority/status', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'update_task', params: { task_id: 't1', priority: 'extreme' } },
    ]);
    expect(a.rejected_reason).toBeTruthy();
  });

  it('rejects actions missing a type entirely', () => {
    const [a] = validateModelActions([{ params: { title: 'x' } }]);
    expect(a.rejected_reason).toBe('missing action type');
  });

  it('handles a mixed batch — valid pass, invalid carry reasons, order preserved', () => {
    const out = validateModelActions([
      { id: 'a1', type: 'create_goal', params: { title: 'Goal', deadline: '2026-09-01' } },
      { id: 'a2', type: 'drop_table', params: {} },
      { id: 'a3', type: 'update_goal', params: { goal_id: 'g1', status: 'Watch' } },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0].rejected_reason).toBeUndefined();
    expect(out[1].rejected_reason).toContain('unknown action type');
    expect(out[2].rejected_reason).toBeUndefined();
  });

  it('assigns fallback ids when the model omits them', () => {
    const out = validateModelActions([
      { type: 'create_goal', params: { title: 'A' } },
      { type: 'create_goal', params: { title: 'B' } },
    ]);
    expect(out[0].id).toBe('a1');
    expect(out[1].id).toBe('a2');
  });

  it('rejects empty titles', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'create_goal', params: { title: '' } },
    ]);
    expect(a.rejected_reason).toBeTruthy();
  });

  it('allows nullable date clearing on update_task', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'update_task', params: { task_id: 't1', due_date: null } },
    ]);
    expect(a.rejected_reason).toBeUndefined();
    expect(a.params.due_date).toBeNull();
  });

  it('strips null optional fields on create actions (real models ignore "omit nulls")', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'create_task', params: { goal_id: 'goal-1', parent_task_id: null, milestone_id: null, title: 'Verify Pipeline Test', due_date: '2026-07-10', estimated_minutes: 60 } },
    ]);
    expect(a.rejected_reason).toBeUndefined();
    expect(a.params.title).toBe('Verify Pipeline Test');
    expect('parent_task_id' in a.params).toBe(false);
    expect('milestone_id' in a.params).toBe(false);
  });

  it('keeps meaningful nulls on update actions (clearing a due date)', () => {
    const [a] = validateModelActions([
      { id: 'a1', type: 'update_task', params: { task_id: 't1', due_date: null, priority: null } },
    ]);
    expect(a.rejected_reason).toBeUndefined();
    expect(a.params.due_date).toBeNull();       // meaningful clear — preserved
    expect('priority' in a.params).toBe(false); // null "no change" — stripped
  });

  it('validates create_milestone color format', () => {
    const [bad] = validateModelActions([
      { id: 'a1', type: 'create_milestone', params: { goal_id: 'g1', title: 'M', color: 'red' } },
    ]);
    expect(bad.rejected_reason).toBeTruthy();
    const [good] = validateModelActions([
      { id: 'a1', type: 'create_milestone', params: { goal_id: 'g1', title: 'M', color: '#6366f1' } },
    ]);
    expect(good.rejected_reason).toBeUndefined();
  });
});
