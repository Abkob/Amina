import { describe, expect, it } from 'vitest';
import { suggestionsFromPlan } from '../planAssist';

const t = (id: string, over: Partial<{ start_date: string | null; completed: boolean; status: string }> = {}) => ({
  id,
  start_date: null,
  completed: false,
  status: 'todo',
  ...over,
});

describe('suggestionsFromPlan', () => {
  it('suggests the earliest planned day per task, once', () => {
    const out = suggestionsFromPlan(
      [
        { date: '2026-07-08', task_ids: ['a'] },
        { date: '2026-07-06', task_ids: ['a', 'b'] },
      ],
      [t('a'), t('b')],
    );
    expect(out).toEqual([
      { taskId: 'a', date: '2026-07-06' },
      { taskId: 'b', date: '2026-07-06' },
    ]);
  });

  it('skips tasks the user already placed on a day', () => {
    const out = suggestionsFromPlan(
      [{ date: '2026-07-06', task_ids: ['a', 'b'] }],
      [t('a', { start_date: '2026-07-07' }), t('b')],
    );
    expect(out).toEqual([{ taskId: 'b', date: '2026-07-06' }]);
  });

  it('skips finished and unknown tasks', () => {
    const out = suggestionsFromPlan(
      [{ date: '2026-07-06', task_ids: ['done', 'status-done', 'ghost', 'ok'] }],
      [t('done', { completed: true }), t('status-done', { status: 'done' }), t('ok')],
    );
    expect(out).toEqual([{ taskId: 'ok', date: '2026-07-06' }]);
  });

  it('returns suggestions ordered by date', () => {
    const out = suggestionsFromPlan(
      [
        { date: '2026-07-09', task_ids: ['late'] },
        { date: '2026-07-06', task_ids: ['early'] },
      ],
      [t('late'), t('early')],
    );
    expect(out.map(s => s.date)).toEqual(['2026-07-06', '2026-07-09']);
  });
});
