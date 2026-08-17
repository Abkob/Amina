export const WORK_TIMER_STORAGE_KEY = 'marina-work-active-timer';

export type ActiveWorkTimer = {
  taskId: string;
  startedAt: string;
  notes: string;
};

export function readActiveWorkTimer(): ActiveWorkTimer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WORK_TIMER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveWorkTimer>;
    if (!parsed.taskId || !parsed.startedAt) return null;
    return { taskId: parsed.taskId, startedAt: parsed.startedAt, notes: parsed.notes ?? '' };
  } catch {
    return null;
  }
}

export function writeActiveWorkTimer(timer: ActiveWorkTimer | null) {
  if (typeof window === 'undefined') return;
  try {
    if (timer) window.localStorage?.setItem(WORK_TIMER_STORAGE_KEY, JSON.stringify(timer));
    else window.localStorage?.removeItem(WORK_TIMER_STORAGE_KEY);
  } catch {
    // Storage can be disabled by the browser; callers keep their in-memory state.
  }
}
