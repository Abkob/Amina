import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRt, Minus, EyeOff, Eye, SlidersHorizontal } from 'lucide-react';
import { getGoals } from '../db/queries/goals';
import { getTasksByGoal, updateTask } from '../db/queries/tasks';
import { getAllMeetings } from '../db/queries/meetings';
import type { DBGoal, DBTask, DBMeeting } from '../db/schema';
import { useAppStore } from '../store/useAppStore';
import { getEffectiveTaskDueDate, getInheritedTaskDueDate } from '../utils/taskDates';

// ── Zoom config ───────────────────────────────────────────────────────────────

type ZoomMode = 'day' | 'week' | 'month';

interface ZoomCfg {
  cellW:  number;   // px per day
  range:  number;   // total days to render
  shift:  number;   // days to shift on ◀/▶
  back:   number;   // days before today to show on "Today"
}

const ZOOM: Record<ZoomMode, ZoomCfg> = {
  day:   { cellW: 28, range: 56,  shift: 7,  back: 7  },
  week:  { cellW: 10, range: 168, shift: 14, back: 14 },
  month: { cellW: 3,  range: 365, shift: 30, back: 30 },
};

// ── Other constants ────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const LEFT_W = 220;
const HEADER_H = 52;

const ROW_H: Record<string, number> = {
  goal: 44, milestone: 38, task: 34, subtask: 30,
};

const GOAL_COLORS = [
  '#4648d4', '#10B981', '#F59E0B', '#8B5CF6',
  '#06B6D4', '#F97316', '#EC4899', '#EF4444',
];

const STATUS_BAR: Record<string, { opacity: number; dashed: boolean; textColor: string }> = {
  done:        { opacity: 0.45, dashed: false, textColor: 'text-white'       },
  in_progress: { opacity: 1.00, dashed: false, textColor: 'text-white'       },
  inactive:    { opacity: 0.22, dashed: false, textColor: 'text-white'       },
  blocked:     { opacity: 0.22, dashed: false, textColor: 'text-white'       },
  todo:        { opacity: 0.65, dashed: true,  textColor: 'text-current'     },
};

// Legend items use rgba (not CSS opacity) so border/background fade independently.
// All Gantt bars use the goal's color; status changes opacity + solid/dashed pattern.
const LEGEND_ITEMS: { icon: string; label: string; swatchStyle: React.CSSProperties; stripe?: boolean }[] = [
  { icon: '▶', label: 'In Progress', swatchStyle: { backgroundColor: 'rgba(70,72,212,1)',    boxShadow: '0 1px 3px rgba(70,72,212,0.4)' } },
  { icon: '✓', label: 'Done',        swatchStyle: { backgroundColor: 'rgba(70,72,212,0.38)' }, stripe: true },
  { icon: '○', label: 'To Do',       swatchStyle: { backgroundColor: 'rgba(70,72,212,0.08)', border: '2px dashed rgba(70,72,212,0.65)' } },
  { icon: '—', label: 'Inactive / Blocked', swatchStyle: { backgroundColor: 'rgba(70,72,212,0.22)' } },
];

// ── Row types ─────────────────────────────────────────────────────────────────

interface GanttRow {
  kind:        'goal' | 'milestone' | 'task' | 'subtask';
  id:          string;
  label:       string;
  depth:       number;
  color:       string;
  hasChildren: boolean;
  showUnscheduledMarker?: boolean;
  rollupRange?: DateRange | null;
  effectiveDueDate?: string | null;
  inheritedDueDate?: boolean;
  task?:       DBTask;
  goal?:       DBGoal;
}

interface Bar {
  x: number; w: number;
  clampL: boolean; clampR: boolean;
  status: string;
}

interface DateRange {
  start: Date;
  end: Date;
}

// ── Header column helpers ─────────────────────────────────────────────────────

interface HCol { label: string; px: number; sub?: boolean }

function monthGroupCols(days: Date[], cellW: number): HCol[] {
  const cols: HCol[] = [];
  for (const d of days) {
    const lbl = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (!cols.length || cols[cols.length - 1].label !== lbl)
      cols.push({ label: lbl, px: cellW });
    else
      cols[cols.length - 1].px += cellW;
  }
  return cols;
}

function yearGroupCols(days: Date[], cellW: number): HCol[] {
  const cols: HCol[] = [];
  for (const d of days) {
    const lbl = String(d.getFullYear());
    if (!cols.length || cols[cols.length - 1].label !== lbl)
      cols.push({ label: lbl, px: cellW });
    else
      cols[cols.length - 1].px += cellW;
  }
  return cols;
}

function weekStartCols(days: Date[], cellW: number): HCol[] {
  const cols: HCol[] = [];
  for (const d of days) {
    const isMonday = (d.getDay() + 6) % 7 === 0; // Mon=0 in (day+6)%7
    if (isMonday || !cols.length)
      cols.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), px: cellW });
    else
      cols[cols.length - 1].px += cellW;
  }
  return cols;
}

function monthNameCols(days: Date[], cellW: number): HCol[] {
  const cols: HCol[] = [];
  for (const d of days) {
    const lbl = d.toLocaleDateString('en-US', { month: 'short' });
    if (!cols.length || cols[cols.length - 1].label !== lbl)
      cols.push({ label: lbl, px: cellW });
    else
      cols[cols.length - 1].px += cellW;
  }
  return cols;
}

function dayCols(days: Date[], cellW: number): (HCol & { isToday: boolean; muted: boolean })[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return days.map(d => ({
    label:   String(d.getDate()),
    px:      cellW,
    isToday: d.toDateString() === today.toDateString(),
    muted:   d.getDay() === 0 || d.getDay() === 6,
  }));
}

// ── Bar computation ───────────────────────────────────────────────────────────

function getOwnDateRange(task: DBTask, dueDate: string | null = task.due_date): DateRange | null {
  const due   = dueDate         ? new Date(dueDate)         : null;
  const start = task.start_date ? new Date(task.start_date) : null;
  const estMs = task.estimated_minutes ? (task.estimated_minutes / 480) * DAY_MS : null;

  let bS: Date | null = null;
  let bE: Date | null = null;

  if (start && due)       { bS = start; bE = due; }
  else if (start && estMs){ bS = start; bE = new Date(start.getTime() + estMs); }
  else if (due && estMs)  { bE = due;   bS = new Date(due.getTime() - estMs); }
  else if (start)         { bS = start; bE = new Date(start.getTime() + DAY_MS); }
  else if (due)           { bE = due;   bS = new Date(due.getTime() - DAY_MS); }
  else                    { return null; }

  return { start: bS, end: bE };
}

function computeBarFromRange(dateRange: DateRange, status: string, viewStart: Date, cellW: number, range: number): Bar | null {
  const bS = dateRange.start;
  const bE = dateRange.end;
  const vEnd = new Date(viewStart.getTime() + range * DAY_MS);
  if (bE.getTime() < viewStart.getTime() || bS.getTime() > vEnd.getTime()) return null;

  const clampL = bS.getTime() < viewStart.getTime();
  const clampR = bE.getTime() > vEnd.getTime();
  const cS = clampL ? viewStart.getTime() : bS.getTime();
  const cE = clampR ? vEnd.getTime()      : bE.getTime();

  const x = ((cS - viewStart.getTime()) / DAY_MS) * cellW;
  const w = Math.max(((cE - cS) / DAY_MS) * cellW, cellW * 0.5);

  return { x, w, clampL, clampR, status };
}

function computeBar(task: DBTask, viewStart: Date, cellW: number, range: number, dueDate: string | null = task.due_date): Bar | null {
  const dateRange = getOwnDateRange(task, dueDate);
  return dateRange ? computeBarFromRange(dateRange, task.status, viewStart, cellW, range) : null;
}

function hasGanttSchedule(task: DBTask, dueDate: string | null = task.due_date): boolean {
  return getOwnDateRange(task, dueDate) !== null;
}

// ── Row hierarchy builder ─────────────────────────────────────────────────────

function buildRows(
  goals: DBGoal[],
  selected: Set<string>,
  tasksByGoal: Record<string, DBTask[]>,
  collapsed: Set<string>,
  hiddenIds: Set<string>,
  hideStatuses: Set<string>,
  hideUnscheduled: boolean,
): GanttRow[] {
  const rows: GanttRow[] = [];

  goals.forEach((goal, gi) => {
    if (!selected.has(goal.id)) return;
    const color = GOAL_COLORS[gi % GOAL_COLORS.length];
    const tasks = tasksByGoal[goal.id] ?? [];

    const byParent = new Map<string | null, DBTask[]>();
    for (const t of tasks) {
      const k = t.parent_task_id ?? null;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(t);
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.position - b.position);

    const descendantMemo = new Map<string, boolean>();
    const rangeMemo = new Map<string, DateRange | null>();
    const dueMemo = new Map<string, string | null>();
    const getEffectiveDue = (task: DBTask): string | null => {
      const cached = dueMemo.get(task.id);
      if (cached !== undefined) return cached;
      const due = getEffectiveTaskDueDate(task, tasks);
      dueMemo.set(task.id, due);
      return due;
    };
    const passesBaseFilters = (task: DBTask) =>
      task.kind !== 'next_action'
      && !hiddenIds.has(task.id)
      && !hideStatuses.has(normStatus(task.status));
    const mergeRanges = (ranges: DateRange[]): DateRange | null => {
      if (!ranges.length) return null;
      return ranges.reduce((acc, r) => ({
        start: acc.start.getTime() <= r.start.getTime() ? acc.start : r.start,
        end: acc.end.getTime() >= r.end.getTime() ? acc.end : r.end,
      }));
    };
    const getEffectiveRange = (task: DBTask): DateRange | null => {
      const cached = rangeMemo.get(task.id);
      if (cached !== undefined) return cached;

      const ownRange = getOwnDateRange(task, getEffectiveDue(task));
      if (ownRange) {
        rangeMemo.set(task.id, ownRange);
        return ownRange;
      }

      const childRanges = (byParent.get(task.id) ?? [])
        .filter(passesBaseFilters)
        .map(child => getEffectiveRange(child))
        .filter((r): r is DateRange => r !== null);
      const merged = mergeRanges(childRanges);
      rangeMemo.set(task.id, merged);
      return merged;
    };
    const hasVisibleDescendant = (taskId: string): boolean => {
      const cached = descendantMemo.get(taskId);
      if (cached !== undefined) return cached;
      const result = (byParent.get(taskId) ?? []).some(child =>
        passesBaseFilters(child)
        && (!hideUnscheduled || getEffectiveRange(child) !== null || hasVisibleDescendant(child.id)),
      );
      descendantMemo.set(taskId, result);
      return result;
    };
    const isVisibleTask = (task: DBTask) =>
      passesBaseFilters(task)
      && (!hideUnscheduled || getEffectiveRange(task) !== null || hasVisibleDescendant(task.id));
    const visibleChildren = (parentId: string | null) => (byParent.get(parentId) ?? []).filter(isVisibleTask);

    rows.push({ kind: 'goal', id: goal.id, label: goal.title, depth: 0, color, hasChildren: visibleChildren(null).length > 0, goal });
    if (collapsed.has(goal.id)) return;

    function addChildren(parentId: string | null, depth: number) {
      for (const t of byParent.get(parentId) ?? []) {
        if (!isVisibleTask(t)) continue;
        const kids = visibleChildren(t.id);
        const kind: GanttRow['kind'] = depth === 1 && t.kind === 'critical_path' ? 'milestone' : depth === 1 ? 'task' : 'subtask';
        const effectiveDueDate = getEffectiveDue(t);
        const inheritedDueDate = getInheritedTaskDueDate(t, tasks) !== null;
        const ownRange = getOwnDateRange(t, effectiveDueDate);
        const effectiveRange = getEffectiveRange(t);
        rows.push({
          kind,
          id: t.id,
          label: t.title,
          depth,
          color,
          hasChildren: kids.length > 0,
          showUnscheduledMarker: !hideUnscheduled,
          rollupRange: ownRange ? null : effectiveRange,
          effectiveDueDate,
          inheritedDueDate,
          task: t,
        });
        if (!collapsed.has(t.id)) addChildren(t.id, depth + 1);
      }
    }
    addChildren(null, 1);
  });

  return rows;
}

// ── DateHeader ────────────────────────────────────────────────────────────────

function DateHeader({ zoom, days, cellW, range }: {
  zoom:  ZoomMode;
  days:  Date[];
  cellW: number;
  range: number;
}) {
  const totalW = LEFT_W + range * cellW;
  const topCols    = zoom === 'month' ? yearGroupCols(days, cellW)  : monthGroupCols(days, cellW);
  const bottomCols = zoom === 'day'   ? dayCols(days, cellW)        :
                     zoom === 'week'  ? weekStartCols(days, cellW)  :
                                        monthNameCols(days, cellW);
  const rowH = HEADER_H / 2;

  return (
    <div className="sticky top-0 z-30 bg-white border-b-2 border-gray-200 select-none flex" style={{ minWidth: totalW }}>

      {/* Frozen tasks column label */}
      <div
        className="sticky left-0 z-40 bg-gray-50/80 border-r border-gray-200 flex items-center px-3 shrink-0"
        style={{ width: LEFT_W, height: HEADER_H }}
      >
        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Tasks</span>
      </div>

      {/* Timeline header columns */}
      <div className="flex-1 min-w-0">
        <div className="flex border-b border-gray-100 overflow-hidden" style={{ height: rowH }}>
          {topCols.map((col, i) => (
            <div key={i} className="shrink-0 border-r border-gray-100 flex items-center px-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide overflow-hidden" style={{ width: col.px }}>
              <span className="truncate">{col.label}</span>
            </div>
          ))}
        </div>
        <div className="flex overflow-hidden" style={{ height: rowH }}>
          {zoom === 'day'
            ? (bottomCols as ReturnType<typeof dayCols>).map((col, i) => (
                <div key={i}
                  className={`shrink-0 border-r border-gray-100 flex items-center justify-center text-[9px] font-mono transition-colors
                    ${col.isToday ? 'bg-[#4648d4] text-white font-bold' : col.muted ? 'text-gray-200' : 'text-gray-400'}`}
                  style={{ width: col.px }}>
                  {col.label}
                </div>
              ))
            : bottomCols.map((col, i) => (
                <div key={i} className="shrink-0 border-r border-gray-100 flex items-center px-1.5 text-[9px] font-mono text-gray-400 overflow-hidden" style={{ width: col.px }}>
                  <span className="truncate">{col.label}</span>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}

// ── GanttRow ──────────────────────────────────────────────────────────────────

function GanttRowEl({ row, days, viewStart, cellW, range, isCollapsed, onToggle, onBarDblClick, onHide }: {
  row:          GanttRow;
  days:         Date[];
  viewStart:    Date;
  cellW:        number;
  range:        number;
  isCollapsed:  boolean;
  onToggle:     () => void;
  onBarDblClick:(row: GanttRow) => void;
  onHide:       (id: string) => void;
}) {
  const h      = ROW_H[row.kind];
  const ownBar = row.task ? computeBar(row.task, viewStart, cellW, range, row.effectiveDueDate ?? null) : null;
  const rollupBar = !ownBar && row.rollupRange
    ? computeBarFromRange(row.rollupRange, row.task?.status ?? 'todo', viewStart, cellW, range)
    : null;
  const bar    = ownBar ?? rollupBar;
  const bst    = bar ? (STATUS_BAR[bar.status] ?? STATUS_BAR.todo) : null;
  const isRollupBar = !ownBar && Boolean(rollupBar);
  const today  = new Date(); today.setHours(0, 0, 0, 0);
  const todayX = ((today.getTime() - viewStart.getTime()) / DAY_MS) * cellW;
  const inView = todayX >= 0 && todayX <= range * cellW;
  const totalW = LEFT_W + range * cellW;

  const fillPct = row.task?.estimated_minutes && row.task?.actual_minutes
    ? Math.min(100, (row.task.actual_minutes / row.task.estimated_minutes) * 100) : 0;

  const bgClass =
    row.kind === 'goal'      ? 'bg-gray-50/80 border-b-2 border-gray-100' :
    row.kind === 'milestone' ? 'bg-white border-b border-gray-100' :
                               'bg-white border-b border-gray-50/80';

  return (
    <div className={`flex hover:bg-indigo-50/10 transition-colors group/row ${bgClass}`} style={{ height: h, minWidth: totalW }}>

      {/* ── Label (sticky left) ── */}
      <div
        className={`sticky left-0 z-20 shrink-0 flex items-center gap-1.5 border-r border-gray-200
          ${row.kind === 'goal' ? 'bg-gray-50/90 cursor-pointer' :
            row.kind === 'milestone' ? 'bg-white cursor-pointer' : 'bg-white'}`}
        style={{ width: LEFT_W, paddingLeft: 8 + row.depth * 13 }}
        onClick={row.hasChildren ? onToggle : undefined}
      >
        {row.hasChildren
          ? isCollapsed
              ? <ChevronRt   size={10} className="text-gray-400 shrink-0" />
              : <ChevronDown size={10} className="text-gray-400 shrink-0" />
          : <span className="w-[10px] shrink-0" />
        }

        <div
          className={row.kind === 'goal' ? 'w-2 h-2 rounded shrink-0' : 'w-1.5 h-1.5 rounded-full shrink-0'}
          style={{ backgroundColor: row.kind === 'milestone' ? row.color : row.kind === 'goal' ? row.color : row.color + 'aa' }}
        />

        <span className={`truncate flex-1 min-w-0
          ${row.kind === 'goal'      ? 'text-[10px] font-bold text-gray-800 uppercase tracking-wide' :
            row.kind === 'milestone' ? 'text-[11px] font-semibold text-gray-700' :
            row.kind === 'task'      ? 'text-[10px] text-gray-700' :
                                       'text-[10px] text-gray-500'}`}
        >
          {row.label}
        </span>

        {/* Hide button — appears on hover only; bar style communicates status */}
        {row.task && (
          <button
            onClick={e => { e.stopPropagation(); onHide(row.id); }}
            title="Hide from Gantt"
            className="ml-auto mr-1 shrink-0 opacity-0 group-hover/row:opacity-100 flex items-center justify-center w-5 h-5 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all"
          >
            <EyeOff size={10} />
          </button>
        )}
      </div>

      {/* ── Bar area ── */}
      <div className="flex-1 relative overflow-hidden" style={{ height: h }}>

        {/* Weekend shading (only meaningful in day mode) */}
        {cellW >= 14 && days.map((d, i) =>
          (d.getDay() === 0 || d.getDay() === 6) ? (
            <div key={i} className="absolute top-0 bottom-0 bg-gray-50/50 pointer-events-none" style={{ left: i * cellW, width: cellW }} />
          ) : null
        )}

        {/* Today line */}
        {inView && (
          <div className="absolute top-0 bottom-0 w-px bg-[#4648d4]/25 pointer-events-none z-10" style={{ left: todayX }} />
        )}

        {/* Goal bracket */}
        {row.kind === 'goal' && (
          <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-px rounded-full" style={{ backgroundColor: row.color + '40' }} />
        )}

        {/* Bar */}
        {bar && bst && (
          <div
            className="absolute rounded cursor-pointer overflow-hidden flex items-center group/bar transition-all"
            style={{
              left:            bar.x,
              width:           bar.w,
              top:             row.kind === 'goal' ? '20%' : '15%',
              height:          row.kind === 'goal' ? '60%' : '70%',
              backgroundColor: isRollupBar ? row.color + '10' : bst.dashed ? row.color + '18' : row.color,
              borderColor:     isRollupBar ? row.color + '88' : row.color,
              borderWidth:     isRollupBar ? 1 : bst.dashed ? 2 : 0,
              borderStyle:     isRollupBar ? 'solid' : bst.dashed ? 'dashed' : 'none',
              opacity:         isRollupBar ? 1 : bst.opacity,
              boxShadow:       isRollupBar || bst.dashed ? 'none' : '0 1px 3px rgba(0,0,0,0.15)',
            }}
            onDoubleClick={() => onBarDblClick(row)}
            title={[
              row.label,
              isRollupBar && 'rollup from child tasks',
              !isRollupBar && row.task?.start_date && `start ${row.task.start_date.slice(0,10)}`,
              !isRollupBar && row.effectiveDueDate && (row.inheritedDueDate
                ? `due ${row.effectiveDueDate.slice(0,10)} from parent`
                : `due ${row.effectiveDueDate.slice(0,10)}`),
              row.task?.estimated_minutes && `est ${Math.round(row.task.estimated_minutes / 60)}h`,
            ].filter(Boolean).join(' · ')}
          >
            {/* Progress fill for in_progress */}
            {!isRollupBar && bar.status === 'in_progress' && fillPct > 0 && (
              <div className="absolute left-0 top-0 bottom-0 bg-white/20 pointer-events-none" style={{ width: `${fillPct}%` }} />
            )}
            {/* Done stripe overlay */}
            {!isRollupBar && bar.status === 'done' && (
              <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.5) 4px, rgba(255,255,255,0.5) 6px)' }} />
            )}
            {bar.clampL && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-black/20 rounded-l" />}
            {bar.clampR && <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-black/20 rounded-r" />}
            {/* Label inside bar */}
            {bar.w > 30 && (
              <span className={`pl-1.5 text-[8px] font-semibold truncate pointer-events-none leading-none select-none ${isRollupBar || bst.dashed ? 'text-gray-600' : 'text-white'}`}>
                {isRollupBar ? 'rollup' : row.task?.estimated_minutes ? `${Math.round(row.task.estimated_minutes / 60)}h` : ''}
              </span>
            )}
            {/* Double-click hint on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none">
              <span className="text-[7px] font-mono bg-black/40 text-white rounded px-1 py-px whitespace-nowrap">dbl-click to set dates</span>
            </div>
          </div>
        )}

        {/* Unscheduled — clickable diamond */}
        {!bar && row.task && inView && !hasGanttSchedule(row.task, row.effectiveDueDate ?? null) && !row.rollupRange && row.showUnscheduledMarker !== false && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 border-2 cursor-pointer hover:scale-125 transition-transform"
            style={{ left: todayX - 6, borderColor: row.color + 'aa', backgroundColor: row.color + '22' }}
            onDoubleClick={() => onBarDblClick(row)}
            title="Unscheduled — double-click to set dates"
          />
        )}
      </div>
    </div>
  );
}

// ── Date edit modal ────────────────────────────────────────────────────────────

function DateModal({ row, onSave, onClose }: {
  row:    GanttRow;
  onSave: (updates: Partial<Pick<DBTask, 'start_date' | 'due_date' | 'scheduling_enabled'>>) => void;
  onClose:() => void;
}) {
  const [start, setStart] = useState(row.task?.start_date?.slice(0, 10) ?? '');
  const [end,   setEnd]   = useState(row.task?.due_date?.slice(0, 10)   ?? '');
  const isLongTerm = row.task?.scheduling_enabled === false;
  const hasChildren = row.hasChildren;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-72" onClick={e => e.stopPropagation()}>
        <p className="text-[11px] font-bold text-gray-800 mb-4 truncate">{row.label}</p>
        {hasChildren && !row.task?.start_date && !row.task?.due_date && row.rollupRange && (
          <p className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-[10px] text-indigo-700">
            This parent is rolling up from child task dates.
          </p>
        )}
        {row.inheritedDueDate && row.effectiveDueDate && (
          <p className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-2 text-[10px] text-indigo-700">
            This task is following its parent due date ({row.effectiveDueDate.slice(0, 10)}). Set an explicit due date here to override it.
          </p>
        )}
        {isLongTerm && (
          <p className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-700">
            Long-term mode is on. This task stays out of schedule auto-planning.
          </p>
        )}
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wide">Start</span>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-[#4648d4] transition-colors" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-mono text-gray-400 uppercase tracking-wide">Due</span>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-[#4648d4] transition-colors" />
          </label>
        </div>
        <div className="mt-4 space-y-2">
          <button
            onClick={() => onSave({ start_date: start || null, due_date: end || null, scheduling_enabled: true })}
            className="w-full bg-[#4648d4] text-white text-xs font-bold py-2 rounded-lg hover:bg-[#3436b0] transition-colors">
            Save
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 px-3 py-2 text-xs text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
              Cancel
            </button>
            <button onClick={() => onSave({ start_date: null, due_date: null })} title="Clear dates"
              className="px-3 py-2 text-xs text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors">
              <Minus size={12} />
            </button>
          </div>
          <button
            onClick={() => onSave({ start_date: null, due_date: null, scheduling_enabled: isLongTerm ? true : false })}
            className={`w-full rounded-lg border px-3 py-2 text-[10px] font-semibold transition-colors ${
              isLongTerm
                ? 'border-[#4648d4]/25 text-[#4648d4] hover:bg-[#4648d4]/5'
                : 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
            }`}
          >
            {isLongTerm ? 'Use in schedule again' : hasChildren ? 'Long-term / child rollup' : 'Long-term / no deadline'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Calendar view ─────────────────────────────────────────────────────────────

const CAL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
type CalMode = 'day' | 'week' | 'month';
interface CalEvent {
  dateStr: string;
  task: DBTask;
  color: string;
  goalId: string;
  goalTitle: string;
  inheritedDueDate?: boolean;
  effectiveDueDate?: string | null;
}

// blocked and inactive are treated identically throughout the UI
const normStatus = (s: string) => s === 'blocked' ? 'inactive' : s;

function statusIcon(status: string) {
  const s = normStatus(status);
  return s === 'done' ? '✓' : s === 'in_progress' ? '▶' : s === 'inactive' ? '—' : '○';
}

// Chip style mirrors Gantt bar logic: goal color + status pattern, using rgba not CSS opacity.
function chipStyle(status: string, color: string): React.CSSProperties {
  const s   = normStatus(status);
  const hex = (a: number) => color + Math.round(a * 255).toString(16).padStart(2, '0');
  switch (s) {
    case 'in_progress': return { backgroundColor: color, color: '#fff' };
    case 'done':        return { backgroundColor: hex(0.45), color: '#fff' };
    case 'inactive':    return { backgroundColor: hex(0.22), color: '#fff' };
    default:            return { backgroundColor: hex(0.10), border: `1.5px dashed ${color}aa`, color };
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = normStatus(status);
  return (
    <span className={`inline-flex text-[9px] font-mono px-1.5 py-0.5 rounded
      ${s === 'done'        ? 'bg-emerald-50 text-emerald-600' :
        s === 'in_progress' ? 'bg-[#4648d4]/10 text-[#4648d4]' :
        s === 'inactive'    ? 'bg-amber-50 text-amber-500' : 'bg-gray-100 text-gray-400'}`}>
      {statusIcon(s)} {s.replace('_', ' ')}
    </span>
  );
}

function CalChip({ evt, onClick }: { evt: CalEvent; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold truncate hover:opacity-75 transition-opacity relative overflow-hidden"
      style={chipStyle(evt.task.status, evt.color)}
    >
      {evt.task.status === 'done' && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(255,255,255,0.35) 3px,rgba(255,255,255,0.35) 5px)' }} />
      )}
      <span className="shrink-0 text-[8px]">{statusIcon(evt.task.status)}</span>
      <span className="truncate">{evt.task.title}</span>
    </button>
  );
}

function CalendarView({
  goals, selected, tasksByGoal, meetings, onEditDates,
}: {
  goals:        DBGoal[];
  selected:     Set<string>;
  tasksByGoal:  Record<string, DBTask[]>;
  meetings:     DBMeeting[];
  onEditDates:  (task: DBTask, color: string) => void;
}) {
  const { navigateToGoal, setFocusedTaskId } = useAppStore();
  const [calMode, setCalMode] = useState<CalMode>('month');
  const [curDate, setCurDate] = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [popTask, setPopTask] = useState<CalEvent | null>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const allEvents = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];
    goals.forEach((g, gi) => {
      if (!selected.has(g.id)) return;
      const color = GOAL_COLORS[gi % GOAL_COLORS.length];
      const tasks = tasksByGoal[g.id] ?? [];
      for (const t of tasks) {
        const effectiveDueDate = getEffectiveTaskDueDate(t, tasks);
        const inheritedDueDate = getInheritedTaskDueDate(t, tasks) !== null;
        if (effectiveDueDate) {
          out.push({ dateStr: effectiveDueDate.slice(0, 10), task: t, color, goalId: g.id, goalTitle: g.title, inheritedDueDate, effectiveDueDate });
        }
        if (t.start_date && t.start_date.slice(0,10) !== effectiveDueDate?.slice(0,10))
          out.push({ dateStr: t.start_date.slice(0,10), task: t, color, goalId: g.id, goalTitle: g.title });
      }
    });
    return out;
  }, [goals, selected, tasksByGoal]);

  const toLocalYMD = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const eventsOn = (d: Date) => allEvents.filter(e => e.dateStr === toLocalYMD(d));

  const meetingsOn = (d: Date) => meetings.filter(m => {
    if (!selected.has(m.goal_id ?? '')) return false;
    return m.scheduled_at.slice(0, 10) === toLocalYMD(d);
  });

  const nav = (dir: number) => setCurDate(d => {
    const n = new Date(d);
    if (calMode === 'day')   n.setDate(d.getDate()   + dir);
    if (calMode === 'week')  n.setDate(d.getDate()   + dir * 7);
    if (calMode === 'month') n.setMonth(d.getMonth() + dir);
    return n;
  });

  const periodLabel = useMemo(() => {
    if (calMode === 'day')
      return curDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (calMode === 'week') {
      const mon = new Date(curDate); mon.setDate(curDate.getDate() - ((curDate.getDay() + 6) % 7));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      return `${mon.toLocaleDateString('en-US',{ month:'short', day:'numeric' })} – ${sun.toLocaleDateString('en-US',{ month:'short', day:'numeric', year:'numeric' })}`;
    }
    return curDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calMode, curDate]);

  // Month grid
  const monthWeeks = useMemo(() => {
    const y = curDate.getFullYear(), m = curDate.getMonth();
    const first = new Date(y, m, 1);
    const last  = new Date(y, m + 1, 0);
    const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const ws: Date[][] = []; let cur = new Date(start);
    while (cur <= last || ws.length < 4) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
      ws.push(week);
      if (cur > last && ws.length >= 4) break;
    }
    return ws;
  }, [curDate]);

  // Week columns (Mon–Sun of curDate's week)
  const weekDays = useMemo(() => {
    const mon = new Date(curDate); mon.setDate(curDate.getDate() - ((curDate.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  }, [curDate]);

  // ── Sub-toolbar ───────────────────────────────────────────────────────────
  const toolbar = (
    <div className="shrink-0 flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-white flex-wrap">
      <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
        {(['day','week','month'] as CalMode[]).map(m => (
          <button key={m} onClick={() => setCalMode(m)}
            className={`px-3 py-1 rounded-md text-[10px] font-bold capitalize transition-all ${
              calMode === m ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}>{m}</button>
        ))}
      </div>
      <button onClick={() => nav(-1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"><ChevronLeft size={14}/></button>
      <h2 className="text-sm font-bold text-gray-800 flex-1 text-center min-w-0 truncate">{periodLabel}</h2>
      <button onClick={() => nav(1)}  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"><ChevronRight size={14}/></button>
      <button onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setCurDate(d); }}
        className="text-[10px] font-mono text-gray-400 hover:text-[#4648d4] px-2 py-1 rounded hover:bg-indigo-50 transition-colors shrink-0">
        Today
      </button>
    </div>
  );

  // ── Task popover ──────────────────────────────────────────────────────────
  const popover = popTask && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setPopTask(null)}>
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5 w-76 max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-2.5 mb-4">
          <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: popTask.color }} />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-gray-800 leading-tight truncate">{popTask.task.title}</p>
            <p className="text-[9px] text-gray-400 font-mono mt-0.5">{popTask.goalTitle}</p>
          </div>
          <button onClick={() => setPopTask(null)} className="text-gray-300 hover:text-gray-500 shrink-0 text-sm">✕</button>
        </div>

        <div className="space-y-1 mb-4">
          <StatusBadge status={popTask.task.status} />
          {popTask.task.start_date && <p className="text-[10px] text-gray-500 font-mono">Start: {popTask.task.start_date.slice(0,10)}</p>}
          {(popTask.effectiveDueDate ?? popTask.task.due_date) && (
            <p className="text-[10px] text-gray-500 font-mono">
              Due: {(popTask.effectiveDueDate ?? popTask.task.due_date)!.slice(0,10)}{popTask.inheritedDueDate ? ' from parent' : ''}
            </p>
          )}
          {popTask.task.estimated_minutes && (
            <p className="text-[10px] text-gray-500 font-mono">Est: {Math.round(popTask.task.estimated_minutes / 60)}h
              {popTask.task.actual_minutes ? ` · done ${Math.round(popTask.task.actual_minutes / 60)}h` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => { navigateToGoal(popTask.goalId); setPopTask(null); }}
            className="w-full text-left text-[10px] font-semibold text-gray-700 border border-gray-200 rounded-lg py-2 px-3 hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <span>🎯</span> Open in Goals
          </button>
          <button
            onClick={() => { navigateToGoal(popTask.goalId); setFocusedTaskId(popTask.task.id); setPopTask(null); }}
            className="w-full text-left text-[10px] font-semibold text-gray-700 border border-gray-200 rounded-lg py-2 px-3 hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <span>📋</span> Open Task Page
          </button>
          <button
            onClick={() => { onEditDates(popTask.task, popTask.color); setPopTask(null); }}
            className="w-full text-left text-[10px] font-semibold text-[#4648d4] border border-[#4648d4]/25 rounded-lg py-2 px-3 hover:bg-[#4648d4]/5 transition-colors flex items-center gap-2"
          >
            <span>📅</span> Edit Dates
          </button>
        </div>
      </div>
    </div>
  );

  // ── Day view ──────────────────────────────────────────────────────────────
  const dayView = (() => {
    const evts = eventsOn(curDate);
    const mts  = meetingsOn(curDate);
    const isToday = curDate.toDateString() === today.toDateString();
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0
              ${isToday ? 'bg-[#4648d4] text-white' : 'bg-gray-100 text-gray-700'}`}>
              {curDate.getDate()}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">{curDate.toLocaleDateString('en-US', { weekday: 'long' })}</p>
              <p className="text-[10px] text-gray-400 font-mono">{curDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
            {(evts.length + mts.length) > 0 && <span className="ml-auto text-[10px] text-gray-400 font-mono">{evts.length + mts.length} item{(evts.length + mts.length) !== 1 ? 's' : ''}</span>}
          </div>
          {mts.length > 0 && (
            <div className="mb-3 space-y-2">
              {mts.map(m => (
                <div key={m.id} className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/5 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-400 text-base">⚑</div>
                  <div>
                    <p className="text-[11px] font-bold text-amber-700">{m.title}</p>
                    <p className="text-[10px] font-mono text-amber-500 mt-0.5">
                      {new Date(m.scheduled_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      {m.location ? ` · ${m.location}` : ''}
                    </p>
                    {m.notes && <p className="text-[10px] text-gray-500 mt-0.5">{m.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {evts.length === 0 && mts.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-10 text-center">No tasks on this day</p>
          ) : evts.length === 0 ? null : (
            <div className="space-y-2">
              {evts.map((evt, i) => (
                <button key={`${evt.task.id}-${i}`}
                  onClick={() => setPopTask(evt)}
                  className="w-full text-left border border-gray-100 rounded-xl p-3 hover:border-gray-200 hover:shadow-sm transition-all relative overflow-hidden"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: evt.color }} />
                  <div className="pl-3">
                    <div className="flex items-start gap-2">
                      <p className="text-[11px] font-semibold text-gray-800 flex-1 leading-tight">{evt.task.title}</p>
                      <StatusBadge status={evt.task.status} />
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1 font-mono">{evt.goalTitle}</p>
                    {evt.task.estimated_minutes && (
                      <p className="text-[9px] text-gray-400 font-mono">Est: {Math.round(evt.task.estimated_minutes / 60)}h</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  })();

  // ── Week view ─────────────────────────────────────────────────────────────
  const weekView = (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="shrink-0 grid grid-cols-7 border-b border-gray-200">
        {weekDays.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString();
          return (
            <div key={i} className={`py-2 text-center border-r border-gray-100 last:border-0 ${isToday ? 'bg-indigo-50/40' : ''}`}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-gray-400">{CAL_DAYS[i]}</p>
              <div className={`mx-auto mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold
                ${isToday ? 'bg-[#4648d4] text-white' : 'text-gray-600'}`}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-7 min-h-full">
          {weekDays.map((d, di) => {
            const isToday = d.toDateString() === today.toDateString();
            const evts = eventsOn(d);
            const mts  = meetingsOn(d);
            return (
              <div key={di} className={`border-r border-gray-100 last:border-0 p-1.5 min-h-[420px] ${isToday ? 'bg-indigo-50/20' : ''}`}>
                <div className="space-y-0.5">
                  {mts.map(m => (
                    <div key={m.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 border border-amber-500/30">
                      <span>⚑</span>
                      <span className="truncate">{m.title}</span>
                      <span className="ml-auto shrink-0 text-amber-500/70">{new Date(m.scheduled_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                  {evts.slice(0, 10).map((evt, ei) => (
                    <CalChip key={`${evt.task.id}-${ei}`} evt={evt}
                      onClick={() => setPopTask(evt)} />
                  ))}
                  {evts.length > 10 && <p className="text-[8px] text-gray-400 pl-1">+{evts.length - 10} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Month view ────────────────────────────────────────────────────────────
  const monthView = (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="shrink-0 grid grid-cols-7 border-b border-gray-200">
        {CAL_DAYS.map(d => (
          <div key={d} className={`py-2 text-center text-[10px] font-bold uppercase tracking-wide
            ${d === 'Sat' || d === 'Sun' ? 'text-gray-300' : 'text-gray-400'}`}>{d}</div>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateRows: `repeat(${monthWeeks.length}, minmax(90px, 1fr))` }}>
          {monthWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-gray-100">
              {week.map((day, di) => {
                const isToday   = day.toDateString() === today.toDateString();
                const otherMon  = day.getMonth() !== curDate.getMonth();
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                const evts = eventsOn(day);
                const mts  = meetingsOn(day);
                return (
                  <div key={di} className={`border-r border-gray-100 last:border-0 p-1.5
                    ${otherMon ? 'bg-gray-50/60' : isWeekend ? 'bg-gray-50/30' : 'bg-white'}`}>
                    <div className="mb-1">
                      <span className={`text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full leading-none
                        ${isToday ? 'bg-[#4648d4] text-white' : otherMon ? 'text-gray-300' : isWeekend ? 'text-gray-400' : 'text-gray-700'}`}>
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {mts.map(m => (
                        <div key={m.id} className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-600 border border-amber-500/30 truncate">
                          <span className="shrink-0">⚑</span>
                          <span className="truncate">{m.title}</span>
                        </div>
                      ))}
                      {evts.slice(0, 4).map((evt, ei) => (
                        <CalChip key={`${evt.task.id}-${ei}`} evt={evt}
                          onClick={() => setPopTask(evt)} />
                      ))}
                      {evts.length > 4 && <p className="text-[8px] text-gray-400 pl-1">+{evts.length - 4} more</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full select-none">
      {toolbar}
      {calMode === 'day'   && dayView}
      {calMode === 'week'  && weekView}
      {calMode === 'month' && monthView}
      {popover}
    </div>
  );
}

// ── FilterPanel ───────────────────────────────────────────────────────────────

const STATUS_HIDE_OPTIONS = [
  { key: 'done',     icon: '✓', label: 'Done'     },
  { key: 'inactive', icon: '—', label: 'Inactive' },
  { key: 'todo',     icon: '○', label: 'To Do'    },
] as const;

function FilterPanel({
  hideStatuses, onToggleStatus,
  hideUnscheduled, onToggleUnscheduled,
  hiddenIds, allTasksById,
  onUnhide, onUnhideAll, onClose,
}: {
  hideStatuses:   Set<string>;
  onToggleStatus: (s: string) => void;
  hideUnscheduled: boolean;
  onToggleUnscheduled: () => void;
  hiddenIds:      Set<string>;
  allTasksById:   Map<string, DBTask>;
  onUnhide:       (id: string) => void;
  onUnhideAll:    () => void;
  onClose:        () => void;
}) {
  const hiddenList  = [...hiddenIds].filter(id => allTasksById.has(id));
  const totalActive = hiddenList.length + hideStatuses.size + (hideUnscheduled ? 1 : 0);

  return (
    <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-60 p-3.5" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-gray-700 uppercase tracking-wider">Filters</p>
        <div className="flex items-center gap-2">
          {totalActive > 0 && (
            <button onClick={onUnhideAll} className="text-[9px] text-[#4648d4] font-semibold hover:underline">
              Reset all
            </button>
          )}
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-sm">✕</button>
        </div>
      </div>

      {/* Status-based auto-hide */}
      <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-2">Hide by status</p>
      <div className="flex flex-wrap gap-1 mb-4">
        {STATUS_HIDE_OPTIONS.map(opt => {
          const on = hideStatuses.has(opt.key);
          return (
            <button
              key={opt.key}
              onClick={() => onToggleStatus(opt.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-semibold border transition-all ${
                on
                  ? 'bg-gray-800 text-white border-gray-800 shadow-sm'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              <span>{opt.icon}</span> {opt.label}
              {on && <span className="ml-0.5 opacity-60">×</span>}
            </button>
          );
        })}
      </div>

      <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-2">Planning</p>
      <button
        type="button"
        role="switch"
        aria-checked={hideUnscheduled}
        onClick={onToggleUnscheduled}
        className={`mb-4 flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left transition-all ${
          hideUnscheduled
            ? 'border-[#4648d4]/30 bg-[#4648d4]/5'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <span className="flex items-center gap-2">
          <span className={`h-3 w-3 rotate-45 border-2 ${hideUnscheduled ? 'border-[#4648d4] bg-[#4648d4]/10' : 'border-gray-300 bg-gray-50'}`} />
            <span>
              <span className="block text-[10px] font-semibold text-gray-700">Hide unscheduled</span>
            <span className="block text-[8px] font-mono text-gray-400">No start or due date</span>
            </span>
        </span>
        <span className={`relative h-4 w-7 rounded-full transition-colors ${hideUnscheduled ? 'bg-[#4648d4]' : 'bg-gray-200'}`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${hideUnscheduled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
        </span>
      </button>

      {/* Manually hidden rows */}
      {hiddenList.length > 0 ? (
        <>
          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Hidden rows ({hiddenList.length})
          </p>
          <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
            {hiddenList.map(id => {
              const task = allTasksById.get(id)!;
              return (
                <div key={id} className="flex items-center gap-2 py-1 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                  <span className="text-[9px] text-gray-600 flex-1 truncate min-w-0">{task.title}</span>
                  <button
                    onClick={() => onUnhide(id)}
                    className="shrink-0 flex items-center gap-0.5 text-[8px] text-[#4648d4] font-semibold hover:underline opacity-0 group-hover/item:opacity-100 transition-opacity"
                  >
                    <Eye size={9} /> show
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        totalActive === 0 && (
          <p className="text-[9px] text-gray-400 italic text-center py-1">No active filters</p>
        )
      )}
    </div>
  );
}

// ── Meeting flag markers row ──────────────────────────────────────────────────
function MeetingFlagsRow({
  meetings,
  viewStart,
  cellW,
  range,
  goalColors,
}: {
  meetings: DBMeeting[];
  viewStart: Date;
  cellW: number;
  range: number;
  goalColors: Record<string, string>;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const viewEnd = new Date(viewStart);
  viewEnd.setDate(viewStart.getDate() + range);

  const visible = meetings.filter(m => {
    const d = new Date(m.scheduled_at);
    return d >= viewStart && d < viewEnd;
  });

  if (visible.length === 0) return null;

  return (
    <div className="relative flex" style={{ height: 32 }}>
      {/* frozen label cell */}
      <div
        className="sticky left-0 z-20 shrink-0 bg-[#0f0f1a] flex items-center px-3"
        style={{ width: LEFT_W, minWidth: LEFT_W }}
      >
        <span className="text-[10px] font-mono text-amber-400/70 uppercase tracking-wider">Meetings</span>
      </div>
      {/* timeline area */}
      <div className="relative flex-1" style={{ minWidth: range * cellW }}>
        {visible.map(m => {
          const dt = new Date(m.scheduled_at);
          const dayOffset = Math.floor((dt.getTime() - viewStart.getTime()) / 86400000);
          const x = dayOffset * cellW;
          const color = m.goal_id ? (goalColors[m.goal_id] ?? '#f59e0b') : '#f59e0b';
          const isHovered = hoveredId === m.id;
          const timeStr = dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          const dateStr = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return (
            <div
              key={m.id}
              className="absolute top-0 bottom-0 flex flex-col items-center"
              style={{ left: x, width: Math.max(cellW, 16), zIndex: isHovered ? 30 : 10 }}
              onMouseEnter={() => setHoveredId(m.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* flag icon */}
              <div
                className="mt-1 cursor-pointer flex items-center justify-center rounded"
                style={{
                  width: 16, height: 16,
                  backgroundColor: color + '33',
                  border: `1.5px solid ${color}88`,
                }}
              >
                <span style={{ fontSize: 9, color }}>⚑</span>
              </div>
              {/* vertical line */}
              <div className="flex-1 w-[1.5px]" style={{ backgroundColor: color + '55' }} />
              {/* tooltip */}
              {isHovered && (
                <div
                  className="absolute top-8 left-1/2 -translate-x-1/2 bg-[#1a1a2e] border border-gray-700 rounded-lg p-2.5 shadow-xl whitespace-nowrap z-50"
                  style={{ minWidth: 160 }}
                >
                  <p className="text-xs font-semibold text-white mb-0.5">{m.title}</p>
                  <p className="text-[10px] font-mono" style={{ color }}>{dateStr} · {timeStr}</p>
                  {m.location && <p className="text-[10px] text-gray-400 mt-0.5">📍 {m.location}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── GanttView ─────────────────────────────────────────────────────────────────

export function GanttView({ embedded = false }: { embedded?: boolean } = {}) {
  const [goals,       setGoals]       = useState<DBGoal[]>([]);
  const [meetings,    setMeetings]    = useState<DBMeeting[]>([]);
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [tasksByGoal, setTasksByGoal] = useState<Record<string, DBTask[]>>({});
  const [collapsed,     setCollapsed]     = useState<Set<string>>(new Set());
  const [editRow,       setEditRow]       = useState<GanttRow | null>(null);
  const [zoom,          setZoom]          = useState<ZoomMode>('week');
  const [viewMode,      setViewMode]      = useState<'gantt' | 'calendar'>('gantt');
  const [hiddenIds,     setHiddenIds]     = useState<Set<string>>(new Set());
  const [hideStatuses,  setHideStatuses]  = useState<Set<string>>(new Set());
  const [hideUnscheduled, setHideUnscheduled] = useState(false);
  const [showFilters,   setShowFilters]   = useState(false);
  const filterBtnRef = useRef<HTMLDivElement>(null);

  const cfg = ZOOM[zoom];

  const [viewStart, setViewStart] = useState<Date>(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ZOOM.week.back); return d;
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: MouseEvent) => {
      if (filterBtnRef.current && !filterBtnRef.current.contains(e.target as Node))
        setShowFilters(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilters]);

  // ── Data loading ──
  useEffect(() => {
    getGoals().then(gs => {
      const active = gs.filter(g => !g.archived_at);
      setGoals(active);
      setSelected(new Set(active.map(g => g.id)));
    });
    getAllMeetings().then(setMeetings);
  }, []);

  const selectedKey = JSON.stringify([...selected].sort());
  useEffect(() => {
    const ids = [...selected];
    if (!ids.length) return;
    Promise.all(ids.map(id => getTasksByGoal(id).then(t => [id, t] as const)))
      .then(pairs => setTasksByGoal(Object.fromEntries(pairs)));
  }, [selectedKey]);

  // ── Derived ──
  const allTasksById = useMemo(() => {
    const m = new Map<string, DBTask>();
    for (const tasks of Object.values(tasksByGoal)) for (const t of tasks) m.set(t.id, t);
    return m;
  }, [tasksByGoal]);

  const rows = useMemo(
    () => buildRows(goals, selected, tasksByGoal, collapsed, hiddenIds, hideStatuses, hideUnscheduled),
    [goals, selected, tasksByGoal, collapsed, hiddenIds, hideStatuses, hideUnscheduled],
  );

  const goalColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    goals.forEach((g, i) => { m[g.id] = GOAL_COLORS[i % GOAL_COLORS.length]; });
    return m;
  }, [goals]);

  const filterBadge = hiddenIds.size + hideStatuses.size + (hideUnscheduled ? 1 : 0);

  // Human-readable label of the currently visible range
  const rangeLabel = useMemo(() => {
    const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
      d.toLocaleDateString('en-US', opts);
    const end = new Date(viewStart);
    end.setDate(viewStart.getDate() + cfg.range - 1);
    if (zoom === 'day')
      return `${fmt(viewStart, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    if (zoom === 'week')
      return `${fmt(viewStart, { month: 'short', year: 'numeric' })} – ${fmt(end, { month: 'short', year: 'numeric' })}`;
    return `${fmt(viewStart, { month: 'short', year: 'numeric' })} – ${fmt(end, { month: 'short', year: 'numeric' })}`;
  }, [viewStart, cfg, zoom]);

  const days = useMemo(() =>
    Array.from({ length: cfg.range }, (_, i) => {
      const d = new Date(viewStart); d.setDate(viewStart.getDate() + i); return d;
    }),
    [viewStart, cfg.range],
  );

  // ── Actions ──
  const shift = (n: number) =>
    setViewStart(v => { const d = new Date(v); d.setDate(v.getDate() + n * cfg.shift); return d; });

  const goToday = () =>
    setViewStart(() => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - cfg.back); return d; });

  const handleZoom = (z: ZoomMode) => {
    setZoom(z);
    // Re-anchor so today stays roughly in view
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ZOOM[z].back);
    setViewStart(d);
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const hideRow = (id: string) =>
    setHiddenIds(s => { const n = new Set(s); n.add(id); return n; });
  const unhideRow = (id: string) =>
    setHiddenIds(s => { const n = new Set(s); n.delete(id); return n; });
  const toggleHideStatus = (st: string) =>
    setHideStatuses(s => { const n = new Set(s); n.has(st) ? n.delete(st) : n.add(st); return n; });
  const resetAllFilters = () => { setHiddenIds(new Set()); setHideStatuses(new Set()); setHideUnscheduled(false); };

  const toggleGoal = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handlePlanningSave = async (
    row: GanttRow,
    updates: Partial<Pick<DBTask, 'start_date' | 'due_date' | 'scheduling_enabled'>>,
  ) => {
    if (!row.task) return;
    await updateTask(row.task.id, updates);
    const goalId = row.task.goal_id;
    if (goalId) {
      const updated = await getTasksByGoal(goalId);
      setTasksByGoal(prev => ({ ...prev, [goalId]: updated }));
    }
    setEditRow(null);
  };

  return (
    <div className={`flex flex-col overflow-hidden bg-white ${embedded ? 'h-full min-h-[640px] rounded-xl border border-gray-200' : 'h-screen'}`}>

      {/* ── Top bar ── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-5 py-2.5 flex items-center gap-3 flex-wrap">

        {/* Mode toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
          <button
            onClick={() => setViewMode('gantt')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
              viewMode === 'gantt' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="text-[12px]">▤</span> Gantt
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${
              viewMode === 'calendar' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="text-[12px]">🗓</span> Calendar
          </button>
        </div>

        <div className="w-px h-4 bg-gray-200 shrink-0" />

        {/* Goal chips */}
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {goals.map((g, gi) => {
            const color = GOAL_COLORS[gi % GOAL_COLORS.length];
            const on    = selected.has(g.id);
            return (
              <button
                key={g.id}
                onClick={() => toggleGoal(g.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                  on ? 'text-white border-transparent' : 'border-gray-200 text-gray-400 bg-white hover:border-gray-300 hover:text-gray-600'
                }`}
                style={on ? { backgroundColor: color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: on ? 'rgba(255,255,255,0.6)' : color }} />
                {g.title}
              </button>
            );
          })}
          {goals.length === 0 && <span className="text-[10px] text-gray-400 italic">No active goals</span>}
        </div>

        {/* ── Filter button (Gantt only) ── */}
        {viewMode === 'gantt' && (
          <div ref={filterBtnRef} className="relative shrink-0">
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-all ${
                filterBadge > 0
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              <SlidersHorizontal size={11} />
              Filters
              {filterBadge > 0 && (
                <span className="bg-white text-gray-800 rounded-full text-[8px] font-bold w-4 h-4 flex items-center justify-center leading-none">
                  {filterBadge}
                </span>
              )}
            </button>

            {showFilters && (
              <FilterPanel
                hideStatuses={hideStatuses}
                onToggleStatus={toggleHideStatus}
                hideUnscheduled={hideUnscheduled}
                onToggleUnscheduled={() => setHideUnscheduled(v => !v)}
                hiddenIds={hiddenIds}
                allTasksById={allTasksById}
                onUnhide={unhideRow}
                onUnhideAll={resetAllFilters}
                onClose={() => setShowFilters(false)}
              />
            )}
          </div>
        )}

      </div>

      {/* ── Gantt control bar ── */}
      {viewMode === 'gantt' && (
        <div className="shrink-0 border-b border-gray-200 bg-white px-5 py-2 flex items-center gap-3">
          {/* Zoom pills */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 shrink-0">
            {(['day', 'week', 'month'] as ZoomMode[]).map(z => (
              <button key={z} onClick={() => handleZoom(z)}
                className={`px-3 py-1 rounded-md text-[10px] font-bold capitalize transition-all ${
                  zoom === z ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                }`}>{z}</button>
            ))}
          </div>

          <div className="w-px h-4 bg-gray-200 shrink-0" />

          {/* Nav */}
          <button onClick={() => shift(-1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors shrink-0">
            <ChevronLeft size={14} />
          </button>
          <span className="text-[11px] font-semibold text-gray-600 min-w-[180px] text-center shrink-0">{rangeLabel}</span>
          <button onClick={() => shift(1)}  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 transition-colors shrink-0">
            <ChevronRight size={14} />
          </button>

          <button onClick={goToday}
            className="text-[10px] font-semibold text-[#4648d4] border border-[#4648d4]/25 px-3 py-1 rounded-lg hover:bg-[#4648d4]/5 transition-colors shrink-0">
            Today
          </button>
        </div>
      )}

      {/* ── Legend strip (Gantt only) ── */}
      {viewMode === 'gantt' && (
        <div className="shrink-0 border-b border-gray-100 bg-gray-50/60 px-5 py-1.5 flex items-center gap-4 flex-wrap">
          {LEGEND_ITEMS.map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="relative w-6 h-3 rounded-sm shrink-0 overflow-hidden" style={item.swatchStyle}>
                {item.stripe && (
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <pattern id={`leg-${item.label}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(255,255,255,0.5)" strokeWidth="2" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#leg-${item.label})`} />
                  </svg>
                )}
              </div>
              <span className="text-[9px] text-gray-500 font-mono">{item.icon} {item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 ml-1">
            <div className="w-3 h-3 rotate-45 border-2 border-gray-400 bg-gray-100 shrink-0" />
            <span className="text-[9px] text-gray-500 font-mono">◇ Unscheduled</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-6 rounded-sm border border-[#4648d4]/50 bg-[#4648d4]/10 shrink-0" />
            <span className="text-[9px] text-gray-500 font-mono">Rollup from children</span>
          </div>
          <span className="ml-auto text-[9px] text-gray-400 font-mono hidden lg:block">Double-click any bar or ◇ to set dates</span>
        </div>
      )}

      {/* ── Calendar view ── */}
      {viewMode === 'calendar' && (
        <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <CalendarView
            goals={goals}
            selected={selected}
            tasksByGoal={tasksByGoal}
            meetings={meetings}
            onEditDates={(task, color) => {
              const fakeRow: GanttRow = {
                kind: 'task', id: task.id, label: task.title,
                depth: 1, color, hasChildren: false, task,
                effectiveDueDate: getEffectiveTaskDueDate(task, tasksByGoal[task.goal_id ?? ''] ?? []),
                inheritedDueDate: getInheritedTaskDueDate(task, tasksByGoal[task.goal_id ?? ''] ?? []) !== null,
              };
              setEditRow(fakeRow);
            }}
          />
        </div>
      )}

      {/* ── Gantt body ── */}
      {viewMode === 'gantt' && (
      <div ref={containerRef} className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        <div style={{ minWidth: LEFT_W + cfg.range * cfg.cellW }}>

          <DateHeader
            zoom={zoom}
            days={days}
            cellW={cfg.cellW}
            range={cfg.range}
          />

          <MeetingFlagsRow
            meetings={meetings.filter(m => selected.has(m.goal_id ?? ''))}
            viewStart={viewStart}
            cellW={cfg.cellW}
            range={cfg.range}
            goalColors={goalColorMap}
          />

          {rows.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400 italic">
              Select goals above to see their tasks here
            </div>
          ) : (
            rows.map(row => (
              <GanttRowEl
                key={row.id}
                row={row}
                days={days}
                viewStart={viewStart}
                cellW={cfg.cellW}
                range={cfg.range}
                isCollapsed={collapsed.has(row.id)}
                onToggle={() => toggleCollapsed(row.id)}
                onBarDblClick={r => setEditRow(r)}
                onHide={hideRow}
              />
            ))
          )}
        </div>
      </div>
      )}

      {/* ── Date modal (Gantt + Calendar "Edit Dates") ── */}
      {editRow?.task && (
        <DateModal
          row={editRow}
          onSave={updates => handlePlanningSave(editRow, updates)}
          onClose={() => setEditRow(null)}
        />
      )}
    </div>
  );
}
