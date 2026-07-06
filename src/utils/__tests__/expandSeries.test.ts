import { describe, expect, it } from 'vitest';
import { expandSeries } from '../../../server/services/planLayout';

const base = {
  title: 'Morning study',
  start_date: '2026-07-06', // a Monday
  end_date: '2026-07-12',   // through Sunday
  start_hour: 6,
  end_hour: 9,
};

describe('expandSeries', () => {
  it('expands a daily series across the whole span, inclusive', () => {
    const blocks = expandSeries(base);
    expect(blocks).toHaveLength(7);
    expect(blocks[0]).toMatchObject({ date: '2026-07-06', start_hour: 6, duration_hours: 3 });
    expect(blocks[6].date).toBe('2026-07-12');
  });

  it('filters to the requested weekdays (Mon=1 … Sun=7)', () => {
    const blocks = expandSeries({ ...base, days_of_week: [1, 3, 5] });
    expect(blocks.map(b => b.date)).toEqual(['2026-07-06', '2026-07-08', '2026-07-10']);
  });

  it('links every instance to the task when one is given', () => {
    const blocks = expandSeries({ ...base, task_id: 't1' });
    expect(blocks.every(b => b.task_id === 't1' && b.planned_minutes === 180)).toBe(true);
  });

  it('returns nothing for a backwards hour window', () => {
    expect(expandSeries({ ...base, start_hour: 9, end_hour: 6 })).toEqual([]);
  });

  it('caps runaway spans at 120 instances', () => {
    const blocks = expandSeries({ ...base, end_date: '2027-07-06' });
    expect(blocks).toHaveLength(120);
  });
});
