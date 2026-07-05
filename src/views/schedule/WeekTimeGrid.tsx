import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Check, Link2, Lock, Users } from 'lucide-react';
import type { DBEvent } from '../../db/schema';
import type { DBEventTaskLinkFull } from '../../api/hooks';
import { clampHour, fmtHourLabel, fmtTimeRange, packOverlaps, parseLocalDate, snapHour, type TimedBlock } from '../../utils/calendar';
import { eventCompletion } from '../../utils/eventAutofill';

/**
 * Google-Calendar-style week grid: an hour axis, seven day columns, timed
 * blocks (events + meetings) packed side-by-side when they overlap, a red
 * "now" line, and a sticky header row that carries the all-day cells the
 * parent renders (they stay drag-and-drop day targets).
 */

export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 24;
export const HOUR_PX = 48;
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_PX;
const COLS = 'grid grid-cols-[52px_repeat(7,minmax(0,1fr))]';

const hourToY = (h: number) => (h - GRID_START_HOUR) * HOUR_PX;

const TYPE_STYLES: Record<string, string> = {
  focus:       'bg-[#EEF2FF] border-[#4648d4] text-[#33359c]',
  buffer:      'bg-amber-50 border-amber-400 text-amber-800',
  review:      'bg-emerald-50 border-emerald-500 text-emerald-800',
  admin:       'bg-slate-100 border-slate-400 text-slate-700',
  unavailable: 'bg-gray-100 border-gray-400 text-gray-500',
};

export interface CalendarMeeting {
  id: string;
  title: string;
  date: string;       // ISO YYYY-MM-DD
  startHour: number;  // fractional
  durationHours: number;
}

export interface PlacedEvent {
  event: DBEvent;
  date: string; // resolved date within the displayed week
}

interface WeekTimeGridProps {
  days: string[]; // 7 ISO dates, Monday-first
  events: PlacedEvent[];
  meetings: CalendarMeeting[];
  linksByEvent: Map<string, DBEventTaskLinkFull[]>;
  workStart: number;
  workEnd: number;
  workDays: number[]; // 1=Mon … 7=Sun
  renderAllDayCell: (date: string) => React.ReactNode;
  onSlotClick: (date: string, startHour: number) => void;
  onEventClick: (ev: DBEvent) => void;
  onEventMove: (ev: DBEvent, next: { date: string; start_hour: number }) => void;
  onEventResize: (ev: DBEvent, durationHours: number) => void;
}

function useNowTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function dayHeaderParts(dateStr: string, now: Date) {
  const d = parseLocalDate(dateStr);
  return {
    dow: d.toLocaleDateString('en-US', { weekday: 'short' }),
    dom: d.getDate(),
    isToday: d.toDateString() === now.toDateString(),
  };
}

// ── Interactive event block ───────────────────────────────────────────────────

interface DragState { dy: number; dDay: number; colW: number }

function EventBlock({ placed, dayIdx, pos, links, onClick, onMove, onResize }: {
  placed: PlacedEvent;
  dayIdx: number;
  pos: { col: number; cols: number };
  links: DBEventTaskLinkFull[];
  onClick: (ev: DBEvent) => void;
  onMove: (ev: DBEvent, next: { date: string; start_hour: number; dayIdx: number }) => void;
  onResize: (ev: DBEvent, durationHours: number) => void;
}) {
  const ev = placed.event;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resizeDelta, setResizeDelta] = useState<number | null>(null);
  const gesture = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const duration = Math.max(0.5, ev.duration_hours);
  const start = clampHour(ev.start_hour, GRID_START_HOUR, GRID_END_HOUR - 0.5);
  const completion = eventCompletion(links);
  const style = TYPE_STYLES[(ev.type ?? 'focus').toLowerCase()] ?? TYPE_STYLES.focus;
  const draggable = !ev.locked;

  // Live values while dragging/resizing, snapped for feedback
  const previewStart = drag
    ? clampHour(snapHour(start + drag.dy / HOUR_PX), GRID_START_HOUR, GRID_END_HOUR - duration)
    : start;
  const previewDuration = resizeDelta !== null
    ? Math.max(0.5, snapHour(duration + resizeDelta / HOUR_PX))
    : duration;
  const previewDay = drag ? Math.min(6, Math.max(0, dayIdx + drag.dDay)) : dayIdx;

  const commitPointer = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = { startX: e.clientX, startY: e.clientY, moved: false };
  };

  const onBlockPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    commitPointer(e);
    if (draggable) {
      const colW = (e.currentTarget as HTMLElement).parentElement?.offsetWidth ?? 120;
      setDrag({ dy: 0, dDay: 0, colW });
    }
  };
  const onBlockPointerMove = (e: React.PointerEvent) => {
    if (!gesture.current) return;
    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) gesture.current.moved = true;
    if (drag) setDrag(d => d && { ...d, dy, dDay: Math.round(dx / d.colW) });
  };
  const onBlockPointerUp = () => {
    const moved = gesture.current?.moved;
    gesture.current = null;
    if (!moved) {
      setDrag(null);
      onClick(ev);
      return;
    }
    if (drag) {
      onMove(ev, { date: '', start_hour: previewStart, dayIdx: previewDay });
      setDrag(null);
    }
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    commitPointer(e);
    setResizeDelta(0);
  };
  const onResizePointerMove = (e: React.PointerEvent) => {
    if (!gesture.current || resizeDelta === null) return;
    gesture.current.moved = true;
    setResizeDelta(e.clientY - gesture.current.startY);
  };
  const onResizePointerUp = () => {
    gesture.current = null;
    if (resizeDelta !== null) {
      onResize(ev, previewDuration);
      setResizeDelta(null);
    }
  };

  const top = hourToY(previewStart);
  const height = Math.max(20, Math.min(previewDuration * HOUR_PX, GRID_HEIGHT - top) - 2);
  const linkedTitle = links[0]?.task_title;
  const active = drag !== null || resizeDelta !== null;

  return (
    <div
      onPointerDown={onBlockPointerDown}
      onPointerMove={onBlockPointerMove}
      onPointerUp={onBlockPointerUp}
      onClick={e => e.stopPropagation()}
      className={`absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left shadow-sm select-none touch-none
        ${style}
        ${completion === 'done' ? 'opacity-60' : ''}
        ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
        ${active ? 'z-30 shadow-lg ring-2 ring-[#4648d4]/30' : 'z-10 hover:shadow-md'}`}
      style={{
        top,
        height,
        left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`,
        width: `calc(${100 / pos.cols}% - 4px)`,
        transform: drag && drag.dDay !== 0 ? `translateX(calc(${(previewDay - dayIdx) * 100}% * ${pos.cols}))` : undefined,
      }}
      title={ev.title}
    >
      <p className={`truncate text-[11px] font-semibold leading-tight ${completion === 'done' ? 'line-through' : ''}`}>
        {ev.locked && <Lock size={9} className="mr-0.5 inline -mt-0.5" />}
        {ev.title}
      </p>
      {height > 30 && (
        <p className="truncate font-mono text-[9px] opacity-70">{fmtTimeRange(previewStart, previewDuration)}</p>
      )}
      {height > 46 && linkedTitle && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[9px] opacity-80">
          {completion === 'done'
            ? <Check size={9} className="shrink-0" />
            : <Link2 size={9} className="shrink-0" />}
          <span className="truncate">{completion === 'partial' ? `${linkedTitle} (partly done)` : linkedTitle}</span>
        </p>
      )}
      {completion === 'done' && height <= 46 && (
        <Check size={10} className="absolute right-1 top-1" />
      )}
      {draggable && (
        <div
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
        />
      )}
    </div>
  );
}

// ── Day column ────────────────────────────────────────────────────────────────

function DayColumn({ date, dayIdx, events, meetings, linksByEvent, isWorkDay, workStart, workEnd, isToday, now, onSlotClick, onEventClick, onEventMove, onEventResize, days }: {
  date: string;
  dayIdx: number;
  events: PlacedEvent[];
  meetings: CalendarMeeting[];
  linksByEvent: Map<string, DBEventTaskLinkFull[]>;
  isWorkDay: boolean;
  workStart: number;
  workEnd: number;
  isToday: boolean;
  now: Date;
  onSlotClick: (date: string, startHour: number) => void;
  onEventClick: (ev: DBEvent) => void;
  onEventMove: (ev: DBEvent, next: { date: string; start_hour: number }) => void;
  onEventResize: (ev: DBEvent, durationHours: number) => void;
  days: string[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${date}` });

  const packed = useMemo(() => {
    const blocks: TimedBlock[] = [
      ...events.map(p => ({
        id: `e:${p.event.id}`,
        start: p.event.start_hour,
        end: p.event.start_hour + Math.max(0.5, p.event.duration_hours),
      })),
      ...meetings.map(m => ({
        id: `m:${m.id}`,
        start: m.startHour,
        end: m.startHour + Math.max(0.25, m.durationHours),
      })),
    ];
    return packOverlaps(blocks);
  }, [events, meetings]);

  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = GRID_START_HOUR + (e.clientY - rect.top) / HOUR_PX;
    const hour = clampHour(snapHour(raw, 30), GRID_START_HOUR, GRID_END_HOUR - 0.5);
    onSlotClick(date, hour);
  };

  const nowY = hourToY(now.getHours() + now.getMinutes() / 60);

  return (
    <div
      ref={setNodeRef}
      onClick={handleBackgroundClick}
      className={`relative cursor-pointer border-l border-gray-100
        ${!isWorkDay ? 'bg-gray-50/70' : ''}
        ${isOver ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-300' : ''}`}
      style={{ height: GRID_HEIGHT }}
    >
      {/* Off-hours shading inside working days */}
      {isWorkDay && workStart > GRID_START_HOUR && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gray-50/70" style={{ height: hourToY(Math.min(workStart, GRID_END_HOUR)) }} />
      )}
      {isWorkDay && workEnd < GRID_END_HOUR && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gray-50/70" style={{ top: hourToY(Math.max(workEnd, GRID_START_HOUR)) }} />
      )}

      {/* Hour lines */}
      {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR - 1 }, (_, i) => (
        <div key={i} className="pointer-events-none absolute inset-x-0 border-t border-gray-100" style={{ top: (i + 1) * HOUR_PX }} />
      ))}

      {/* Meetings (read-only) */}
      {meetings.map(m => {
        const pos = packed.get(`m:${m.id}`) ?? { col: 0, cols: 1 };
        const top = hourToY(clampHour(m.startHour, GRID_START_HOUR, GRID_END_HOUR - 0.25));
        const height = Math.max(18, Math.min(m.durationHours * HOUR_PX, GRID_HEIGHT - top) - 2);
        return (
          <div
            key={m.id}
            onClick={e => e.stopPropagation()}
            className="absolute z-10 overflow-hidden rounded-md border-l-[3px] border-purple-500 bg-purple-50 px-1.5 py-1 text-purple-800 shadow-sm"
            style={{ top, height, left: `calc(${(pos.col / pos.cols) * 100}% + 2px)`, width: `calc(${100 / pos.cols}% - 4px)` }}
            title={`${m.title} — meeting (edit it from its goal)`}
          >
            <p className="flex items-center gap-1 truncate text-[11px] font-semibold leading-tight">
              <Users size={10} className="shrink-0" />{m.title}
            </p>
            {height > 30 && <p className="font-mono text-[9px] opacity-70">{fmtTimeRange(m.startHour, m.durationHours)}</p>}
          </div>
        );
      })}

      {/* Events */}
      {events.map(p => (
        <EventBlock
          key={p.event.id}
          placed={p}
          dayIdx={dayIdx}
          pos={packed.get(`e:${p.event.id}`) ?? { col: 0, cols: 1 }}
          links={linksByEvent.get(p.event.id) ?? []}
          onClick={onEventClick}
          onMove={(ev, next) => onEventMove(ev, { date: days[next.dayIdx], start_hour: next.start_hour })}
          onResize={onEventResize}
        />
      ))}

      {/* Now line */}
      {isToday && nowY >= 0 && nowY <= GRID_HEIGHT && (
        <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowY }}>
          <div className="relative border-t-2 border-red-500">
            <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Grid ──────────────────────────────────────────────────────────────────────

export function WeekTimeGrid({ days, events, meetings, linksByEvent, workStart, workEnd, workDays, renderAllDayCell, onSlotClick, onEventClick, onEventMove, onEventResize }: WeekTimeGridProps) {
  const now = useNowTick();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Land with the workday in view, a touch of margin above it.
    scrollRef.current?.scrollTo({ top: Math.max(0, hourToY(workStart) - 12) });
  }, [workStart]);

  const eventsByDate = useMemo(() => {
    const m = new Map<string, PlacedEvent[]>();
    for (const p of events) {
      if (!m.has(p.date)) m.set(p.date, []);
      m.get(p.date)!.push(p);
    }
    return m;
  }, [events]);

  const meetingsByDate = useMemo(() => {
    const m = new Map<string, CalendarMeeting[]>();
    for (const mt of meetings) {
      if (!m.has(mt.date)) m.set(mt.date, []);
      m.get(mt.date)!.push(mt);
    }
    return m;
  }, [meetings]);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div ref={scrollRef} className="relative max-h-[620px] overflow-y-auto overscroll-contain">
        {/* Sticky: day headers + all-day cells share the scrollbar gutter with the grid */}
        <div className="sticky top-0 z-40 border-b border-gray-200 bg-white">
          <div className={COLS}>
            <div />
            {days.map(d => {
              const h = dayHeaderParts(d, now);
              return (
                <div key={d} className="flex flex-col items-center border-l border-gray-100 py-1.5">
                  <span className={`font-mono text-[9px] font-bold uppercase tracking-widest ${h.isToday ? 'text-[#4648d4]' : 'text-gray-400'}`}>{h.dow}</span>
                  <span className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full font-headline text-sm font-bold
                    ${h.isToday ? 'bg-[#4648d4] text-white' : 'text-gray-800'}`}>
                    {h.dom}
                  </span>
                </div>
              );
            })}
          </div>
          <div className={`${COLS} border-t border-gray-100`}>
            <div className="py-1 pr-1.5 text-right font-mono text-[8px] uppercase tracking-wider text-gray-300">all day</div>
            {days.map(d => (
              <div key={d} className="min-h-[34px] border-l border-gray-100">
                {renderAllDayCell(d)}
              </div>
            ))}
          </div>
        </div>

        {/* Time grid */}
        <div className={COLS}>
          <div className="relative" style={{ height: GRID_HEIGHT }}>
            {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR - 1 }, (_, i) => (
              <span
                key={i}
                className="absolute right-1.5 -translate-y-1/2 font-mono text-[9px] text-gray-400"
                style={{ top: (i + 1) * HOUR_PX }}
              >
                {fmtHourLabel(GRID_START_HOUR + i + 1)}
              </span>
            ))}
          </div>
          {days.map((d, i) => (
            <DayColumn
              key={d}
              date={d}
              dayIdx={i}
              days={days}
              events={eventsByDate.get(d) ?? []}
              meetings={meetingsByDate.get(d) ?? []}
              linksByEvent={linksByEvent}
              isWorkDay={workDays.includes(i + 1)}
              workStart={workStart}
              workEnd={workEnd}
              isToday={dayHeaderParts(d, now).isToday}
              now={now}
              onSlotClick={onSlotClick}
              onEventClick={onEventClick}
              onEventMove={onEventMove}
              onEventResize={onEventResize}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
