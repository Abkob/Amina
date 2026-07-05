import { useMemo, useState } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  Sparkles, Calendar, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  GripVertical, Check, Eye, EyeOff, BarChart2, PanelLeftOpen, Plus,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  useSchedulePreview, useAllTasks, useInvalidate, useEvents, useAllEventTaskLinks,
  useAllMeetings, useSchedulePrefs, useGoals,
  type ScheduleDay, type SchedulerResult, type ScheduleTaskInfo, type DayAssignment, type DBEventTaskLinkFull,
} from '../api/hooks';
import { apiPost, apiPatch } from '../utils/apiFetch';
import type { DBEvent, DBTask } from '../db/schema';
import {
  addDays, clampHour, dateToWeekPos, eventDate, fmtTimeRange, fmtYMD,
  mondayOf, parseLocalDate, snapHour,
} from '../utils/calendar';
import { autofillFromTask } from '../utils/eventAutofill';
import { suggestionsFromPlan } from '../utils/planAssist';
import { TaskTreeDrawer } from './schedule/TaskTreeDrawer';
import { PlanAssistPanel } from './schedule/PlanAssistPanel';
import {
  WeekTimeGrid, GRID_START_HOUR, GRID_END_HOUR, HOUR_PX,
  type CalendarMeeting, type PlacedEvent,
} from './schedule/WeekTimeGrid';
import { EventComposer, type ComposerSeed } from './schedule/EventComposer';
import { GanttView } from './GanttView';

/**
 * Schedule workspace, Google-Calendar style: a week time-grid carrying
 * calendar blocks (linkable to tasks — names and durations autofill) and
 * meetings, an all-day row for day-level task scheduling (drag between days,
 * or from the backlog), and the planning insights — feasibility, capacity,
 * week load, attention — in plain language above the grid.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

interface DraftAssignment {
  task_id: string;
  title: string;
  start_date: string;
  current_start: string | null;
  days: string[];
}
interface Draft {
  id: string;
  name: string;
  description: string;
  stats: { status: string; gap_minutes: number; tasks_scheduled: number; changes: number; busiest_day_minutes: number; days_used: number };
  assignments: DraftAssignment[];
  day_assignments: DayAssignment[];
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  feasible:   { label: 'Feasible',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  tight:      { label: 'Tight',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  risky:      { label: 'Risky',      cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  impossible: { label: 'Impossible', cls: 'bg-red-50 text-red-700 border-red-200' },
};

function fmtMins(mins: number): string {
  if (Math.abs(mins) < 60) return `${mins}m`;
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${mins < 0 ? '-' : ''}${h}h${m ? ` ${m}m` : ''}`;
}

function dayLabel(dateStr: string): { dow: string; dom: string; isToday: boolean } {
  const d = parseLocalDate(dateStr);
  const today = new Date();
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
    dom: String(d.getDate()),
    isToday: d.toDateString() === today.toDateString(),
  };
}

function fmtWeekRange(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  const end = parseLocalDate(addDays(weekStart, 6));
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = end.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
}

// ── Draggable task chip ───────────────────────────────────────────────────────

function TaskChip({ task, ghost = false }: { task: Pick<DBTask, 'id' | 'title' | 'estimated_minutes' | 'priority'>; ghost?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: ghost });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-1 text-[10px] rounded px-1.5 py-1 mb-1 border select-none
        ${ghost
          ? 'bg-indigo-50/60 text-indigo-400 border-dashed border-indigo-300'
          : 'bg-[#EEF2FF] text-[#4648d4] border-[#c0c1ff]/40 cursor-grab active:cursor-grabbing hover:brightness-95'}
        ${isDragging ? 'opacity-30' : ''}`}
      title={ghost ? `${task.title} (draft preview)` : `${task.title} — drag to a day, onto a time slot, or back to the backlog`}
    >
      {!ghost && <GripVertical size={9} className="shrink-0 opacity-50" />}
      <span className="truncate flex-1">{task.title}</span>
      {task.estimated_minutes ? <span className="shrink-0 opacity-60">{fmtMins(task.estimated_minutes)}</span> : null}
    </div>
  );
}

// ── All-day cell (day-level scheduling target) ────────────────────────────────

function AllDayCell({ date, day, startTasks, ghostIds, taskLookup, isBlocked }: {
  date: string;
  day: ScheduleDay | undefined;
  startTasks: DBTask[];
  ghostIds: string[];
  taskLookup: Record<string, ScheduleTaskInfo>;
  /** true when the task already has a calendar block on this date */
  isBlocked: (taskId: string) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  const [dueOpen, setDueOpen] = useState(false);
  const dueTasks = day?.tasks ?? [];
  const deadlines = day?.deadline_titles ?? [];
  const dueSummary = [
    dueTasks.length ? `${dueTasks.length} due` : null,
    deadlines.length ? `${deadlines.length} deadline${deadlines.length !== 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      ref={setNodeRef}
      className={`h-full max-h-36 overflow-y-auto px-1 py-1 transition-colors ${isOver ? 'bg-indigo-50/70' : ''}`}
    >
      {day?.override && (
        <p className="mb-0.5 truncate font-mono text-[8px] text-amber-600" title={day.override.note ?? undefined}>
          ⚠ {fmtMins(day.override.available_minutes)} available
        </p>
      )}
      {(dueTasks.length > 0 || deadlines.length > 0) && (
        <>
          <button
            onClick={() => setDueOpen(v => !v)}
            className="mb-1 flex w-full items-center gap-1 rounded border border-red-100 bg-red-50 px-1.5 py-0.5 text-left hover:bg-red-100/70"
            title={[...dueTasks.map(t => `⚑ ${t.title}`), ...deadlines.map(d => `◆ ${d}`)].join('\n')}
          >
            <span className="min-w-0 flex-1 truncate text-[9px] font-bold text-red-600">⚑ {dueSummary}</span>
            <ChevronDown size={9} className={`shrink-0 text-red-400 transition-transform ${dueOpen ? 'rotate-180' : ''}`} />
          </button>
          {dueOpen && (
            <div className="mb-1 space-y-0.5">
              {dueTasks.map(t => (
                <p
                  key={`due-${t.id}`}
                  className={`truncate pl-1.5 text-[9px] leading-tight ${isBlocked(t.id) ? 'text-gray-400' : 'text-red-600/90'}`}
                  title={isBlocked(t.id) ? `${t.title} — already has time blocked this day` : t.title}
                >
                  {isBlocked(t.id) ? '✓ ' : ''}{t.title}
                </p>
              ))}
              {deadlines.map(d => (
                <p key={d} className="truncate pl-1.5 text-[9px] leading-tight text-orange-600" title={`Goal deadline: ${d}`}>◆ {d}</p>
              ))}
            </div>
          )}
        </>
      )}
      {startTasks.map(t => <TaskChip key={t.id} task={t} />)}
      {ghostIds.map(id => (
        <TaskChip key={`ghost-${id}`} ghost task={{ id, title: taskLookup[id]?.title ?? id, estimated_minutes: taskLookup[id]?.estimated_minutes ?? null, priority: 'medium' }} />
      ))}
    </div>
  );
}

// ── Drafts panel ──────────────────────────────────────────────────────────────

function DraftsPanel({ preview, onPreview, onApplied }: {
  preview: Draft | null;
  onPreview: (d: Draft | null) => void;
  onApplied: () => void;
}) {
  const { triggerToast } = useAppStore();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);

  const generate = useMutation({
    mutationFn: () => apiPost<{ drafts: Draft[] }>('/api/ai/schedule/drafts', { horizon_days: 14 }),
    onSuccess: r => {
      setDrafts(r.drafts);
      onPreview(null);
      if (r.drafts.every(d => d.assignments.length === 0)) {
        triggerToast('No schedulable changes — tasks may need estimates, or already match every plan.', 'info');
      }
    },
    onError: (e: Error) => triggerToast(e.message, 'error'),
  });

  const apply = useMutation({
    mutationFn: (d: Draft) => apiPost<{ updated: number }>('/api/ai/schedule/drafts/apply', {
      assignments: d.assignments.map(a => ({ task_id: a.task_id, start_date: a.start_date })),
    }),
    onSuccess: (r, d) => {
      triggerToast(`"${d.name}" applied — ${r.updated} task${r.updated !== 1 ? 's' : ''} scheduled.`, 'success');
      setDrafts(null);
      onPreview(null);
      onApplied();
    },
    onError: (e: Error) => triggerToast(e.message, 'error'),
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
          <Sparkles size={12} className="text-[#4648d4]" /> AI drafts
        </p>
        <button
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="text-[10px] font-mono uppercase text-[#4648d4] hover:underline disabled:opacity-40 flex items-center gap-1"
        >
          {generate.isPending ? <RefreshCw size={10} className="animate-spin" /> : null}
          {drafts ? 'Regenerate' : 'Generate 3 plans'}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mb-2">
        Three ways to lay out the same work. Preview paints it on the days; nothing changes until you use one.
      </p>
      {!drafts && !generate.isPending && (
        <p className="text-[10px] text-gray-300 font-mono">no drafts yet</p>
      )}
      <div className="space-y-2">
        {(drafts ?? []).map(d => {
          const isPreviewing = preview?.id === d.id;
          const s = STATUS_STYLE[d.stats.status] ?? STATUS_STYLE.feasible;
          return (
            <div key={d.id} className={`border rounded-lg p-2.5 ${isPreviewing ? 'border-indigo-400 ring-1 ring-indigo-300/50 bg-indigo-50/40' : 'border-gray-150'}`}>
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-bold text-gray-800">{d.name}</span>
                <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{d.description}</p>
              <p className="text-[9px] font-mono text-gray-400 mt-1">
                {d.stats.changes} change{d.stats.changes !== 1 ? 's' : ''} · busiest day {fmtMins(d.stats.busiest_day_minutes)} · {d.stats.days_used} day{d.stats.days_used !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2 mt-1.5">
                <button
                  onClick={() => onPreview(isPreviewing ? null : d)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border ${isPreviewing ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {isPreviewing ? <EyeOff size={10} /> : <Eye size={10} />}
                  {isPreviewing ? 'Hide preview' : 'Preview'}
                </button>
                <button
                  onClick={() => apply.mutate(d)}
                  disabled={apply.isPending || d.assignments.length === 0}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-[#4648d4] text-white hover:opacity-90 disabled:opacity-40"
                >
                  <Check size={10} /> Use this plan
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Insights ──────────────────────────────────────────────────────────────────

function safePct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function ScheduleInsights({ scheduler, weekDays, assignmentsByDate, startsByDate, backlog, unestimated, rollups }: {
  scheduler?: SchedulerResult;
  weekDays: string[];
  assignmentsByDate: Map<string, DayAssignment>;
  startsByDate: Map<string, DBTask[]>;
  backlog: DBTask[];
  unestimated: DBTask[];
  rollups: DBTask[];
}) {
  const [showDetail, setShowDetail] = useState(false);
  const utilisation = scheduler ? safePct(scheduler.total_required_minutes, scheduler.total_available_minutes) : 0;
  const weekStats = weekDays.map(date => {
    const assignment = assignmentsByDate.get(date);
    const manualMinutes = (startsByDate.get(date) ?? []).reduce((sum, task) => sum + (task.estimated_minutes ?? 0), 0);
    const used = Math.max(manualMinutes, assignment?.used_minutes ?? 0);
    const available = assignment?.available_minutes ?? null;
    return { date, used, available };
  });
  const weekUsed = weekStats.reduce((sum, d) => sum + d.used, 0);
  const busiest = weekStats.reduce((max, d) => (d.used > max.used ? d : max), weekStats[0] ?? { date: '', used: 0, available: null });
  const busiestLabel = busiest.date ? dayLabel(busiest.date).dow : '—';
  const overflowCount = scheduler?.tasks_overflow.length ?? 0;
  const tone = !scheduler ? 'neutral' : scheduler.status === 'feasible' ? 'good' : scheduler.status === 'impossible' ? 'risk' : 'watch';
  const gap = scheduler?.gap_minutes ?? 0;

  const attention = [
    overflowCount > 0 ? `${overflowCount} task${overflowCount !== 1 ? 's' : ''} won't fit before their deadlines — move dates or trim estimates` : null,
    unestimated.length > 0 ? `${unestimated.length} task${unestimated.length !== 1 ? 's' : ''} need a time estimate before they can be planned` : null,
    backlog.length > 0 ? `${backlog.length} ready task${backlog.length !== 1 ? 's aren’t' : ' isn’t'} on a day yet — drag them in from the backlog` : null,
    rollups.length > 0 ? `${rollups.length} parent or long-term task${rollups.length !== 1 ? 's' : ''} stay out of auto-planning (their subtasks are planned instead)` : null,
  ].filter((item): item is string => Boolean(item));

  const dotCls =
    tone === 'good' ? 'bg-emerald-500' :
    tone === 'risk' ? 'bg-red-500' :
    tone === 'watch' ? 'bg-amber-500' : 'bg-gray-300';
  const headline =
    !scheduler ? 'Checking your plan…'
    : gap >= 0 ? `This plan fits — ${fmtMins(gap)} to spare`
    : `Too much work — over by ${fmtMins(-gap)}`;

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[11px] text-gray-500">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls}`} />
        <span className={`font-semibold ${tone === 'risk' ? 'text-red-700' : tone === 'watch' ? 'text-amber-700' : 'text-gray-800'}`}>
          {headline}
        </span>
        {scheduler && <span className="text-gray-300">·</span>}
        {scheduler && <span>{utilisation}% of your free time is booked</span>}
        <span className="text-gray-300">·</span>
        <span>{weekUsed > 0 ? `${fmtMins(weekUsed)} planned this week (${busiestLabel} fullest)` : 'nothing planned on these days yet'}</span>
        <span className="text-gray-300">·</span>
        <span>{backlog.length} task{backlog.length !== 1 ? 's' : ''} waiting for a day</span>
        {unestimated.length > 0 && (
          <>
            <span className="text-gray-300">·</span>
            <span className="text-amber-600">{unestimated.length} need estimates</span>
          </>
        )}
        <button
          onClick={() => setShowDetail(v => !v)}
          className="ml-auto flex shrink-0 items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-widest text-gray-400 hover:text-gray-600"
        >
          <ChevronDown size={11} className={`transition-transform ${showDetail ? '' : '-rotate-90'}`} />
          Details
        </button>
      </div>

      {showDetail && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="rounded-xl border border-gray-200 bg-white p-3 lg:col-span-8">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Week Load</p>
              <p className="text-[9px] font-mono text-gray-400">how full each day is</p>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {weekStats.map(({ date, used, available }) => {
                const fill = available ? safePct(used, available) : used > 0 ? 100 : 0;
                const overloaded = available !== null && used > available;
                const lbl = dayLabel(date);
                return (
                  <div key={date} className="min-w-0">
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <span className={`text-[9px] font-mono ${lbl.isToday ? 'font-bold text-[#4648d4]' : 'text-gray-400'}`}>{lbl.dow}</span>
                      <span className="text-[8px] text-gray-400">{fmtMins(used)}</span>
                    </div>
                    <div className="flex h-14 items-end overflow-hidden rounded-md bg-gray-100">
                      <div
                        className={`mt-auto w-full transition-all ${overloaded ? 'bg-red-400' : fill > 85 ? 'bg-amber-400' : 'bg-[#4648d4]'}`}
                        style={{ height: `${Math.max(4, fill)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-3 lg:col-span-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Attention</p>
            {attention.length === 0 ? (
              <p className="text-xs text-emerald-600">No schedule blockers in view.</p>
            ) : (
              <div className="space-y-1.5">
                {attention.slice(0, 5).map(item => (
                  <div key={item} className="flex gap-2 rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] text-gray-700">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function ScheduleView({ initialPage = 'plan' }: { initialPage?: 'plan' | 'timeline' } = {}) {
  const { triggerToast } = useAppStore();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const { data: previewData, isLoading } = useSchedulePreview();
  const { data: allTasks = [] } = useAllTasks();
  const { data: allEvents = [] } = useEvents();
  const { data: allLinks = [] } = useAllEventTaskLinks();
  const { data: allMeetings = [] } = useAllMeetings();
  const { data: goals = [] } = useGoals();
  const { data: prefs } = useSchedulePrefs();
  const [weekOffset, setWeekOffset] = useState(0);
  const [draftPreview, setDraftPreview] = useState<Draft | null>(null);
  const [dragTask, setDragTask] = useState<DBTask | null>(null);
  const [innerPage, setInnerPage] = useState<'plan' | 'timeline'>(initialPage);
  const [composer, setComposer] = useState<ComposerSeed | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const todayStr = fmtYMD(new Date());
  const weekStart = addDays(mondayOf(todayStr), weekOffset * 7);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const scheduler = previewData?.scheduler_result;
  const taskLookup = previewData?.task_lookup ?? {};
  const previewByDate = useMemo(
    () => new Map<string, ScheduleDay>((previewData?.days ?? []).map(d => [d.date, d])),
    [previewData],
  );
  const assignmentsByDate = useMemo(
    () => new Map<string, DayAssignment>((scheduler?.day_assignments ?? []).map(a => [a.date, a])),
    [scheduler],
  );

  const childIds = useMemo(
    () => new Set(allTasks.map(t => t.parent_task_id).filter((id): id is string => Boolean(id))),
    [allTasks],
  );
  const isDone = (task: DBTask) => task.completed || task.status === 'done';
  const scheduleWork = useMemo(
    () => allTasks.filter(t =>
      !isDone(t)
      && t.kind !== 'critical_path'
      && t.scheduling_enabled !== false
      && !childIds.has(t.id)
    ),
    [allTasks, childIds],
  );
  const rollupTasks = useMemo(
    () => allTasks.filter(t =>
      !isDone(t)
      && (childIds.has(t.id) || t.scheduling_enabled === false || t.kind === 'critical_path')
    ),
    [allTasks, childIds],
  );
  const startsByDate = useMemo(() => {
    const m = new Map<string, DBTask[]>();
    for (const t of scheduleWork) {
      if (!t.start_date) continue;
      if (!m.has(t.start_date)) m.set(t.start_date, []);
      m.get(t.start_date)!.push(t);
    }
    return m;
  }, [scheduleWork]);
  const backlog = useMemo(() => scheduleWork.filter(t => !t.start_date && (t.estimated_minutes ?? 0) > 0), [scheduleWork]);
  const unestimated = useMemo(() => scheduleWork.filter(t => !(t.estimated_minutes! > 0)), [scheduleWork]);

  // Calendar blocks placed in this week. Only dated blocks render — the old
  // "no date = repeats every week" rule is gone (it made seeded demo events
  // stamp themselves onto every week forever).
  const placedEvents: PlacedEvent[] = useMemo(() =>
    allEvents
      .map(ev => ({ event: ev, date: eventDate(ev) }))
      .filter((p): p is PlacedEvent => p.date !== null && p.date >= weekStart && p.date <= weekDays[6]),
    [allEvents, weekStart, weekDays],
  );

  const linksByEvent = useMemo(() => {
    const m = new Map<string, DBEventTaskLinkFull[]>();
    for (const l of allLinks) {
      if (!m.has(l.event_id)) m.set(l.event_id, []);
      m.get(l.event_id)!.push(l);
    }
    return m;
  }, [allLinks]);

  const weekMeetings: CalendarMeeting[] = useMemo(() =>
    allMeetings
      .map(m => {
        const dt = new Date(m.scheduled_at);
        if (Number.isNaN(dt.getTime())) return null;
        return {
          id: m.id,
          title: m.title,
          date: fmtYMD(dt),
          startHour: dt.getHours() + dt.getMinutes() / 60,
          durationHours: Math.max(0.25, (m.duration_minutes ?? 60) / 60),
        };
      })
      .filter((m): m is CalendarMeeting => m !== null && m.date >= weekStart && m.date <= weekDays[6]),
    [allMeetings, weekStart, weekDays],
  );

  const workDays: number[] = useMemo(() => {
    try {
      const parsed = JSON.parse(prefs?.work_days ?? '[1,2,3,4,5]');
      return Array.isArray(parsed) ? parsed : [1, 2, 3, 4, 5];
    } catch { return [1, 2, 3, 4, 5]; }
  }, [prefs]);

  // One task = one presence: a task with a linked block on a date doesn't
  // also show its all-day chip there.
  const blockDates = useMemo(() => {
    const s = new Set<string>();
    for (const p of placedEvents) {
      for (const link of linksByEvent.get(p.event.id) ?? []) s.add(`${link.task_id}|${p.date}`);
    }
    return s;
  }, [placedEvents, linksByEvent]);

  // The auto-planner's opinion as explicit suggestion cards (never painted).
  const suggestions = useMemo(
    () => suggestionsFromPlan(scheduler?.day_assignments ?? [], allTasks),
    [scheduler, allTasks],
  );

  const draggableIds = useMemo(() => new Set(scheduleWork.map(t => t.id)), [scheduleWork]);
  const scheduledDates = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of scheduleWork) if (t.start_date) m.set(t.id, t.start_date);
    return m;
  }, [scheduleWork]);

  // Ghost chips per day while previewing a draft
  const ghostsByDate = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!draftPreview) return m;
    for (const a of draftPreview.assignments) {
      if (!m.has(a.start_date)) m.set(a.start_date, []);
      m.get(a.start_date)!.push(a.task_id);
    }
    return m;
  }, [draftPreview]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  const move = useMutation({
    mutationFn: ({ taskId, date }: { taskId: string; date: string | null }) =>
      apiPatch(`/api/tasks/${taskId}`, { start_date: date }),
    onSuccess: (_r, { date }) => {
      invalidate.allTasks();
      invalidate.schedulePreview();
      triggerToast(date ? `Scheduled for ${date}.` : 'Moved back to backlog.', 'success');
    },
    onError: (e: Error) => triggerToast(e.message, 'error'),
  });

  /** Apply every Plan-assist suggestion in one go. */
  const placeAllSuggestions = async () => {
    try {
      await Promise.all(suggestions.map(s => apiPatch(`/api/tasks/${s.taskId}`, { start_date: s.date })));
      invalidate.allTasks();
      invalidate.schedulePreview();
      triggerToast(`Placed ${suggestions.length} task${suggestions.length !== 1 ? 's' : ''} on their suggested days.`, 'success');
    } catch (e) {
      triggerToast((e as Error).message || 'Could not place all suggestions.', 'error');
    }
  };

  /** Drop a task on a time slot: open the composer pre-linked and autofilled,
   *  so the one question left is how many hours to spend. */
  const scheduleTaskAsBlock = (task: DBTask, date: string, hour: number) => {
    const fill = autofillFromTask({ title: task.title, estimated_minutes: task.estimated_minutes }, task.actual_minutes ?? 0);
    setComposer({
      mode: 'create',
      date,
      startHour: hour,
      durationHours: Math.max(0.5, Math.min(fill.duration_hours, GRID_END_HOUR - hour)),
      linkedTaskId: task.id,
      syncStartDate: true,
    });
  };

  const moveEvent = async (ev: DBEvent, next: { date: string; start_hour: number }) => {
    const { week_start, day_index } = dateToWeekPos(next.date);
    try {
      await apiPatch(`/api/events/${ev.id}`, {
        day_index,
        start_hour: next.start_hour,
        time_str: fmtTimeRange(next.start_hour, ev.duration_hours),
        // Weekly repeaters keep repeating; dated blocks follow the drop target.
        ...(ev.week_start ? { week_start } : {}),
      });
    } catch (e) {
      triggerToast((e as Error).message || 'Could not move the block.', 'error');
    }
  };

  const resizeEvent = async (ev: DBEvent, durationHours: number) => {
    try {
      await apiPatch(`/api/events/${ev.id}`, {
        duration_hours: durationHours,
        time_str: fmtTimeRange(ev.start_hour, durationHours),
      });
    } catch (e) {
      triggerToast((e as Error).message || 'Could not resize the block.', 'error');
    }
  };

  // ── Drag & drop (task chips) ───────────────────────────────────────────────

  const onDragStart = (e: DragStartEvent) => {
    setDragTask(scheduleWork.find(t => t.id === e.active.id) ?? null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragTask(null);
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const taskId = String(e.active.id);
    const task = scheduleWork.find(t => t.id === taskId);
    if (!task) return;
    if (overId === 'backlog') {
      if (task.start_date) move.mutate({ taskId, date: null });
    } else if (overId.startsWith('day:')) {
      const date = overId.slice(4);
      if (task.start_date !== date) move.mutate({ taskId, date });
    } else if (overId.startsWith('slot:')) {
      const date = overId.slice(5);
      const overTop = e.over!.rect.top;
      const dragTop = e.active.rect.current.translated?.top ?? overTop;
      const rawHour = GRID_START_HOUR + (dragTop - overTop) / HOUR_PX;
      const hour = clampHour(snapHour(rawHour, 30), GRID_START_HOUR, GRID_END_HOUR - 0.5);
      scheduleTaskAsBlock(task, date, hour);
    }
  };

  // ── Composer openers ────────────────────────────────────────────────────────

  const openCreate = (date?: string, hour?: number) => {
    const now = new Date();
    setComposer({
      mode: 'create',
      date: date ?? (weekDays.includes(todayStr) ? todayStr : weekDays[0]),
      startHour: hour ?? clampHour(now.getHours() + 1, GRID_START_HOUR, GRID_END_HOUR - 1),
      durationHours: 1,
    });
  };

  const openEdit = (ev: DBEvent) => {
    const link = (linksByEvent.get(ev.id) ?? [])[0];
    setComposer({
      mode: 'edit',
      event: ev,
      date: eventDate(ev) ?? addDays(weekStart, ((ev.day_index % 7) + 7) % 7),
      startHour: ev.start_hour,
      durationHours: ev.duration_hours,
      linkId: link?.id,
      linkedTaskId: link?.task_id,
    });
  };

  const statusInfo = scheduler ? (STATUS_STYLE[scheduler.status] ?? STATUS_STYLE.feasible) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="mx-auto w-full max-w-[1480px] px-4 py-5 md:px-8 animate-fade-in">
        {/* Header */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-headline text-2xl font-bold text-black flex items-center gap-2">
              <Calendar size={20} /> Schedule
            </h2>
            <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mt-1">
              Your week, hour by hour — blocks link to tasks and fill themselves in
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusInfo && scheduler && (
              <span className={`text-[10px] font-mono uppercase font-bold px-2.5 py-1 rounded-full border ${statusInfo.cls}`}>
                {statusInfo.label}
                {scheduler.gap_minutes !== 0 && ` · ${scheduler.gap_minutes > 0 ? '+' : ''}${fmtMins(scheduler.gap_minutes)}`}
              </span>
            )}
            {(scheduler?.unestimated_task_ids.length ?? 0) > 0 && (
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
                <AlertTriangle size={10} /> {scheduler!.unestimated_task_ids.length} unestimated
              </span>
            )}

            <div className="flex items-center rounded-lg bg-gray-100 p-0.5">
              <button
                onClick={() => setInnerPage('plan')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-bold transition-all ${
                  innerPage === 'plan' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Calendar size={12} /> Week
              </button>
              <button
                onClick={() => setInnerPage('timeline')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-bold transition-all ${
                  innerPage === 'timeline' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <BarChart2 size={12} /> Timeline
              </button>
            </div>

            {innerPage === 'plan' && (
              <>
                <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-[#f8f9fa] p-0.5">
                  <button onClick={() => setWeekOffset(o => Math.max(-8, o - 1))} className="rounded p-1.5 text-gray-600 hover:bg-gray-100" title="Previous week">
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setWeekOffset(0)}
                    disabled={weekOffset === 0}
                    className="rounded px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                  >
                    Today
                  </button>
                  <button onClick={() => setWeekOffset(o => Math.min(8, o + 1))} className="rounded p-1.5 text-gray-600 hover:bg-gray-100" title="Next week">
                    <ChevronRight size={14} />
                  </button>
                </div>
                <span className="font-headline text-sm font-bold text-gray-700">{fmtWeekRange(weekStart)}</span>
                <button
                  onClick={() => openCreate()}
                  className="flex items-center gap-1.5 rounded-lg bg-[#4648d4] px-3 py-2 font-mono text-[10px] font-bold uppercase text-white shadow-sm hover:opacity-90"
                >
                  <Plus size={12} /> Create
                </button>
              </>
            )}
          </div>
        </div>

        {innerPage === 'plan' ? (
          <>
            <ScheduleInsights
              scheduler={scheduler}
              weekDays={weekDays}
              assignmentsByDate={assignmentsByDate}
              startsByDate={startsByDate}
              backlog={backlog}
              unestimated={unestimated}
              rollups={rollupTasks}
            />

            <div className={`grid grid-cols-1 items-start gap-4 ${drawerOpen ? 'xl:grid-cols-[240px_minmax(0,1fr)_280px]' : 'xl:grid-cols-[minmax(0,1fr)_280px]'}`}>
              {drawerOpen && (
                <TaskTreeDrawer
                  tasks={allTasks}
                  goals={goals}
                  draggableIds={draggableIds}
                  scheduledDates={scheduledDates}
                  onCollapse={() => setDrawerOpen(false)}
                />
              )}

              <div className="min-w-0">
                {isLoading && <p className="mb-2 font-mono text-xs text-gray-400">Loading schedule…</p>}
                <WeekTimeGrid
                  days={weekDays}
                  events={placedEvents}
                  meetings={weekMeetings}
                  linksByEvent={linksByEvent}
                  workStart={prefs?.work_start ?? 9}
                  workEnd={prefs?.work_end ?? 18}
                  workDays={workDays}
                  renderAllDayCell={date => (
                    <AllDayCell
                      date={date}
                      day={previewByDate.get(date)}
                      startTasks={(startsByDate.get(date) ?? []).filter(t => !blockDates.has(`${t.id}|${date}`))}
                      ghostIds={ghostsByDate.get(date) ?? []}
                      taskLookup={taskLookup}
                      isBlocked={taskId => blockDates.has(`${taskId}|${date}`)}
                    />
                  )}
                  onSlotClick={(date, hour) => openCreate(date, hour)}
                  onEventClick={openEdit}
                  onEventMove={(ev, next) => void moveEvent(ev, next)}
                  onEventResize={(ev, d) => void resizeEvent(ev, d)}
                />
                <div className="mt-1.5 flex items-center gap-2">
                  {!drawerOpen && (
                    <button
                      onClick={() => setDrawerOpen(true)}
                      className="flex items-center gap-1 rounded border border-gray-200 px-1.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50"
                      title="Show the task drawer"
                    >
                      <PanelLeftOpen size={11} /> Tasks
                    </button>
                  )}
                  <p className="font-mono text-[9px] uppercase tracking-wider text-gray-300">
                    Click an empty slot to add a block · drag blocks to move, pull their bottom edge to resize
                  </p>
                </div>
                {draftPreview && (
                  <p className="mt-1 font-mono text-[10px] text-indigo-500">
                    Previewing "{draftPreview.name}" — dashed chips in the all-day row show where work would start.
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <PlanAssistPanel
                  suggestions={suggestions}
                  taskLookup={taskLookup}
                  unestimated={unestimated}
                  rollupCount={rollupTasks.length}
                  onPlace={(taskId, date) => move.mutate({ taskId, date })}
                  onPlaceAll={placeAllSuggestions}
                />
                <DraftsPanel
                  preview={draftPreview}
                  onPreview={setDraftPreview}
                  onApplied={() => { invalidate.allTasks(); invalidate.schedulePreview(); qc.invalidateQueries({ queryKey: ['goals'] }); }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="h-[calc(100vh-240px)] min-h-[640px]">
            <GanttView embedded />
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragTask && (
          <div className="flex items-center gap-1 text-[10px] rounded px-1.5 py-1 border bg-[#EEF2FF] text-[#4648d4] border-[#4648d4] shadow-lg">
            <GripVertical size={9} className="opacity-50" />
            <span className="truncate max-w-[140px]">{dragTask.title}</span>
          </div>
        )}
      </DragOverlay>

      {composer && (
        <EventComposer
          seed={composer}
          days={weekDays}
          tasks={allTasks}
          goals={goals}
          onClose={() => setComposer(null)}
        />
      )}
    </DndContext>
  );
}
