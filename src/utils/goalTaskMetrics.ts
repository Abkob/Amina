import type { DBTask } from '../db/schema';

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
