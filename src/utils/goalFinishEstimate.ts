import type { DBGoal, DBTask } from '../db/schema';
import { getCountableGoalTasks } from './goalTaskMetrics';
import { formatTaskTimeLong, getTaskEstimatedMinutes } from './taskTime';

const DEFAULT_MINUTES_PER_TASK = 60;
const FOCUS_MINUTES_PER_DAY = 180;

export interface GoalFinishEstimate {
  label: string;
  caption: 'Target' | 'Estimate' | 'Done' | 'Open';
  source: 'target' | 'task_due_dates' | 'task_durations' | 'task_count' | 'completed' | 'none';
  title: string;
}

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addBusinessDays(start: Date, days: number): Date {
  const date = new Date(start);
  let added = 0;

  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }

  return date;
}

function formatDate(date: Date, now = new Date()): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export function getGoalFinishEstimate(
  goal: DBGoal,
  tasks: DBTask[],
  now = new Date(),
): GoalFinishEstimate {
  const target = goal.deadline?.trim();
  if (target) {
    const isIso = /^\d{4}-\d{2}-\d{2}/.test(target);
    const parsed = isIso ? new Date(`${target.slice(0, 10)}T00:00:00`) : null;
    const label = parsed && !Number.isNaN(parsed.getTime()) ? formatDate(parsed, now) : target;
    return {
      label,
      caption: 'Target',
      source: 'target',
      title: `Goal deadline: ${target}`,
    };
  }

  const countableTasks = getCountableGoalTasks(tasks);
  const remainingTasks = countableTasks.filter((task) => !task.completed && task.status !== 'done');
  if (countableTasks.length > 0 && remainingTasks.length === 0) {
    return {
      label: 'Finished',
      caption: 'Done',
      source: 'completed',
      title: 'All countable tasks and subtasks are completed',
    };
  }
  const latestDueDate = remainingTasks
    .map((task) => parseDateOnly(task.due_date))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (latestDueDate) {
    return {
      label: formatDate(latestDueDate, now),
      caption: 'Estimate',
      source: 'task_due_dates',
      title: 'Estimated from the latest remaining task or subtask due date',
    };
  }

  if (remainingTasks.length > 0) {
    let usedExplicitDuration = false;
    const totalMinutes = remainingTasks.reduce((sum, task) => {
      const parsed = getTaskEstimatedMinutes(task);
      if (parsed !== null) usedExplicitDuration = true;
      return sum + (parsed ?? DEFAULT_MINUTES_PER_TASK);
    }, 0);
    const focusDays = Math.max(1, Math.ceil(totalMinutes / FOCUS_MINUTES_PER_DAY));
    const finishDate = addBusinessDays(now, focusDays - 1);

    return {
      label: `~${formatDate(finishDate, now)}`,
      caption: 'Estimate',
      source: usedExplicitDuration ? 'task_durations' : 'task_count',
      title: `Estimated from ${remainingTasks.length} remaining task${remainingTasks.length === 1 ? '' : 's'} and about ${formatTaskTimeLong(totalMinutes)} of work`,
    };
  }

  return {
    label: 'No target yet',
    caption: 'Open',
    source: 'none',
    title: 'Add task due dates or durations to estimate a finish date',
  };
}
