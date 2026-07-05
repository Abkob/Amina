/**
 * Turns the auto-planner's day assignments into explicit, placeable
 * suggestion cards — the planner never paints the calendar on its own.
 */

export interface PlanSuggestion {
  taskId: string;
  /** First day the auto-planner would touch the task. */
  date: string;
}

interface SuggestibleTask {
  id: string;
  start_date?: string | null;
  completed: boolean;
  status: string;
}

export function suggestionsFromPlan(
  dayAssignments: Array<{ date: string; task_ids: string[] }>,
  tasks: SuggestibleTask[],
): PlanSuggestion[] {
  const eligible = new Map(
    tasks
      .filter(t => !t.completed && t.status !== 'done' && !t.start_date)
      .map(t => [t.id, t]),
  );
  const seen = new Set<string>();
  const out: PlanSuggestion[] = [];
  for (const day of [...dayAssignments].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const taskId of day.task_ids) {
      if (!eligible.has(taskId) || seen.has(taskId)) continue;
      seen.add(taskId);
      out.push({ taskId, date: day.date });
    }
  }
  return out;
}
