import { useSyncExternalStore } from 'react';

// Single interval for the whole app — all subscribers re-render in one batch.
// 30-second granularity: accurate enough for h/m countdowns, cheap enough for
// a page with dozens of DeadlinePills.
const INTERVAL_MS = 30_000;

let _now = new Date();
const _listeners = new Set<() => void>();

setInterval(() => {
  _now = new Date();
  _listeners.forEach(fn => fn());
}, INTERVAL_MS);

function subscribe(cb: () => void) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function getSnapshot() {
  return _now;
}

/** Returns a Date that updates every 30 s. All callers share one setInterval. */
export function useNow(): Date {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
