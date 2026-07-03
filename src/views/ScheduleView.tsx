import { useMemo, useState } from 'react';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import {
  DndContext, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  Sparkles, Calendar, AlertTriangle, Clock, RefreshCw, ChevronLeft, ChevronRight,
  GripVertical, Inbox, Check, X, Eye, EyeOff,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useSchedulePreview, useAllTasks, useInvalidate, type ScheduleDay, type SchedulerResult, type ScheduleTaskInfo, type DayAssignment } from '../api/hooks';
import { apiPost, apiPatch } from '../utils/apiFetch';
import type { DBTask } from '../db/schema';

/**
 * Schedule workspace: a week of droppable days. Drag any task between days
 * (sets start_date immediately — real-time), drag from the backlog tray to
 * schedule it, drag back to the tray to unschedule. "AI drafts" produces
 * three alternative plans from the deterministic scheduler; previewing lays
 * ghost chips on the days, applying writes the chosen plan in one transaction.
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
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
    dom: String(d.getDate()),
    isToday: d.toDateString() === today.toDateString(),
  };
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
      title={ghost ? `${task.title} (draft preview)` : `${task.title} — drag to another day, or to the backlog to unschedule`}
    >
      {!ghost && <GripVertical size={9} className="shrink-0 opacity-50" />}
      <span className="truncate flex-1">{task.title}</span>
      {task.estimated_minutes ? <span className="shrink-0 opacity-60">{fmtMins(task.estimated_minutes)}</span> : null}
    </div>
  );
}

// ── Droppable day cell ────────────────────────────────────────────────────────

function DayCell({ day, startTasks, assignment, ghostIds, taskLookup }: {
  day: ScheduleDay;
  startTasks: DBTask[];
  assignment: DayAssignment | undefined;
  ghostIds: string[];
  taskLookup: Record<string, ScheduleTaskInfo>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day.date}` });
  const { dow, dom, isToday } = dayLabel(day.date);
  const startIds = new Set(startTasks.map(t => t.id));
  const plannedIds = (assignment?.task_ids ?? []).filter(id => !startIds.has(id));

  return (
    <div
      ref={setNodeRef}
      className={`bg-white border rounded-xl p-2.5 min-h-[150px] transition-colors
        ${isToday ? 'border-[#4648d4] ring-1 ring-[#4648d4]/20' : 'border-gray-200'}
        ${isOver ? 'bg-indigo-50/70 border-indigo-400' : ''}`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <span className={`text-[9px] font-mono uppercase tracking-widest font-bold ${isToday ? 'text-[#4648d4]' : 'text-gray-400'}`}>{dow}</span>
        <span className={`text-sm font-headline font-bold ${isToday ? 'text-[#4648d4]' : 'text-gray-800'}`}>{dom}</span>
      </div>
      {day.override && <p className="text-[9px] font-mono text-amber-600 mb-1">⚠ {day.override.available_minutes}m available</p>}
      {day.meetings.map(m => (
        <div key={m.id} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-100 rounded px-1.5 py-1 mb-1 truncate" title={m.title}>
          <Clock size={8} className="inline mr-1" />{m.title}
        </div>
      ))}
      {startTasks.map(t => <TaskChip key={t.id} task={t} />)}
      {ghostIds.map(id => (
        <TaskChip key={`ghost-${id}`} ghost task={{ id, title: taskLookup[id]?.title ?? id, estimated_minutes: taskLookup[id]?.estimated_minutes ?? null, priority: 'medium' }} />
      ))}
      {plannedIds.length > 0 && ghostIds.length === 0 && (
        <div className="mt-1">
          {plannedIds.map(id => (
            <div key={id} className="text-[9px] text-gray-400 truncate px-1" title={`Scheduler would work on "${taskLookup[id]?.title}" this day (not yet applied)`}>
              → {taskLookup[id]?.title ?? id}
            </div>
          ))}
        </div>
      )}
      {day.tasks.map(t => (
        <div key={`due-${t.id}`} className="text-[9px] font-mono text-red-500 truncate mt-0.5" title={`Due: ${t.title}`}>
          ⚑ due: {t.title}
        </div>
      ))}
      {day.deadline_titles.map(d => (
        <div key={d} className="text-[9px] font-mono text-orange-600 truncate" title={d}>◆ {d}</div>
      ))}
    </div>
  );
}

// ── Backlog tray (droppable to unschedule) ────────────────────────────────────

function BacklogTray({ tasks, unestimated }: { tasks: DBTask[]; unestimated: DBTask[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog' });
  const { navigateToGoal } = useAppStore();
  return (
    <div
      ref={setNodeRef}
      className={`bg-white border rounded-xl p-3 transition-colors ${isOver ? 'border-indigo-400 bg-indigo-50/60' : 'border-gray-200'}`}
    >
      <p className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5 mb-1">
        <Inbox size={12} className="text-gray-400" /> Backlog
      </p>
      <p className="text-[10px] text-gray-400 mb-2">Drag onto a day to schedule · drop here to unschedule.</p>
      {tasks.length === 0 && <p className="text-[10px] text-gray-300 font-mono">nothing waiting</p>}
      <div className="max-h-48 overflow-y-auto pr-0.5">
        {tasks.map(t => <TaskChip key={t.id} task={t} />)}
      </div>
      {unestimated.length > 0 && (
        <div className="mt-2 pt-2 border-t border-dashed border-amber-200">
          <p className="text-[9px] font-mono text-amber-600 mb-1">{unestimated.length} need a time estimate before scheduling:</p>
          <div className="max-h-32 overflow-y-auto pr-0.5">
            {unestimated.slice(0, 12).map(t => (
              <button
                key={t.id}
                onClick={() => t.goal_id && navigateToGoal(t.goal_id)}
                className="w-full text-left text-[10px] text-amber-700/80 truncate px-1.5 py-0.5 rounded hover:bg-amber-50"
                title="Open its goal to add an estimate"
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
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

// ── Main view ─────────────────────────────────────────────────────────────────

export function ScheduleView() {
  const { triggerToast } = useAppStore();
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  const { data: previewData, isLoading } = useSchedulePreview();
  const { data: allTasks = [] } = useAllTasks();
  const [weekOffset, setWeekOffset] = useState(0);
  const [draftPreview, setDraftPreview] = useState<Draft | null>(null);
  const [dragTask, setDragTask] = useState<DBTask | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const days: ScheduleDay[] = previewData?.days ?? [];
  const scheduler = previewData?.scheduler_result;
  const taskLookup = previewData?.task_lookup ?? {};
  const weekDays = days.slice(weekOffset * 7, weekOffset * 7 + 7);
  const assignmentsByDate = new Map<string, DayAssignment>((scheduler?.day_assignments ?? []).map(a => [a.date, a]));

  const active = useMemo(() => allTasks.filter(t => !t.completed && !t.parent_task_id), [allTasks]);
  const startsByDate = useMemo(() => {
    const m = new Map<string, DBTask[]>();
    for (const t of active) {
      if (!t.start_date) continue;
      if (!m.has(t.start_date)) m.set(t.start_date, []);
      m.get(t.start_date)!.push(t);
    }
    return m;
  }, [active]);
  const backlog = useMemo(() => active.filter(t => !t.start_date && (t.estimated_minutes ?? 0) > 0), [active]);
  const unestimated = useMemo(() => active.filter(t => !(t.estimated_minutes! > 0)), [active]);

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

  const onDragStart = (e: DragStartEvent) => {
    setDragTask(active.find(t => t.id === e.active.id) ?? null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragTask(null);
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const taskId = String(e.active.id);
    const task = active.find(t => t.id === taskId);
    if (!task) return;
    if (overId === 'backlog') {
      if (task.start_date) move.mutate({ taskId, date: null });
    } else if (overId.startsWith('day:')) {
      const date = overId.slice(4);
      if (task.start_date !== date) move.mutate({ taskId, date });
    }
  };

  const statusInfo = scheduler ? (STATUS_STYLE[scheduler.status] ?? STATUS_STYLE.feasible) : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="max-w-[1150px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
        <div className="flex justify-between items-end mb-5">
          <div>
            <h2 className="font-headline text-2xl font-bold text-black flex items-center gap-2">
              <Calendar size={20} /> Schedule
            </h2>
            <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mt-1">
              Drag tasks between days · changes save instantly
            </p>
          </div>
          <div className="flex items-center gap-3">
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
            <div className="flex gap-1 border border-gray-200 rounded-lg p-0.5 bg-[#f8f9fa]">
              <button onClick={() => setWeekOffset(o => Math.max(0, o - 1))} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Previous week">
                <ChevronLeft size={14} />
              </button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} className="px-2 py-1 hover:bg-gray-100 rounded font-mono text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                  Now
                </button>
              )}
              <button onClick={() => setWeekOffset(o => Math.min(4, o + 1))} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Next week">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Week grid */}
          <div className="lg:col-span-8">
            {isLoading && <p className="text-xs text-gray-400 font-mono">Loading schedule…</p>}
            {!isLoading && (
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {weekDays.map(day => (
                  <DayCell
                    key={day.date}
                    day={day}
                    startTasks={startsByDate.get(day.date) ?? []}
                    assignment={assignmentsByDate.get(day.date)}
                    ghostIds={ghostsByDate.get(day.date) ?? []}
                    taskLookup={taskLookup}
                  />
                ))}
              </div>
            )}
            {draftPreview && (
              <p className="text-[10px] font-mono text-indigo-500 mt-2">
                Previewing “{draftPreview.name}” — dashed chips show where work would start. Use the plan or hide the preview.
              </p>
            )}
          </div>

          {/* Right rail: backlog + drafts */}
          <div className="lg:col-span-4 space-y-4">
            <BacklogTray tasks={backlog} unestimated={unestimated} />
            <DraftsPanel
              preview={draftPreview}
              onPreview={setDraftPreview}
              onApplied={() => { invalidate.allTasks(); invalidate.schedulePreview(); qc.invalidateQueries({ queryKey: ['goals'] }); }}
            />
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragTask && (
          <div className="flex items-center gap-1 text-[10px] rounded px-1.5 py-1 border bg-[#EEF2FF] text-[#4648d4] border-[#4648d4] shadow-lg">
            <GripVertical size={9} className="opacity-50" />
            <span className="truncate max-w-[140px]">{dragTask.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
