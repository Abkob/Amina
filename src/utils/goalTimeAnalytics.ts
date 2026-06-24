import type { DBTask } from '../db/schema';
import { formatTaskTime } from './taskTime';

export interface GoalTimeStats {
  spentMinutes: number;
  estimatedRemainingMinutes: number | null;
  adjustedRemainingMinutes: number | null;
  totalEstimatedMinutes: number | null;
  velocityRatio: number | null;
  velocityConfidence: 'none' | 'low' | 'medium' | 'high';
  taskCount: number;
  completedCount: number;
  tasksWithEstimate: number;
  completedWithActual: number;
}

/**
 * Computes goal-level time intelligence from ALL tasks (any depth).
 * velocityRatio = actual/estimated for completed tasks with both values.
 * adjustedRemainingMinutes applies that ratio to outstanding estimates — this is
 * what the scheduler AI should use to project finish time.
 */
export function computeGoalTimeStats(tasks: DBTask[]): GoalTimeStats {
  const completed  = tasks.filter(t => t.completed);
  const incomplete = tasks.filter(t => !t.completed);

  // Use actual when logged; fall back to estimated so completing a task
  // immediately shows time in the panel even without explicit time logging.
  const spentMinutes = completed.reduce((s, t) => s + (t.actual_minutes ?? t.estimated_minutes ?? 0), 0);

  // Velocity: only from tasks where we have BOTH actual AND estimated
  const pairedTasks = completed.filter(t => t.actual_minutes != null && (t.estimated_minutes ?? 0) > 0);
  const velocityRatio = pairedTasks.length > 0
    ? pairedTasks.reduce((s, t) => s + t.actual_minutes!, 0) /
      pairedTasks.reduce((s, t) => s + t.estimated_minutes!, 0)
    : null;

  const velocityConfidence: GoalTimeStats['velocityConfidence'] =
    pairedTasks.length === 0 ? 'none' :
    pairedTasks.length < 3  ? 'low'  :
    pairedTasks.length < 8  ? 'medium' : 'high';

  // Remaining estimate (raw)
  const taskWithRemainingEst = incomplete.filter(t => (t.estimated_minutes ?? 0) > 0);
  const estimatedRemainingMinutes = taskWithRemainingEst.length > 0
    ? taskWithRemainingEst.reduce((s, t) => s + t.estimated_minutes!, 0)
    : null;

  // Remaining estimate adjusted by velocity
  const adjustedRemainingMinutes =
    estimatedRemainingMinutes !== null && velocityRatio !== null
      ? Math.round(estimatedRemainingMinutes * velocityRatio)
      : estimatedRemainingMinutes;

  // Total estimated across all tasks
  const allWithEst = tasks.filter(t => (t.estimated_minutes ?? 0) > 0);
  const totalEstimatedMinutes = allWithEst.length > 0
    ? allWithEst.reduce((s, t) => s + t.estimated_minutes!, 0)
    : null;

  return {
    spentMinutes,
    estimatedRemainingMinutes,
    adjustedRemainingMinutes,
    totalEstimatedMinutes,
    velocityRatio,
    velocityConfidence,
    taskCount: tasks.length,
    completedCount: completed.length,
    tasksWithEstimate: allWithEst.length,
    completedWithActual: completed.filter(t => t.actual_minutes != null).length,
  };
}

/**
 * Projects the finish date based on remaining adjusted minutes and daily working hours.
 * Returns null if there is no remaining estimate or if the goal is already done.
 */
export function projectedFinishDate(stats: GoalTimeStats, dailyHours = 4): Date | null {
  const remaining = stats.adjustedRemainingMinutes;
  if (remaining == null || remaining <= 0) return null;
  if (stats.completedCount === stats.taskCount && stats.taskCount > 0) return null;

  const daysNeeded = remaining / 60 / dailyHours;
  const result = new Date();
  result.setDate(result.getDate() + Math.ceil(daysNeeded));
  result.setHours(0, 0, 0, 0);
  return result;
}

export function formatProjectedDate(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 6) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatVelocity(ratio: number): string {
  if (ratio < 0.85) return `${(ratio * 100).toFixed(0)}% of estimate (ahead)`;
  if (ratio <= 1.15) return 'On pace';
  return `${ratio.toFixed(1)}× estimate (running over)`;
}

export function velocityColor(ratio: number): string {
  if (ratio < 0.85) return 'text-emerald-600';
  if (ratio <= 1.15) return 'text-[#4648d4]';
  if (ratio <= 1.5) return 'text-amber-600';
  return 'text-red-500';
}

export { formatTaskTime };
