import type { DBGoal, DBTask } from '../db/schema';

const ACTIVITY_WINDOW_DAYS = 7;

export interface GoalTaskMetrics {
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  progress: number;
  activityLevel: number;
  totalWeight: number;
  completedWeight: number;
  usesExplicitWeights: boolean;
}

function isDone(task: DBTask) {
  return task.completed || task.status === 'done';
}

function parseTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function getCountableGoalTasks(tasks: DBTask[]) {
  const parentIds = new Set(tasks.map(task => task.parent_task_id).filter(Boolean));
  return tasks.filter(task => !parentIds.has(task.id));
}

export function normalizeTaskWeight(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function calculateGoalTaskMetrics(tasks: DBTask[], now = new Date()): GoalTaskMetrics {
  const countableTasks = getCountableGoalTasks(tasks);
  const totalTasks = countableTasks.length;
  const completedTasks = countableTasks.filter(isDone).length;
  const remainingTasks = Math.max(0, totalTasks - completedTasks);
  const explicitWeights = countableTasks.map(task => normalizeTaskWeight(task.weight_percent));
  const usesExplicitWeights = explicitWeights.some(weight => weight !== null);
  const explicitTotal = explicitWeights.reduce((sum, weight) => sum + (weight ?? 0), 0);
  const unsetWeightCount = explicitWeights.filter(weight => weight === null).length;
  const fallbackWeight = usesExplicitWeights
    ? (unsetWeightCount > 0 ? Math.max(0, 100 - explicitTotal) / unsetWeightCount : 0)
    : 100 / Math.max(1, totalTasks);
  const taskWeights = countableTasks.map((task, index) => explicitWeights[index] ?? fallbackWeight);
  const totalWeight = taskWeights.reduce((sum, weight) => sum + weight, 0);
  const completedWeight = countableTasks.reduce(
    (sum, task, index) => sum + (isDone(task) ? taskWeights[index] : 0),
    0,
  );
  const progress = totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 100);

  const recentCutoff = now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentlyTouched = tasks.filter(task => parseTime(task.updated_at) >= recentCutoff).length;
  const recentlyCompleted = tasks.filter(task => isDone(task) && parseTime(task.updated_at) >= recentCutoff).length;
  const activeTasks = tasks.filter(task => task.status === 'in_progress' && !isDone(task)).length;
  const activityScore = recentlyTouched + recentlyCompleted + activeTasks * 2;

  const activityLevel =
    totalTasks === 0 ? 1 :
    progress === 100 ? 5 :
    activityScore >= 8 ? 5 :
    activityScore >= 5 ? 4 :
    activityScore >= 3 ? 3 :
    activityScore >= 1 ? 2 :
    1;

  return {
    totalTasks,
    completedTasks,
    remainingTasks,
    progress,
    activityLevel,
    totalWeight,
    completedWeight,
    usesExplicitWeights,
  };
}

// ─── Dynamic health status ───────────────────────────────────────────────────
// Derives Safe/Watch/Risky from deadline proximity and hours remaining.
// Never use goal.status from the DB for display — call this instead.
export function computeGoalStatus(
  goal: DBGoal,
  tasks: DBTask[],
  now = new Date()
): 'Safe' | 'Watch' | 'Risky' {
  const metrics = calculateGoalTaskMetrics(tasks, now);
  const progress = metrics.progress; // 0–100

  if (progress === 100) return 'Safe';

  // Remaining estimated minutes across incomplete tasks
  const remainingMinutes = tasks
    .filter(t => !t.completed && t.status !== 'done')
    .reduce((sum, t) => sum + (t.estimated_minutes ?? 0), 0);

  // Parse deadline — handle ISO date strings; ignore quarter strings like "Q3 2024"
  const deadlineDate = goal.deadline
    ? (() => { const d = new Date(goal.deadline.slice(0, 10) + 'T23:59:59'); return isNaN(d.getTime()) ? null : d; })()
    : null;

  if (!deadlineDate) {
    // No parseable deadline — base purely on progress
    if (progress >= 60) return 'Safe';
    if (progress >= 20) return 'Watch';
    return 'Watch';
  }

  const daysLeft = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysLeft < 0) return 'Risky'; // overdue

  // How much time has elapsed as a fraction of total goal lifespan
  const created = new Date(goal.created_at);
  const totalDays = Math.max(1, (deadlineDate.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedFraction = Math.min(1, Math.max(0, (totalDays - daysLeft) / totalDays));
  const expectedProgress = elapsedFraction * 100;
  const progressGap = expectedProgress - progress; // positive = behind schedule

  // Hours pressure: remaining work vs remaining calendar time (4 productive hrs/day)
  const hoursLeft = daysLeft * 4;
  const hoursPressure = remainingMinutes > 0 && hoursLeft > 0 ? remainingMinutes / 60 / hoursLeft : 0;

  if (progressGap > 40 || daysLeft < 3 || (daysLeft < 7 && progress < 50) || hoursPressure > 1.5) {
    return 'Risky';
  }
  if (progressGap > 20 || (daysLeft < 14 && progress < 30) || hoursPressure > 0.75) {
    return 'Watch';
  }
  return 'Safe';
}
