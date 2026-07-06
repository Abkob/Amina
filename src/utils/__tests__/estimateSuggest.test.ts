import { describe, expect, it } from 'vitest';
import { roundFriendly, suggestEstimate } from '../../../server/services/estimateSuggest';

const h = (goal_id: string | null, actual_minutes: number | null) => ({ goal_id, actual_minutes });

describe('roundFriendly', () => {
  it('rounds to quarter hours under two hours', () => {
    expect(roundFriendly(47)).toBe(45);
    expect(roundFriendly(53)).toBe(60);
  });
  it('rounds to half hours above two hours', () => {
    expect(roundFriendly(160)).toBe(150);
    expect(roundFriendly(200)).toBe(210);
  });
  it('never suggests below 15 minutes', () => {
    expect(roundFriendly(4)).toBe(15);
  });
});

describe('suggestEstimate', () => {
  it('uses the median of finished tasks in the same goal when there are enough', () => {
    const s = suggestEstimate({ goal_id: 'g1' }, [
      h('g1', 60), h('g1', 120), h('g1', 90),
      h('g2', 500),
    ]);
    expect(s.minutes).toBe(90);
    expect(s.basis).toContain('this goal');
    expect(s.basis).toContain('3 samples');
  });

  it('falls back to the global median when the goal has too little history', () => {
    const s = suggestEstimate({ goal_id: 'g1' }, [
      h('g1', 60), h('g2', 30), h('g3', 45), h(null, 90),
    ]);
    expect(s.minutes).toBe(roundFriendly((45 + 60) / 2));
    expect(s.basis).toContain('4 samples');
  });

  it('defaults to an hour with an honest basis when there is no history', () => {
    const s = suggestEstimate({ goal_id: null }, [h('g1', null), h('g2', 0)]);
    expect(s.minutes).toBe(60);
    expect(s.basis).toContain('no history');
  });
});
