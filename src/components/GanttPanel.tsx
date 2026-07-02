import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DBTask, DBResource } from '../db/schema';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86_400_000;
const WORKDAY_MINUTES = 480; // 8 h

function getWeekDays(offset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysFromMon = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMon + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function weekLabel(days: Date[]): string {
  const s = days[0]; const e = days[6];
  if (s.getMonth() === e.getMonth())
    return `${s.toLocaleDateString('en-US', { month: 'short' })} ${s.getDate()}–${e.getDate()}`;
  return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function todayPct(days: Date[]): number | null {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const wStart = days[0].getTime();
  const wEnd   = new Date(days[6]); wEnd.setHours(23, 59, 59, 999);
  if (now < days[0] || now > wEnd) return null;
  return ((now.getTime() - wStart) / (wEnd.getTime() - wStart)) * 100;
}

interface Bar { left: number; width: number; overflowLeft: boolean; overflowRight: boolean }

function computeBar(task: DBTask, days: Date[]): Bar | null {
  const wStart = days[0].getTime();
  const wEnd   = (() => { const d = new Date(days[6]); d.setHours(23, 59, 59, 999); return d.getTime(); })();
  const wMs    = wEnd - wStart;

  const due    = task.due_date ? new Date(task.due_date).getTime() : null;
  const estMs  = task.estimated_minutes ? (task.estimated_minutes / WORKDAY_MINUTES) * DAY_MS : null;
  const now    = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();

  let bStart: number, bEnd: number;

  if (due && estMs)       { bEnd = due;          bStart = due - estMs; }
  else if (due && !estMs) { bEnd = due;           bStart = due - DAY_MS; }
  else if (!due && estMs) { bStart = now;         bEnd   = now + estMs; }
  else                    { return null; }

  if (bEnd < wStart || bStart > wEnd) return null;

  const cStart = Math.max(bStart, wStart);
  const cEnd   = Math.min(bEnd, wEnd);

  return {
    left:          ((cStart - wStart) / wMs) * 100,
    width:         Math.max(((cEnd - cStart) / wMs) * 100, 1.5),
    overflowLeft:  bStart < wStart,
    overflowRight: bEnd > wEnd,
  };
}

const STATUS_STYLE: Record<string, { bg: string; border: string; text: string; dashed: boolean }> = {
  done:        { bg: 'bg-emerald-100',   border: 'border-emerald-300',  text: 'text-emerald-700', dashed: false },
  in_progress: { bg: 'bg-[#4648d4]',    border: 'border-[#3436b0]',    text: 'text-white',       dashed: false },
  inactive:    { bg: 'bg-amber-50',     border: 'border-amber-300',    text: 'text-amber-600',   dashed: true  },
  blocked:     { bg: 'bg-red-50',       border: 'border-red-300',      text: 'text-red-600',     dashed: true  },
  todo:        { bg: 'bg-gray-100',     border: 'border-gray-300',     text: 'text-gray-500',    dashed: true  },
};

function TaskRow({ task, days, resources, onResourceClick }: {
  task: DBTask;
  days: Date[];
  resources: DBResource[];
  onResourceClick: (r: DBResource) => void;
}) {
  const bar  = computeBar(task, days);
  const sty  = STATUS_STYLE[task.status] ?? STATUS_STYLE.todo;
  const fill = task.estimated_minutes && task.actual_minutes
    ? Math.min(100, (task.actual_minutes / task.estimated_minutes) * 100)
    : 0;
  const tPct = todayPct(days);

  return (
    <div className="flex h-9 items-center border-b border-gray-50 hover:bg-gray-50/60 group/row">
      {/* Label column */}
      <div className="w-[148px] shrink-0 flex items-center gap-1 px-2 min-w-0">
        <span className={`truncate text-[10px] leading-tight flex-1 min-w-0 ${task.completed ? 'line-through text-gray-300' : 'text-gray-700'}`}>
          {task.title}
        </span>
        {resources.slice(0, 2).map(r => (
          <button
            key={r.id}
            onClick={() => onResourceClick(r)}
            title={r.title}
            className="shrink-0 text-[8px] font-mono text-teal-600 bg-teal-50 border border-teal-200 rounded px-1 py-px hover:bg-teal-100 max-w-[38px] truncate"
          >
            @{r.title.split(/[\s-]/)[0]}
          </button>
        ))}
      </div>

      {/* Bar area */}
      <div className="flex-1 relative h-4">
        {/* today line */}
        {tPct !== null && (
          <div className="absolute top-0 bottom-0 w-px bg-indigo-300/70 z-10 pointer-events-none" style={{ left: `${tPct}%` }} />
        )}

        {bar ? (
          <div
            className={`absolute top-0 h-full rounded ${sty.bg} border ${sty.border} ${sty.dashed ? 'border-dashed' : ''} overflow-hidden flex items-center`}
            style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
          >
            {task.status === 'in_progress' && fill > 0 && (
              <div className="absolute left-0 top-0 bottom-0 bg-white/20 pointer-events-none" style={{ width: `${fill}%` }} />
            )}
            {bar.overflowLeft  && <div className="absolute left-0 top-0 bottom-0 w-1 bg-current opacity-20 rounded-l" />}
            {bar.overflowRight && <div className="absolute right-0 top-0 bottom-0 w-1 bg-current opacity-20 rounded-r" />}
            <span className={`pl-1 text-[8px] font-mono truncate relative z-10 ${sty.text}`}>
              {task.estimated_minutes ? `${Math.round(task.estimated_minutes / 60)}h` : ''}
            </span>
          </div>
        ) : (
          tPct !== null && (
            <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-gray-300 bg-white z-20" style={{ left: `calc(${tPct}% - 4px)` }} title="Unscheduled" />
          )
        )}
      </div>
    </div>
  );
}

function MilestoneRow({ ms, days }: { ms: DBTask; days: Date[] }) {
  const bar  = computeBar(ms, days);
  const tPct = todayPct(days);

  return (
    <div className="flex h-8 items-center bg-gray-50/80 border-b border-gray-100 sticky top-0 z-10">
      <div className="w-[148px] shrink-0 px-2 flex items-center gap-1 min-w-0">
        <div className="w-2 h-2 rounded-full bg-[#4648d4]/70 shrink-0" />
        <span className="truncate text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
          {ms.title.length > 18 ? ms.title.slice(0, 17) + '…' : ms.title}
        </span>
      </div>
      <div className="flex-1 relative h-3">
        {tPct !== null && (
          <div className="absolute top-0 bottom-0 w-px bg-indigo-300/70 z-10 pointer-events-none" style={{ left: `${tPct}%` }} />
        )}
        {bar && (
          <div
            className="absolute top-0 h-full rounded-sm bg-[#4648d4]/10 border-t-2 border-b-2 border-[#4648d4]/20"
            style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
          />
        )}
      </div>
    </div>
  );
}

export function GanttPanel({
  tasks,
  taskResources,
  onResourceClick,
}: {
  tasks: DBTask[];
  taskResources: Record<string, DBResource[]>;
  onResourceClick: (r: DBResource) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = getWeekDays(weekOffset);

  const milestones  = tasks.filter(t => t.kind === 'critical_path').sort((a, b) => a.position - b.position);
  const milestoneIds = new Set(milestones.map(m => m.id));
  const byParent    = tasks.reduce<Record<string, DBTask[]>>((acc, t) => {
    if (t.parent_task_id) { (acc[t.parent_task_id] ??= []).push(t); }
    return acc;
  }, {});
  const orphans = tasks.filter(t => !t.parent_task_id && !milestoneIds.has(t.id) && t.kind !== 'next_action');

  const tPct = todayPct(days);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Week header ── */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-2 pt-2 pb-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase text-gray-400 tracking-wider select-none">
            {weekLabel(days)}
          </span>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setWeekOffset(o => o - 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400">
              <ChevronLeft size={11} />
            </button>
            <button onClick={() => setWeekOffset(0)} className="px-1.5 h-5 text-[8px] font-mono text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
              Now
            </button>
            <button onClick={() => setWeekOffset(o => o + 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400">
              <ChevronRight size={11} />
            </button>
          </div>
        </div>

        {/* Day columns header */}
        <div className="flex">
          <div className="w-[148px] shrink-0" />
          <div className="flex-1 grid grid-cols-7">
            {days.map((d, i) => {
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <div key={i} className="text-center flex flex-col items-center">
                  <span className={`text-[8px] font-bold uppercase leading-none ${isToday ? 'text-[#4648d4]' : 'text-gray-400'}`}>
                    {DAY_NAMES[d.getDay()]}
                  </span>
                  <span className={`text-[10px] font-bold leading-tight ${
                    isToday ? 'bg-[#4648d4] text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px]' : 'text-gray-500'
                  }`}>
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Grid column guides ── */}
      <div className="flex-1 overflow-y-auto relative">
        {/* Vertical column dividers */}
        <div className="absolute inset-0 flex pointer-events-none z-0">
          <div className="w-[148px] shrink-0 border-r border-gray-200" />
          <div className="flex-1 grid grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={`border-r border-gray-100 ${days[i]?.toDateString() === new Date().toDateString() ? 'bg-indigo-50/30' : ''}`} />
            ))}
          </div>
        </div>

        {/* Today vertical line */}
        {tPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-[#4648d4]/20 z-10 pointer-events-none"
            style={{ left: `calc(148px + (100% - 148px) * ${tPct / 100})` }}
          />
        )}

        {/* Rows */}
        <div className="relative z-10">
          {milestones.map(ms => (
            <div key={ms.id}>
              <MilestoneRow ms={ms} days={days} />
              {(byParent[ms.id] ?? [])
                .filter(t => t.kind !== 'next_action')
                .sort((a, b) => a.position - b.position)
                .map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    days={days}
                    resources={taskResources[task.id] ?? []}
                    onResourceClick={onResourceClick}
                  />
                ))}
            </div>
          ))}
          {orphans
            .sort((a, b) => a.position - b.position)
            .map(task => (
              <TaskRow
                key={task.id}
                task={task}
                days={days}
                resources={taskResources[task.id] ?? []}
                onResourceClick={onResourceClick}
              />
            ))}
        </div>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-32 text-[11px] text-gray-400 italic">
            No tasks to display
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-2 py-1.5 flex items-center gap-3 flex-wrap">
        {[
          { label: 'In Progress', bg: 'bg-[#4648d4]' },
          { label: 'Done',        bg: 'bg-emerald-200' },
          { label: 'Inactive',    bg: 'bg-amber-100 border border-amber-300 border-dashed' },
          { label: 'Planned',     bg: 'bg-gray-100 border border-gray-300 border-dashed' },
        ].map(({ label, bg }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`w-3 h-2 rounded-sm ${bg}`} />
            <span className="text-[8px] text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
