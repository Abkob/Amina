import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Inline the function under test (it lives in ScheduleView, not exported) ──
// We replicate it here so it can be tested in isolation.

function getWeekRange(offset: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay();
  const daysFromMon = (dow + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMon + offset * 7);

  const dateCells = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const dayLabels = dateCells.map(d =>
    `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
  );

  const sunday = dateCells[6];
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekLabel = `${fmt(monday)} – ${fmt(sunday)}`;

  const todayStr = today.toDateString();
  const todayIdx = dateCells.findIndex(d => d.toDateString() === todayStr);

  return { dateCells, dayLabels, todayIdx, weekLabel };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getWeekRange', () => {
  // Pin to a known Wednesday: 2026-06-24
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offset 0 starts on Monday of current week', () => {
    const { dateCells } = getWeekRange(0);
    const monday = dateCells[0];
    expect(monday.getDay()).toBe(1); // 1 = Monday
    expect(monday.toDateString()).toBe(new Date('2026-06-22').toDateString());
  });

  it('offset 0 ends on Sunday', () => {
    const { dateCells } = getWeekRange(0);
    const sunday = dateCells[6];
    expect(sunday.getDay()).toBe(0);
    expect(sunday.toDateString()).toBe(new Date('2026-06-28').toDateString());
  });

  it('offset 0 contains today (todayIdx points to Wednesday)', () => {
    const { dateCells, todayIdx } = getWeekRange(0);
    expect(todayIdx).toBe(2); // Mon=0, Tue=1, Wed=2
    expect(dateCells[todayIdx].toDateString()).toBe(new Date('2026-06-24').toDateString());
  });

  it('offset -1 is last week', () => {
    const { dateCells } = getWeekRange(-1);
    expect(dateCells[0].toDateString()).toBe(new Date('2026-06-15').toDateString());
    expect(dateCells[6].toDateString()).toBe(new Date('2026-06-21').toDateString());
  });

  it('offset +1 is next week', () => {
    const { dateCells } = getWeekRange(1);
    expect(dateCells[0].toDateString()).toBe(new Date('2026-06-29').toDateString());
    expect(dateCells[6].toDateString()).toBe(new Date('2026-07-05').toDateString());
  });

  it('todayIdx is -1 when offset is not 0', () => {
    expect(getWeekRange(-1).todayIdx).toBe(-1);
    expect(getWeekRange(1).todayIdx).toBe(-1);
  });

  it('weekLabel format: "Jun 22 – Jun 28"', () => {
    expect(getWeekRange(0).weekLabel).toBe('Jun 22 – Jun 28');
  });

  it('weekLabel spans months correctly', () => {
    // offset +1: Jun 29 – Jul 5
    expect(getWeekRange(1).weekLabel).toBe('Jun 29 – Jul 5');
  });

  it('always returns exactly 7 day cells', () => {
    expect(getWeekRange(0).dateCells).toHaveLength(7);
    expect(getWeekRange(-5).dateCells).toHaveLength(7);
    expect(getWeekRange(10).dateCells).toHaveLength(7);
  });

  it('day cells are consecutive (no gaps)', () => {
    const { dateCells } = getWeekRange(0);
    for (let i = 1; i < dateCells.length; i++) {
      const diff = dateCells[i].getTime() - dateCells[i - 1].getTime();
      expect(diff).toBe(86_400_000); // exactly 1 day
    }
  });
});
