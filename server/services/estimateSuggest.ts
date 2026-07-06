/**
 * Deterministic estimate suggestions for unestimated tasks, grounded in the
 * user's own history: what similar finished work ACTUALLY took. No model
 * call — instant, explainable, and testable. Pure.
 */

export interface HistoryTask {
  goal_id: string | null;
  actual_minutes: number | null;
}

export interface EstimateSuggestion {
  minutes: number;
  /** human-readable provenance shown next to the guess */
  basis: string;
}

const DEFAULT_MINUTES = 60;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Round to friendly picker steps: quarter hours under 2h, half hours above. Never below 15m. */
export function roundFriendly(minutes: number): number {
  const step = minutes < 120 ? 15 : 30;
  return Math.max(15, Math.round(minutes / step) * step);
}

export function suggestEstimate(
  task: { goal_id: string | null },
  history: HistoryTask[],
): EstimateSuggestion {
  const logged = history.filter(h => typeof h.actual_minutes === 'number' && h.actual_minutes! > 0);

  const sameGoal = task.goal_id ? logged.filter(h => h.goal_id === task.goal_id) : [];
  if (sameGoal.length >= 2) {
    return {
      minutes: roundFriendly(median(sameGoal.map(h => h.actual_minutes!))),
      basis: `finished tasks in this goal usually took this long (${sameGoal.length} samples)`,
    };
  }

  if (logged.length >= 3) {
    return {
      minutes: roundFriendly(median(logged.map(h => h.actual_minutes!))),
      basis: `your finished tasks usually take this long (${logged.length} samples)`,
    };
  }

  return { minutes: DEFAULT_MINUTES, basis: 'no history yet — a starting guess' };
}
