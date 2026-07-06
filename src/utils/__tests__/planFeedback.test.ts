import { describe, expect, it } from 'vitest';
import { planDayLoads, planFeedbackLine } from '../planFeedback';

describe('planDayLoads', () => {
  it('sums planned minutes per day against capacity', () => {
    const loads = planDayLoads(
      [
        { date: '2026-07-06', planned_minutes: 120 },
        { date: '2026-07-06', planned_minutes: 60 },
        { date: '2026-07-07', planned_minutes: 30 },
      ],
      [
        { date: '2026-07-06', available_minutes: 240 },
        { date: '2026-07-07', available_minutes: 240 },
      ],
    );
    expect(loads).toEqual([
      { date: '2026-07-06', planned_minutes: 180, available_minutes: 240, over_minutes: 0 },
      { date: '2026-07-07', planned_minutes: 30, available_minutes: 240, over_minutes: 0 },
    ]);
  });

  it('flags overloaded days', () => {
    const loads = planDayLoads(
      [{ date: '2026-07-06', planned_minutes: 300 }],
      [{ date: '2026-07-06', available_minutes: 240 }],
    );
    expect(loads[0].over_minutes).toBe(60);
  });

  it('treats days without a known capacity as never over', () => {
    const loads = planDayLoads([{ date: '2026-07-11', planned_minutes: 600 }], []);
    expect(loads[0]).toEqual({ date: '2026-07-11', planned_minutes: 600, available_minutes: null, over_minutes: 0 });
  });
});

describe('planFeedbackLine', () => {
  it('is silent when everything fits', () => {
    expect(planFeedbackLine([
      { date: '2026-07-06', planned_minutes: 60, available_minutes: 240, over_minutes: 0 },
    ])).toBeNull();
  });

  it('names the overloaded day with the overflow amount', () => {
    const line = planFeedbackLine([
      { date: '2026-07-06', planned_minutes: 320, available_minutes: 240, over_minutes: 80 },
    ]);
    expect(line).toContain('Mon, Jul 6');
    expect(line).toContain('1h 20m over capacity');
  });

  it('caps the list at two days and counts the rest', () => {
    const over = (date: string) => ({ date, planned_minutes: 300, available_minutes: 240, over_minutes: 60 });
    const line = planFeedbackLine([over('2026-07-06'), over('2026-07-07'), over('2026-07-08'), over('2026-07-09')]);
    expect(line).toContain('+2 more days');
  });
});
