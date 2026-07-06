/**
 * Live feedback for the chat plan widget: after the user drags proposed
 * blocks around, recompute each day's planned load against the capacity the
 * scheduler reported, so the widget can immediately say what stopped fitting.
 */

export interface PlanBlockLike {
  date: string;
  planned_minutes: number;
}

export interface DayCapacity {
  date: string;
  available_minutes: number;
}

export interface DayLoad {
  date: string;
  planned_minutes: number;
  available_minutes: number | null;
  over_minutes: number;
}

export function planDayLoads(blocks: PlanBlockLike[], capacities: DayCapacity[]): DayLoad[] {
  const availByDate = new Map(capacities.map(c => [c.date, c.available_minutes]));
  const plannedByDate = new Map<string, number>();
  for (const b of blocks) {
    plannedByDate.set(b.date, (plannedByDate.get(b.date) ?? 0) + b.planned_minutes);
  }
  return [...plannedByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, planned_minutes]) => {
      const available = availByDate.get(date) ?? null;
      return {
        date,
        planned_minutes,
        available_minutes: available,
        over_minutes: available === null ? 0 : Math.max(0, planned_minutes - available),
      };
    });
}

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m ? ` ${m}m` : ''}`;
}

function fmtDay(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** One sentence about the current arrangement; null when everything fits. */
export function planFeedbackLine(loads: DayLoad[]): string | null {
  const over = loads.filter(l => l.over_minutes > 0);
  if (over.length === 0) return null;
  const parts = over.slice(0, 2).map(l => `${fmtDay(l.date)} is ${fmtMins(l.over_minutes)} over capacity`);
  const more = over.length > 2 ? ` (+${over.length - 2} more day${over.length - 2 !== 1 ? 's' : ''})` : '';
  return `${parts.join(', ')}${more} — move something or shrink a block.`;
}
