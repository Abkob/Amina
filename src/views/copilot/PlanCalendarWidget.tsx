import { useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, RefreshCw, Trash2, Users } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { apiPatch, apiPost } from '../../utils/apiFetch';
import {
  addDays, clampHour, fmtHourLabel, fmtTimeRange, mondayOf, packOverlaps,
  parseLocalDate, snapHour, type TimedBlock,
} from '../../utils/calendar';
import { planDayLoads, planFeedbackLine } from '../../utils/planFeedback';

/**
 * The interactive calendar a "plan" chat turn renders instead of prose:
 * meetings and existing blocks are fixed context, proposed blocks are dashed
 * and draggable (30-min snap, across days). Apply commits every block as a
 * real linked calendar event; Discard drops the plan. Drag positions and the
 * final status persist on the chat message, so reloads restore the widget.
 */

export interface ChatPlanBlock {
  /** absent on routine-series blocks that aren't tied to a task */
  task_id?: string;
  title: string;
  date: string;
  start_hour: number;
  duration_hours: number;
  planned_minutes?: number;
}

export interface ChatPlan {
  /** 'series' = declared routine occurrences, no scheduler run */
  kind?: 'plan' | 'series';
  from: string;
  to: string;
  work_start: number;
  work_end: number;
  days: Array<{ date: string; available_minutes: number }>;
  busy: Array<{ date: string; start_hour: number; duration_hours: number; title: string; kind: 'meeting' | 'block' }>;
  blocks: ChatPlanBlock[];
  unplaced: Array<{ task_id: string; title: string; minutes: number }>;
  /** unestimated-but-otherwise-ready tasks with a history-based guess each */
  needs_estimate?: Array<{ task_id: string; title: string; suggested_minutes: number; basis: string; needs_date?: boolean }>;
  scheduler: { status: string; gap_minutes: number; unestimated_count: number; overflow_count: number };
  status?: 'pending' | 'applied' | 'discarded';
  adjustments?: Record<string, { date: string; start_hour: number }>;
}

const HOUR_PX = 26;

function fmtMins(mins: number): string {
  if (Math.abs(mins) < 60) return `${mins}m`;
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${mins < 0 ? '-' : ''}${h}h${m ? ` ${m}m` : ''}`;
}

export function PlanCalendarWidget({ plan: initialPlan, sessionId, messageId }: {
  plan: ChatPlan;
  sessionId: string | null;
  messageId?: string;
}) {
  const { triggerToast } = useAppStore();

  // The plan can be rebuilt in place (estimate triage → refresh), so it lives
  // in state; the prop is only the starting point.
  const [plan, setPlan] = useState<ChatPlan>(initialPlan);
  // Proposed blocks with the user's drag adjustments folded in (index-keyed)
  const [blocks, setBlocks] = useState<ChatPlanBlock[]>(() =>
    initialPlan.blocks.map((b, i) => {
      const adj = initialPlan.adjustments?.[String(i)];
      return adj ? { ...b, date: adj.date, start_hour: adj.start_hour } : b;
    }),
  );
  const [status, setStatus] = useState<'pending' | 'applied' | 'discarded'>(initialPlan.status ?? 'pending');
  const [busyState, setBusyState] = useState(false);
  const adjustments = useRef<Record<string, { date: string; start_hour: number }>>({ ...(initialPlan.adjustments ?? {}) });
  const isSeries = plan.kind === 'series';

  // Estimate triage: one tap per unestimated task, then rebuild the plan
  const [triage, setTriage] = useState<Record<string, 'pending' | 'set' | 'skipped'>>({});
  const [refreshing, setRefreshing] = useState(false);
  const triageSetCount = Object.values(triage).filter(v => v === 'set').length;

  const setEstimate = async (item: NonNullable<ChatPlan['needs_estimate']>[number], minutes: number) => {
    try {
      await apiPatch(`/api/tasks/${item.task_id}`, {
        estimated_minutes: minutes,
        estimated_duration: fmtMins(minutes),
        // Including a dateless task in this plan gives it the window's end as
        // its target — that's what "plan it this week" means.
        ...(item.needs_date ? { target_date: plan.to } : {}),
      });
      setTriage(t => ({ ...t, [item.task_id]: 'set' }));
    } catch (e) {
      triggerToast((e as Error).message || 'Could not save the estimate.', 'error');
    }
  };

  /** Server rebuilds the plan for the same window (now including the newly
   *  estimated tasks) and stores it on the message — no model round-trip. */
  const refreshPlan = async () => {
    if (!sessionId || !messageId) return;
    setRefreshing(true);
    try {
      const r = await apiPatch<{ ok: boolean; plan?: ChatPlan }>(
        `/api/ai/sessions/${sessionId}/messages/${messageId}/plan`,
        { refresh_window: { from_date: plan.from, to_date: plan.to, start_hour: plan.work_start, end_hour: plan.work_end } },
      );
      if (r.plan) {
        setPlan(r.plan);
        setBlocks(r.plan.blocks);
        adjustments.current = {};
        setTriage({});
      }
    } catch (e) {
      triggerToast((e as Error).message || 'Could not update the plan.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  // Weeks covered by the horizon (Monday-based), pager between them
  const weekStarts = useMemo(() => {
    const out: string[] = [];
    let w = mondayOf(plan.from);
    while (w <= plan.to) {
      out.push(w);
      w = addDays(w, 7);
    }
    return out;
  }, [plan.from, plan.to]);
  const [weekIdx, setWeekIdx] = useState(0);
  const weekStart = weekStarts[weekIdx] ?? mondayOf(plan.from);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Vertical range: work window stretched to cover everything placed
  const [startHourGrid, endHourGrid] = useMemo(() => {
    let lo = plan.work_start;
    let hi = plan.work_end;
    for (const b of [...blocks, ...plan.busy]) {
      lo = Math.min(lo, b.start_hour);
      hi = Math.max(hi, b.start_hour + b.duration_hours);
    }
    return [Math.max(0, Math.floor(lo)), Math.min(24, Math.ceil(hi))];
  }, [blocks, plan.busy, plan.work_start, plan.work_end]);
  const gridHeight = (endHourGrid - startHourGrid) * HOUR_PX;
  const hourToY = (h: number) => (h - startHourGrid) * HOUR_PX;

  const interactive = status === 'pending';

  const persist = (patch: { status?: 'pending' | 'applied' | 'discarded'; adjustments?: Record<string, { date: string; start_hour: number }> }) => {
    if (!sessionId || !messageId) return; // nothing durable to patch yet
    apiPatch(`/api/ai/sessions/${sessionId}/messages/${messageId}/plan`, patch).catch(() => {});
  };

  const moveBlock = (index: number, date: string, start_hour: number) => {
    setBlocks(prev => prev.map((b, i) => (i === index ? { ...b, date, start_hour } : b)));
    adjustments.current[String(index)] = { date, start_hour };
    persist({ adjustments: { [String(index)]: { date, start_hour } } });
  };

  const apply = async () => {
    setBusyState(true);
    try {
      await apiPost('/api/ai/schedule/plan/apply', { blocks });
      setStatus('applied');
      persist({ status: 'applied' });
      triggerToast(`Plan applied — ${blocks.length} block${blocks.length !== 1 ? 's' : ''} on your calendar.`, 'success');
    } catch (e) {
      triggerToast((e as Error).message || 'Could not apply the plan.', 'error');
    } finally {
      setBusyState(false);
    }
  };

  const discard = () => {
    setStatus('discarded');
    persist({ status: 'discarded' });
  };

  // Live feedback on the current arrangement
  const feedback = useMemo(
    () => planFeedbackLine(planDayLoads(
      blocks.map(b => ({ date: b.date, planned_minutes: b.planned_minutes ?? Math.round(b.duration_hours * 60) })),
      plan.days,
    )),
    [blocks, plan.days],
  );

  const schedTone =
    plan.scheduler.status === 'feasible' ? 'text-emerald-600' :
    plan.scheduler.status === 'impossible' ? 'text-red-600' : 'text-amber-600';

  const horizonLabel = `${parseLocalDate(plan.from).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${parseLocalDate(plan.to).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <div className={`mt-2 overflow-hidden rounded-xl border bg-white text-left ${status === 'discarded' ? 'border-gray-200 opacity-60' : 'border-[#4648d4]/25'}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
        <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#4648d4]">
          {isSeries ? 'Routine' : 'Plan'} · {horizonLabel}
        </span>
        {isSeries ? (
          <span className="font-mono text-[9px] font-bold uppercase text-gray-500">×{blocks.length} sessions</span>
        ) : (
          <span className={`font-mono text-[9px] font-bold uppercase ${schedTone}`}>
            {plan.scheduler.status}
            {plan.scheduler.gap_minutes !== 0 && ` · ${plan.scheduler.gap_minutes > 0 ? '+' : ''}${fmtMins(plan.scheduler.gap_minutes)}`}
          </span>
        )}
        {status !== 'pending' && (
          <span className={`rounded-full px-2 py-0.5 font-mono text-[8px] font-bold uppercase ${status === 'applied' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
            {status}
          </span>
        )}
        {weekStarts.length > 1 && (
          <span className="ml-auto flex items-center gap-1">
            <button onClick={() => setWeekIdx(i => Math.max(0, i - 1))} disabled={weekIdx === 0} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30">
              <ChevronLeft size={12} />
            </button>
            <span className="font-mono text-[9px] text-gray-500">week {weekIdx + 1}/{weekStarts.length}</span>
            <button onClick={() => setWeekIdx(i => Math.min(weekStarts.length - 1, i + 1))} disabled={weekIdx === weekStarts.length - 1} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30">
              <ChevronRight size={12} />
            </button>
          </span>
        )}
      </div>

      {/* Estimate triage — one tap per unestimated task, then rebuild */}
      {interactive && !isSeries && (plan.needs_estimate?.length ?? 0) > 0 && (
        <div className="space-y-1 border-b border-amber-100 bg-amber-50/60 px-3 py-2">
          <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-amber-700">
            {plan.needs_estimate!.length} task{plan.needs_estimate!.length !== 1 ? 's' : ''} missing an estimate — tap one to include it
          </p>
          {plan.needs_estimate!.map(t => {
            const state = triage[t.task_id] ?? 'pending';
            const chips = [...new Set([15, 30, 60, 120, 240, t.suggested_minutes])].sort((a, b) => a - b);
            return (
              <div key={t.task_id} className="flex flex-wrap items-center gap-1">
                <span
                  className={`min-w-0 flex-1 truncate text-[10px] font-medium ${state === 'pending' ? 'text-gray-700' : 'text-gray-400'}`}
                  title={`Suggested ${fmtMins(t.suggested_minutes)} — ${t.basis}`}
                >
                  {state === 'set' ? '✓ ' : state === 'skipped' ? '– ' : ''}{t.title}
                </span>
                {state === 'pending' && (
                  <>
                    {chips.map(m => (
                      <button
                        key={m}
                        onClick={() => setEstimate(t, m)}
                        className={`rounded border px-1.5 py-0.5 font-mono text-[8px] font-bold transition-colors ${
                          m === t.suggested_minutes
                            ? 'border-[#4648d4] bg-[#EEF2FF] text-[#4648d4]'
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                        }`}
                        title={m === t.suggested_minutes ? `Suggested: ${t.basis}` : undefined}
                      >
                        {fmtMins(m)}
                      </button>
                    ))}
                    <button
                      onClick={() => setTriage(s => ({ ...s, [t.task_id]: 'skipped' }))}
                      className="rounded px-1 py-0.5 font-mono text-[8px] text-gray-400 hover:text-gray-600"
                    >
                      skip
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {triageSetCount > 0 && (
            <button
              onClick={refreshPlan}
              disabled={refreshing || !messageId}
              className="mt-0.5 flex items-center gap-1 rounded bg-[#4648d4] px-2 py-1 font-mono text-[8px] font-bold uppercase text-white hover:opacity-90 disabled:opacity-40"
            >
              <RefreshCw size={9} className={refreshing ? 'animate-spin' : ''} /> Update plan with new estimates
            </button>
          )}
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))] border-b border-gray-100">
        <div />
        {days.map(d => {
          const dt = parseLocalDate(d);
          const inHorizon = d >= plan.from && d <= plan.to;
          return (
            <div key={d} className={`border-l border-gray-50 py-1 text-center ${inHorizon ? '' : 'opacity-30'}`}>
              <span className="font-mono text-[8px] font-bold uppercase text-gray-400">{dt.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
              <span className="ml-1 font-headline text-[10px] font-bold text-gray-700">{dt.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[34px_repeat(7,minmax(0,1fr))]">
        <div className="relative" style={{ height: gridHeight }}>
          {Array.from({ length: endHourGrid - startHourGrid - 1 }, (_, i) => (
            <span key={i} className="absolute right-1 -translate-y-1/2 font-mono text-[7px] text-gray-300" style={{ top: (i + 1) * HOUR_PX }}>
              {fmtHourLabel(startHourGrid + i + 1)}
            </span>
          ))}
        </div>
        {days.map((d, dayIdx) => (
          <PlanDayColumn
            key={d}
            date={d}
            dayIdx={dayIdx}
            days={days}
            inHorizon={d >= plan.from && d <= plan.to}
            busy={plan.busy.filter(b => b.date === d)}
            blocks={blocks}
            startHourGrid={startHourGrid}
            endHourGrid={endHourGrid}
            hourToY={hourToY}
            gridHeight={gridHeight}
            interactive={interactive}
            onMove={moveBlock}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="space-y-1.5 border-t border-gray-100 px-3 py-2">
        {feedback && <p className="text-[10px] font-medium text-amber-600">⚠ {feedback}</p>}
        {plan.unplaced.length > 0 && (
          <p className="text-[10px] text-gray-400" title={plan.unplaced.map(u => `${u.title} (${fmtMins(u.minutes)})`).join('\n')}>
            {plan.unplaced.length} task{plan.unplaced.length !== 1 ? 's' : ''} didn't fit in these work hours.
          </p>
        )}
        {plan.scheduler.unestimated_count > 0 && !(plan.needs_estimate?.length) && (
          <p className="text-[10px] text-gray-400">{plan.scheduler.unestimated_count} task{plan.scheduler.unestimated_count !== 1 ? 's' : ''} left out — no time estimate yet.</p>
        )}
        {interactive ? (
          <div className="flex items-center gap-2 pt-0.5">
            <button
              onClick={apply}
              disabled={busyState || blocks.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-[#4648d4] px-3 py-1.5 font-mono text-[9px] font-bold uppercase text-white hover:opacity-90 disabled:opacity-40"
            >
              <Check size={11} /> {isSeries ? `Apply all ${blocks.length}` : 'Apply plan'}
            </button>
            <button
              onClick={discard}
              disabled={busyState}
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-[9px] font-bold uppercase text-gray-500 hover:bg-gray-200 disabled:opacity-40"
            >
              <Trash2 size={11} /> Discard
            </button>
            <span className="font-mono text-[8px] uppercase tracking-wider text-gray-300">drag dashed blocks to rearrange</span>
          </div>
        ) : (
          <p className="font-mono text-[9px] uppercase tracking-wider text-gray-400">
            {status === 'applied' ? 'These blocks are on your Schedule.' : 'Plan discarded — ask for a new one anytime.'}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Day column ────────────────────────────────────────────────────────────────

function PlanDayColumn({ date, dayIdx, days, inHorizon, busy, blocks, startHourGrid, endHourGrid, hourToY, gridHeight, interactive, onMove }: {
  date: string;
  dayIdx: number;
  days: string[];
  inHorizon: boolean;
  busy: ChatPlan['busy'];
  blocks: ChatPlanBlock[];
  startHourGrid: number;
  endHourGrid: number;
  hourToY: (h: number) => number;
  gridHeight: number;
  interactive: boolean;
  onMove: (index: number, date: string, start_hour: number) => void;
}) {
  const dayBlocks = blocks
    .map((b, index) => ({ ...b, index }))
    .filter(b => b.date === date);

  const packed = useMemo(() => {
    const timed: TimedBlock[] = [
      ...busy.map((b, i) => ({ id: `busy:${i}`, start: b.start_hour, end: b.start_hour + b.duration_hours })),
      ...dayBlocks.map(b => ({ id: `plan:${b.index}`, start: b.start_hour, end: b.start_hour + b.duration_hours })),
    ];
    return packOverlaps(timed);
  }, [busy, dayBlocks]);

  return (
    <div className={`relative border-l border-gray-50 ${inHorizon ? '' : 'bg-gray-50/60'}`} style={{ height: gridHeight }}>
      {Array.from({ length: endHourGrid - startHourGrid - 1 }, (_, i) => (
        <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-gray-50" style={{ top: (i + 1) * HOUR_PX }} />
      ))}

      {busy.map((b, i) => {
        const pos = packed.get(`busy:${i}`) ?? { col: 0, cols: 1 };
        const top = hourToY(clampHour(b.start_hour, startHourGrid, endHourGrid));
        const height = Math.max(10, Math.min(b.duration_hours * HOUR_PX, gridHeight - top) - 1);
        return (
          <div
            key={`busy-${i}`}
            className={`absolute overflow-hidden rounded px-1 ${b.kind === 'meeting' ? 'bg-purple-100 text-purple-700' : 'bg-gray-200/80 text-gray-600'}`}
            style={{ top, height, left: `calc(${(pos.col / pos.cols) * 100}% + 1px)`, width: `calc(${100 / pos.cols}% - 2px)` }}
            title={`${b.title} — already on your calendar (${fmtTimeRange(b.start_hour, b.duration_hours)})`}
          >
            <p className="truncate text-[8px] font-semibold leading-tight">
              {b.kind === 'meeting' && <Users size={7} className="mr-0.5 inline -mt-px" />}
              {b.title}
            </p>
          </div>
        );
      })}

      {dayBlocks.map(b => (
        <ProposedBlock
          key={b.index}
          block={b}
          pos={packed.get(`plan:${b.index}`) ?? { col: 0, cols: 1 }}
          dayIdx={dayIdx}
          days={days}
          startHourGrid={startHourGrid}
          endHourGrid={endHourGrid}
          hourToY={hourToY}
          gridHeight={gridHeight}
          interactive={interactive}
          onMove={onMove}
        />
      ))}
    </div>
  );
}

// ── Draggable proposed block ──────────────────────────────────────────────────

function ProposedBlock({ block, pos, dayIdx, days, startHourGrid, endHourGrid, hourToY, gridHeight, interactive, onMove }: {
  block: ChatPlanBlock & { index: number };
  pos: { col: number; cols: number };
  dayIdx: number;
  days: string[];
  startHourGrid: number;
  endHourGrid: number;
  hourToY: (h: number) => number;
  gridHeight: number;
  interactive: boolean;
  onMove: (index: number, date: string, start_hour: number) => void;
}) {
  const [drag, setDrag] = useState<{ dy: number; dDay: number; colW: number } | null>(null);
  const gesture = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const previewStart = drag
    ? clampHour(snapHour(block.start_hour + drag.dy / HOUR_PX, 30), startHourGrid, endHourGrid - block.duration_hours)
    : block.start_hour;
  const previewDay = drag ? Math.min(6, Math.max(0, dayIdx + drag.dDay)) : dayIdx;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { startX: e.clientX, startY: e.clientY, moved: false };
    const colW = (e.currentTarget as HTMLElement).parentElement?.offsetWidth ?? 100;
    setDrag({ dy: 0, dDay: 0, colW });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!gesture.current || !drag) return;
    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) gesture.current.moved = true;
    setDrag(d => d && { ...d, dy, dDay: Math.round(dx / d.colW) });
  };
  const onPointerUp = () => {
    const moved = gesture.current?.moved;
    gesture.current = null;
    if (drag && moved) onMove(block.index, days[previewDay], previewStart);
    setDrag(null);
  };

  const top = hourToY(clampHour(previewStart, startHourGrid, endHourGrid));
  const height = Math.max(12, Math.min(block.duration_hours * HOUR_PX, gridHeight - top) - 1);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className={`absolute overflow-hidden rounded border border-dashed border-[#4648d4]/60 bg-[#EEF2FF]/90 px-1 text-[#33359c] select-none touch-none
        ${interactive ? 'cursor-grab active:cursor-grabbing' : ''}
        ${drag ? 'z-30 shadow-lg ring-2 ring-[#4648d4]/30' : 'z-10'}`}
      style={{
        top,
        height,
        left: `calc(${(pos.col / pos.cols) * 100}% + 1px)`,
        width: `calc(${100 / pos.cols}% - 2px)`,
        transform: drag && drag.dDay !== 0 ? `translateX(calc(${(previewDay - dayIdx) * 100}% * ${pos.cols}))` : undefined,
      }}
      title={`${block.title} — proposed ${fmtTimeRange(previewStart, block.duration_hours)}`}
    >
      <p className="truncate text-[8px] font-bold leading-tight">{block.title}</p>
      {height > 22 && <p className="truncate font-mono text-[7px] opacity-70">{fmtTimeRange(previewStart, block.duration_hours)}</p>}
    </div>
  );
}
