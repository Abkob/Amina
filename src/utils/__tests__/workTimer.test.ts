// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readActiveWorkTimer, writeActiveWorkTimer } from '../workTimer';

describe('shared work timer state', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
  });

  it('lets the calendar start a timer that the Work view can read and clear', () => {
    const timer = { taskId: 'task-1', startedAt: '2026-08-11T10:00:00.000Z', notes: '' };
    writeActiveWorkTimer(timer);
    expect(readActiveWorkTimer()).toEqual(timer);

    writeActiveWorkTimer(null);
    expect(readActiveWorkTimer()).toBeNull();
  });
});
