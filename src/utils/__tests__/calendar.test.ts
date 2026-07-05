import { describe, expect, it } from 'vitest';
import {
  addDays, mondayOf, dateToWeekPos, eventDate, snapHour, clampHour,
  fmtHourLabel, fmtTimeRange, packOverlaps,
} from '../calendar';

describe('week math', () => {
  it('finds the Monday of a mid-week date', () => {
    expect(mondayOf('2026-07-08')).toBe('2026-07-06'); // Wednesday → Monday
  });

  it('treats Sunday as the last day of the week, not the first', () => {
    expect(mondayOf('2026-07-05')).toBe('2026-06-29'); // Sunday → previous Monday
  });

  it('is a fixed point on Mondays', () => {
    expect(mondayOf('2026-07-06')).toBe('2026-07-06');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-06-29', 7)).toBe('2026-07-06');
    expect(addDays('2026-07-06', -7)).toBe('2026-06-29');
  });

  it('maps a date to Monday week_start + 0-based day index', () => {
    expect(dateToWeekPos('2026-07-08')).toEqual({ week_start: '2026-07-06', day_index: 2 });
    expect(dateToWeekPos('2026-07-05')).toEqual({ week_start: '2026-06-29', day_index: 6 });
  });
});

describe('eventDate', () => {
  it('resolves week_start + day_index to a concrete date', () => {
    expect(eventDate({ week_start: '2026-07-06', day_index: 2 })).toBe('2026-07-08');
  });

  it('normalizes a week_start that drifted off Monday', () => {
    expect(eventDate({ week_start: '2026-07-09', day_index: 0 })).toBe('2026-07-06');
  });

  it('returns null for weekly repeaters (no week_start)', () => {
    expect(eventDate({ week_start: null, day_index: 3 })).toBeNull();
  });
});

describe('snapping and clamping', () => {
  it('snaps to the nearest quarter hour by default', () => {
    expect(snapHour(9.13)).toBe(9.25);
    expect(snapHour(9.12)).toBe(9);
  });

  it('snaps to other steps', () => {
    expect(snapHour(9.9, 30)).toBe(10);
    expect(snapHour(9.7, 30)).toBe(9.5);
  });

  it('clamps into the grid range', () => {
    expect(clampHour(4, 6, 23)).toBe(6);
    expect(clampHour(25, 6, 23)).toBe(23);
  });
});

describe('time labels', () => {
  it('labels gutter hours', () => {
    expect(fmtHourLabel(9)).toBe('9 AM');
    expect(fmtHourLabel(12)).toBe('12 PM');
    expect(fmtHourLabel(0)).toBe('12 AM');
  });

  it('omits the meridiem on the start when both ends share it', () => {
    expect(fmtTimeRange(9, 1.5)).toBe('9 – 10:30 AM');
    expect(fmtTimeRange(13, 1)).toBe('1 – 2 PM');
  });

  it('shows both meridiems when the range crosses noon or midnight', () => {
    expect(fmtTimeRange(11.5, 1)).toBe('11:30 AM – 12:30 PM');
    expect(fmtTimeRange(23, 1)).toBe('11 PM – 12 AM');
  });
});

describe('packOverlaps', () => {
  it('gives non-overlapping blocks the full width', () => {
    const packed = packOverlaps([
      { id: 'a', start: 9, end: 10 },
      { id: 'b', start: 10, end: 11 },
    ]);
    expect(packed.get('a')).toEqual({ col: 0, cols: 1 });
    expect(packed.get('b')).toEqual({ col: 0, cols: 1 });
  });

  it('splits overlapping blocks into side-by-side columns', () => {
    const packed = packOverlaps([
      { id: 'a', start: 9, end: 11 },
      { id: 'b', start: 10, end: 12 },
    ]);
    expect(packed.get('a')!.cols).toBe(2);
    expect(packed.get('b')!.cols).toBe(2);
    expect(packed.get('a')!.col).not.toBe(packed.get('b')!.col);
  });

  it('reuses a freed column inside a chain (a→b→c)', () => {
    const packed = packOverlaps([
      { id: 'a', start: 9, end: 11 },
      { id: 'b', start: 10, end: 12 },
      { id: 'c', start: 11, end: 13 }, // overlaps only b — can reuse a's column
    ]);
    expect(packed.get('c')).toEqual({ col: 0, cols: 2 });
  });

  it('keeps independent clusters at full width', () => {
    const packed = packOverlaps([
      { id: 'a', start: 9, end: 11 },
      { id: 'b', start: 10, end: 11 },
      { id: 'c', start: 14, end: 15 },
    ]);
    expect(packed.get('a')!.cols).toBe(2);
    expect(packed.get('c')).toEqual({ col: 0, cols: 1 });
  });

  it('handles a triple overlap', () => {
    const packed = packOverlaps([
      { id: 'a', start: 9, end: 12 },
      { id: 'b', start: 9.5, end: 11 },
      { id: 'c', start: 10, end: 11.5 },
    ]);
    expect(packed.get('a')!.cols).toBe(3);
    expect(new Set([packed.get('a')!.col, packed.get('b')!.col, packed.get('c')!.col]).size).toBe(3);
  });
});
