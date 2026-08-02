import { describe, expect, it } from 'vitest';
import { HOUR_PX, scheduleHourPxForViewport } from '../../views/schedule/WeekTimeGrid';

describe('schedule viewport density', () => {
  it('keeps the comfortable density at normal viewport widths', () => {
    expect(scheduleHourPxForViewport(1280)).toBe(HOUR_PX);
    expect(scheduleHourPxForViewport(1440)).toBe(HOUR_PX);
  });

  it('progressively condenses the time grid as the viewport widens', () => {
    expect(scheduleHourPxForViewport(1920)).toBe(36);
    expect(scheduleHourPxForViewport(2560)).toBe(28);
    expect(scheduleHourPxForViewport(4000)).toBe(28);
  });
});
