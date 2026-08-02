import { useMemo } from 'react';
import {
  AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ChevronDown,
  CircleHelp, Clock3, Flag, FolderKanban, Target, TimerReset,
} from 'lucide-react';
import type { DBGoal, DBTask } from '../../db/schema';
import type { ScheduleDay, SchedulerResult, ScheduleTaskInfo } from '../../api/hooks';
import { parseLocalDate } from '../../utils/calendar';

type SchedulePrefsSummary = {
  daily_capacity_minutes?: number;
  buffer_ratio?: number;
  work_start?: number;
  work_end?: number;
};

type Props = {
  scheduler: SchedulerResult;
  taskLookup: Record<string, ScheduleTaskInfo>;
  goals: DBGoal[];
  allTasks: DBTask[];
  weekDays: string[];
  previewDays: ScheduleDay[];
  prefs?: SchedulePrefsSummary;
  onBack: () => void;
};

type Diagnostic = SchedulerResult['task_diagnostics'][number];
type DueTask = ScheduleDay['tasks'][number];
type TaskClass = 'estimated' | 'missing' | 'context';

function duration(minutes: number) {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function dateLabel(date: string, includeYear = false) {
  return parseLocalDate(date).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', ...(includeYear ? { year: 'numeric' } : {}),
  });
}

function hourLabel(hour: number) {
  const whole = Math.floor(hour);
  const minutes = Math.round((hour - whole) * 60);
  return new Date(2000, 0, 1, whole, minutes).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: minutes ? '2-digit' : undefined,
  });
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function contextReason(task: DBTask | undefined, parentIds: Set<string>) {
  if (!task) return 'Not included in the automatic planner';
  if (parentIds.has(task.id)) return 'Parent/container—its incomplete child tasks are counted instead';
  if (task.kind === 'critical_path') return 'Critical-path context—not scheduled as a separate work block';
  if (task.scheduling_enabled === false) return 'Automatic scheduling is disabled for this task';
  return 'Context-only task—not counted as separate work';
}

function CountPill({ count, label, tone }: { count: number; label: string; tone: 'blue' | 'amber' | 'slate' | 'red' }) {
  const cls = {
    blue: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
    red: 'border-red-200 bg-red-50 text-red-700',
  }[tone];
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{count} {label}</span>;
}

function Metric({ label, value, note, tone = 'slate' }: { label: string; value: string; note: string; tone?: 'slate' | 'red' | 'amber' | 'indigo' }) {
  const cls = {
    slate: 'border-slate-200 bg-white', red: 'border-red-200 bg-red-50/60',
    amber: 'border-amber-200 bg-amber-50/60', indigo: 'border-indigo-200 bg-indigo-50/60',
  }[tone];
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

export function FeasibilityReport({
  scheduler, taskLookup, goals, allTasks, weekDays, previewDays, prefs, onBack,
}: Props) {
  const diagnostics = scheduler.task_diagnostics ?? [];
  const capacityDays = scheduler.capacity_days ?? scheduler.day_assignments;
  const diagnosticById = useMemo(() => new Map(diagnostics.map(item => [item.task_id, item])), [diagnostics]);
  const goalById = useMemo(() => new Map(goals.map(goal => [goal.id, goal])), [goals]);
  const taskById = useMemo(() => new Map(allTasks.map(task => [task.id, task])), [allTasks]);
  const parentIds = useMemo(() => new Set(allTasks.map(task => task.parent_task_id).filter((id): id is string => Boolean(id))), [allTasks]);
  const previewByDate = useMemo(() => new Map(previewDays.map(day => [day.date, day])), [previewDays]);
  const capacityByDate = useMemo(() => new Map(capacityDays.map(day => [day.date, day])), [capacityDays]);
  const horizonStart = capacityDays[0]?.date ?? weekDays[0] ?? '';

  const classify = (task: DueTask): TaskClass => {
    const diagnostic = diagnosticById.get(task.id);
    if (diagnostic?.outcome === 'unestimated') return 'missing';
    if (diagnostic) return 'estimated';
    return 'context';
  };

  const weekRows = useMemo(() => weekDays.map(date => {
    const day = previewByDate.get(date);
    const dueTasks = day?.tasks ?? [];
    const estimated = dueTasks.filter(task => classify(task) === 'estimated');
    const missing = dueTasks.filter(task => classify(task) === 'missing');
    const context = dueTasks.filter(task => classify(task) === 'context');
    const knownMinutes = estimated.reduce((sum, task) => sum + (diagnosticById.get(task.id)?.required_minutes ?? 0), 0);
    const failures = estimated.filter(task => diagnosticById.get(task.id)?.outcome === 'overflow');
    return { date, dueTasks, estimated, missing, context, knownMinutes, failures, capacity: capacityByDate.get(date) };
  }), [capacityByDate, diagnosticById, previewByDate, weekDays]);

  const weekDue = weekRows.reduce((sum, day) => sum + day.dueTasks.length, 0);
  const weekEstimated = weekRows.reduce((sum, day) => sum + day.estimated.length, 0);
  const weekMissing = weekRows.reduce((sum, day) => sum + day.missing.length, 0);
  const weekContext = weekRows.reduce((sum, day) => sum + day.context.length, 0);
  const weekKnownMinutes = weekRows.reduce((sum, day) => sum + day.knownMinutes, 0);
  const weekCapacity = weekRows.reduce((sum, day) => sum + (day.capacity?.available_minutes ?? 0), 0);
  const overflow = diagnostics.filter(item => item.outcome === 'overflow');

  const goalRows = useMemo(() => {
    const map = new Map<string, DueTask[]>();
    for (const row of weekRows) {
      for (const task of row.dueTasks) {
        const key = task.goal_id ?? 'standalone';
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(task);
      }
    }
    return [...map.entries()].map(([goalId, tasks]) => {
      const estimated = tasks.filter(task => classify(task) === 'estimated');
      const missing = tasks.filter(task => classify(task) === 'missing');
      const context = tasks.filter(task => classify(task) === 'context');
      const knownMinutes = estimated.reduce((sum, task) => sum + (diagnosticById.get(task.id)?.required_minutes ?? 0), 0);
      const failures = estimated.filter(task => diagnosticById.get(task.id)?.outcome === 'overflow').length;
      const byDay = weekRows
        .map(row => ({ date: row.date, tasks: tasks.filter(task => task.due_date === row.date) }))
        .filter(row => row.tasks.length > 0);
      return { goalId, title: goalById.get(goalId)?.title ?? 'Standalone tasks', tasks, estimated, missing, context, knownMinutes, failures, byDay };
    }).sort((a, b) => b.failures - a.failures || b.tasks.length - a.tasks.length);
  }, [diagnosticById, goalById, weekRows]);

  const firstFailure = overflow.slice().sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  const firstFailureTask = firstFailure ? taskLookup[firstFailure.task_id] : undefined;
  const firstFailureDay = firstFailure?.due_date ? weekRows.find(row => row.date === firstFailure.due_date) : undefined;
  const firstFailureUnknown = firstFailureDay?.missing.length ?? diagnostics.filter(item => item.outcome === 'unestimated' && item.due_date === firstFailure?.due_date).length;
  const rawDaily = Number(prefs?.daily_capacity_minutes ?? 480);
  const bufferMinutes = Math.round(rawDaily * Number(prefs?.buffer_ratio ?? 0.15));
  const effectiveDaily = Math.max(0, rawDaily - bufferMinutes);

  const renderTask = (task: DueTask) => {
    const classification = classify(task);
    const diagnostic = diagnosticById.get(task.id);
    const dbTask = taskById.get(task.id);
    const label = classification === 'estimated'
      ? `${duration(diagnostic?.required_minutes ?? 0)} remaining`
      : classification === 'missing' ? 'Missing estimate' : 'Context only';
    const cls = classification === 'estimated'
      ? diagnostic?.outcome === 'overflow' ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'
      : classification === 'missing' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600';
    return (
      <div key={task.id} className="flex flex-col gap-2 border-t border-slate-100 py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{task.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            {goalById.get(task.goal_id ?? '')?.title ?? 'No goal'}
            {classification === 'context' ? ` · ${contextReason(dbTask, parentIds)}` : ''}
          </p>
        </div>
        <span className={`shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8">
      <button onClick={onBack} className="mb-5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        <ArrowLeft size={16} /> Back to schedule
      </button>

      <header className="border-b border-slate-200 pb-6">
        <div className="flex items-center gap-2 text-red-600"><Flag size={17} /><span className="text-xs font-bold uppercase tracking-[0.14em]">Schedule explanation</span></div>
        <h1 className="mt-2 font-headline text-3xl font-bold tracking-tight text-slate-950">
          {firstFailure?.due_date ? `Why ${dateLabel(firstFailure.due_date)} does not fit` : 'Why this schedule needs attention'}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">This page starts with the selected week and uses the same due-task counts as the calendar. No parent task or missing estimate is silently mixed into the hour totals.</p>
      </header>

      {firstFailure && firstFailureTask && (
        <section className="mt-5 rounded-2xl border-2 border-red-200 bg-red-50/60 p-5">
          <div className="flex gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-red-900">The direct reason</p>
              <p className="mt-1 text-sm leading-6 text-red-800"><strong>{firstFailureTask.title}</strong> needs {duration(firstFailure.required_minutes)} before {dateLabel(firstFailure.due_date ?? firstFailure.earliest_date)}. The scheduler found only {duration(firstFailure.available_before_deadline_minutes)}, leaving {duration(firstFailure.shortfall_minutes)} unfinished.</p>
              {firstFailureUnknown > 0 && <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-sm text-amber-800">Also, {plural(firstFailureUnknown, 'other task')} due that day {firstFailureUnknown === 1 ? 'has' : 'have'} no estimate, so the real shortage may be larger.</p>}
            </div>
          </div>
        </section>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Everything due this week" value={String(weekDue)} note="Exactly the same incomplete due items shown by the calendar" />
        <Metric label="Known estimated work" value={duration(weekKnownMinutes)} note={`${plural(weekEstimated, 'schedulable leaf task')} with usable estimates`} tone="indigo" />
        <Metric label="Missing estimates" value={String(weekMissing)} note="Shown as due, but impossible to convert into hours yet" tone={weekMissing ? 'amber' : 'slate'} />
        <Metric label="Context-only items" value={String(weekContext)} note="Parents or excluded tasks shown for context, not double-counted" />
      </section>

      <section className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4">
        <div className="flex gap-3"><CircleHelp size={19} className="mt-0.5 shrink-0 text-indigo-600" /><div><p className="text-sm font-bold text-indigo-950">How the counts now work</p><p className="mt-1 text-sm leading-6 text-indigo-800"><strong>Due</strong> includes every incomplete item displayed by the calendar. It is then split into <strong>estimated</strong> work, <strong>missing estimates</strong>, and <strong>context-only</strong> parents/exclusions. Those three numbers always add back up to the due count.</p></div></div>
      </section>

      <section className="pt-9">
        <div className="mb-4 flex items-center gap-3"><CalendarDays size={21} className="text-indigo-600" /><div><h2 className="font-headline text-2xl font-bold text-slate-950">1. This week, day by day</h2><p className="mt-0.5 text-sm text-slate-500">Open a day to see every task behind its calendar due count.</p></div></div>
        <div className="space-y-3">
          {weekRows.map(row => {
            const dueCount = row.dueTasks.length;
            const isOff = !row.capacity;
            const isPast = isOff && row.date < horizonStart;
            const freeAfterPlan = row.capacity ? row.capacity.available_minutes - row.capacity.used_minutes : 0;
            return (
              <details key={row.date} open={dueCount > 0 || row.failures.length > 0} className={`group overflow-hidden rounded-2xl border bg-white ${row.failures.length ? 'border-red-300' : 'border-slate-200'}`}>
                <summary className="grid cursor-pointer list-none gap-4 p-4 hover:bg-slate-50 md:grid-cols-[180px_1fr_180px_22px] md:items-center">
                  <div><p className="text-base font-bold text-slate-900">{dateLabel(row.date)}</p><p className="mt-0.5 text-xs text-slate-400">{row.capacity ? `${duration(row.capacity.available_minutes)} usable` : isPast ? 'Past day · no remaining capacity' : 'Off day · 0h planning capacity'}</p></div>
                  <div className="flex flex-wrap gap-2">
                    <CountPill count={dueCount} label="due" tone={row.failures.length ? 'red' : 'blue'} />
                    <CountPill count={row.estimated.length} label="estimated" tone="blue" />
                    <CountPill count={row.missing.length} label="missing" tone="amber" />
                    {row.context.length > 0 && <CountPill count={row.context.length} label="context" tone="slate" />}
                  </div>
                  <div className="md:text-right"><p className="text-sm font-bold text-slate-800">{duration(row.knownMinutes)} known work due</p><p className={`mt-0.5 text-xs ${row.failures.length ? 'font-semibold text-red-600' : 'text-slate-400'}`}>{row.failures.length ? `${plural(row.failures.length, 'deadline failure')}` : row.capacity ? `${duration(Math.max(0, freeAfterPlan))} free after planner` : isPast ? 'Past day' : 'Non-work day'}</p></div>
                  <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-slate-100 bg-slate-50/40 p-4">
                  {dueCount === 0 ? <p className="text-sm text-slate-500">Nothing is due on this date. The calendar and this report both count zero.</p> : (
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="rounded-xl border border-indigo-100 bg-white p-4"><h3 className="text-sm font-bold text-indigo-800">Estimated work · {row.estimated.length}</h3><p className="mt-1 text-xs text-slate-500">{duration(row.knownMinutes)} remaining in total</p><div className="mt-3">{row.estimated.length ? row.estimated.map(renderTask) : <p className="text-sm text-slate-400">None</p>}</div></div>
                      <div className="rounded-xl border border-amber-100 bg-white p-4"><h3 className="text-sm font-bold text-amber-800">Missing estimates · {row.missing.length}</h3><p className="mt-1 text-xs text-slate-500">Due, but not included in any hour total</p><div className="mt-3">{row.missing.length ? row.missing.map(renderTask) : <p className="text-sm text-slate-400">None</p>}</div></div>
                      <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-700">Context only · {row.context.length}</h3><p className="mt-1 text-xs text-slate-500">Visible on the calendar, excluded from planner math</p><div className="mt-3">{row.context.length ? row.context.map(renderTask) : <p className="text-sm text-slate-400">None</p>}</div></div>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <section className="pt-9">
        <div className="mb-4 flex items-center gap-3"><TimerReset size={21} className="text-red-600" /><div><h2 className="font-headline text-2xl font-bold text-slate-950">2. Why each failing task misses</h2><p className="mt-0.5 text-sm text-slate-500">A day-by-day replay of the scheduler’s exact attempt.</p></div></div>
        <div className="space-y-4">
          {overflow.map(failure => {
            const task = taskLookup[failure.task_id];
            const goal = task?.goal_id ? goalById.get(task.goal_id) : undefined;
            let remaining = failure.required_minutes;
            return (
              <article key={failure.task_id} className="overflow-hidden rounded-2xl border border-red-200 bg-white">
                <div className="border-b border-red-100 bg-red-50/60 p-5"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-lg font-bold text-slate-950">{task?.title ?? failure.task_id}</p><p className="mt-1 text-sm text-slate-500">{goal?.title ?? 'No goal'} · due {failure.due_date ? dateLabel(failure.due_date, true) : 'inside the planning horizon'}</p></div><span className="self-start rounded-full bg-red-100 px-3 py-1.5 text-sm font-bold text-red-700">{duration(failure.shortfall_minutes)} short</span></div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-4"><div><p className="text-xs text-slate-500">Original estimate</p><p className="font-bold text-slate-900">{duration(task?.estimated_minutes ?? failure.required_minutes)}</p></div><div><p className="text-xs text-slate-500">Logged already</p><p className="font-bold text-slate-900">−{duration(task?.logged_minutes ?? 0)}</p></div><div><p className="text-xs text-slate-500">Calendar committed</p><p className="font-bold text-slate-900">−{duration(task?.committed_minutes ?? 0)}</p></div><div><p className="text-xs text-slate-500">Still required</p><p className="font-bold text-red-700">{duration(failure.required_minutes)}</p></div></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead><tr className="bg-slate-50 text-xs text-slate-500"><th className="px-5 py-3">Day</th><th className="px-4 py-3">Usable day capacity</th><th className="px-4 py-3">Claimed earlier</th><th className="px-4 py-3">Free for this task</th><th className="px-4 py-3">Given to task</th><th className="px-4 py-3">Still left</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {failure.days.map(day => {
                        remaining = Math.max(0, remaining - day.allocated_minutes);
                        return <tr key={day.date}><td className="px-5 py-3 font-semibold text-slate-800">{dateLabel(day.date)}</td><td className="px-4 py-3">{duration(day.capacity_minutes)}</td><td className="px-4 py-3">{duration(day.committed_before_minutes)}</td><td className="px-4 py-3">{duration(day.available_before_minutes)}</td><td className="px-4 py-3 font-semibold text-indigo-700">{duration(day.allocated_minutes)}</td><td className={`px-4 py-3 font-bold ${remaining ? 'text-red-700' : 'text-emerald-700'}`}>{duration(remaining)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500">The scheduler simulated these allocations, saw that {duration(failure.shortfall_minutes)} would remain at the deadline, and rolled the partial allocation back so it would not show a misleading “planned” task.</p>
              </article>
            );
          })}
          {!overflow.length && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800"><CheckCircle2 size={18} className="mr-2 inline" />No estimated task currently misses its deadline.</div>}
        </div>
      </section>

      <section className="pt-9">
        <div className="mb-4 flex items-center gap-3"><FolderKanban size={21} className="text-indigo-600" /><div><h2 className="font-headline text-2xl font-bold text-slate-950">3. This week by goal</h2><p className="mt-0.5 text-sm text-slate-500">The same weekly due items regrouped by goal—not counted again.</p></div></div>
        <div className="grid gap-3 lg:grid-cols-2">
          {goalRows.map(goal => (
            <article key={goal.goalId} className={`rounded-2xl border bg-white p-5 ${goal.failures ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-bold text-slate-900">{goal.title}</h3><p className="mt-1 text-sm text-slate-500">{plural(goal.tasks.length, 'item')} due this week · {duration(goal.knownMinutes)} known work</p></div><Target size={18} className={goal.failures ? 'text-red-500' : 'text-slate-300'} /></div>
              <div className="mt-3 flex flex-wrap gap-2"><CountPill count={goal.estimated.length} label="estimated" tone="blue" /><CountPill count={goal.missing.length} label="missing" tone="amber" />{goal.context.length > 0 && <CountPill count={goal.context.length} label="context" tone="slate" />}{goal.failures > 0 && <CountPill count={goal.failures} label="failure" tone="red" />}</div>
              <div className="mt-4 space-y-2">{goal.byDay.map(day => <div key={day.date} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-semibold text-slate-700">{dateLabel(day.date)}</span><span className="text-slate-500">{plural(day.tasks.length, 'due item')}</span></div>)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="pt-9">
        <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 hover:bg-slate-50"><div className="flex items-center gap-3"><Clock3 size={20} className="text-indigo-600" /><div><h2 className="text-base font-bold text-slate-900">Capacity settings and this week’s hours</h2><p className="mt-0.5 text-sm text-slate-500">Open only when you need to audit the daily capacity formula.</p></div></div><ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" /></summary>
          <div className="border-t border-slate-100 p-5">
            <div className="grid gap-3 sm:grid-cols-4"><Metric label="Work window" value={`${hourLabel(Number(prefs?.work_start ?? 9))}–${hourLabel(Number(prefs?.work_end ?? 18))}`} note="Configured working range" /><Metric label="Daily setting" value={duration(rawDaily)} note="Maximum before safety buffer" /><Metric label="Safety buffer" value={`−${duration(bufferMinutes)}`} note="Reserved, not plan-filled" /><Metric label="Normal focus cap" value={duration(effectiveDaily)} note="Before meetings and blocks" tone="indigo" /></div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="bg-slate-50 text-xs text-slate-500"><th className="px-4 py-3">Day</th><th className="px-4 py-3">Usable</th><th className="px-4 py-3">Planner assigned</th><th className="px-4 py-3">Free after planner</th><th className="px-4 py-3">Due items</th></tr></thead><tbody className="divide-y divide-slate-100">{weekRows.map(day => <tr key={day.date}><td className="px-4 py-3 font-semibold text-slate-800">{dateLabel(day.date)}</td><td className="px-4 py-3">{day.capacity ? duration(day.capacity.available_minutes) : day.date < horizonStart ? 'Past day' : 'Off day'}</td><td className="px-4 py-3">{duration(day.capacity?.used_minutes ?? 0)}</td><td className="px-4 py-3">{duration(day.capacity ? Math.max(0, day.capacity.available_minutes - day.capacity.used_minutes) : 0)}</td><td className="px-4 py-3 font-semibold">{day.dueTasks.length}</td></tr>)}</tbody></table></div>
            <p className="mt-3 text-sm text-slate-500">Selected-week usable capacity: <strong className="text-slate-800">{duration(weekCapacity)}</strong>. Past and non-work days contribute zero future planning time.</p>
          </div>
        </details>
      </section>
    </div>
  );
}
