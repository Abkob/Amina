import { useState, useEffect } from 'react';
import { Sparkles, X, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppStore } from '../store/useAppStore';
import { NeedsImplementationBadge } from '../components/NeedsImplementationBadge';
import { db } from '../db/db';
import { rescheduleEvent, fixMyWeek as dbFixMyWeek } from '../db/queries/events';
import { parseConnectedResource } from '../db/schema';

const START_HOUR = 8;
const HOURS = 16;
const PX_PER_HOUR = 60;

function getWeekInfo() {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const mondayOffset = (dow + 6) % 7; // days since Monday (Mon=0 … Sun=6)
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`;
  });

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekLabel = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return { days, todayIdx: mondayOffset, weekLabel };
}

function fmtHourLabel(hour: number) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const hh = h % 12 || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtHour(h: number) {
  const hh = h % 12 || 12;
  return `${hh} ${h < 12 ? 'AM' : 'PM'}`;
}

const EVENT_STYLE: Record<string, { border: string; bg: string; bar: string }> = {
  Focus:  { border: 'border-[#c0c1ff]',              bg: 'bg-[#e1e0ff]/30',  bar: 'bg-[#4648d4]' },
  Review: { border: 'border-[#10B981]/30',            bg: 'bg-emerald-50/15', bar: 'bg-[#10B981]' },
  Admin:  { border: 'border-[#F59E0B]/30',            bg: 'bg-yellow-500/5',  bar: 'bg-[#F59E0B]' },
  Buffer: { border: 'border-gray-300 border-dashed',  bg: 'bg-white',         bar: 'bg-gray-300'  },
};

// ─── AI Reasoning Drawer ──────────────────────────────────────────────────────
function AIDrawer() {
  const { selectedEventId, isDrawerOpen, setIsDrawerOpen, setSelectedEventId, triggerToast } = useAppStore();

  const events = useLiveQuery(() => db.events.toArray()) ?? [];
  const event  = events.find(e => e.id === selectedEventId);

  const handleReschedule = async () => {
    if (!event) return;
    await rescheduleEvent(event.id, event.start_hour + 1);
    triggerToast('Block shifted down 1 hour to reserve mental buffers.', 'info');
  };

  if (!isDrawerOpen || !event) {
    return (
      <div className="bg-[#EEF2FF] rounded-xl p-5 border border-dashed border-[#4648d4]/20 text-center text-xs">
        <Sparkles size={24} className="text-[#4648d4] mx-auto mb-2.5 animate-pulse" />
        <p className="font-bold text-[#4648d4] mb-1 flex items-center justify-center gap-2">
          <span>Interactive Scheduler Guidance</span>
          <NeedsImplementationBadge />
        </p>
        <p className="text-gray-600 leading-normal mb-3">
          Tap any block in the schedule grid to activate Amina OS reasoning profiles.
        </p>
        <button
          onClick={() => {
            setSelectedEventId(events[0]?.id ?? null);
            setIsDrawerOpen(true);
          }}
          className="bg-black hover:opacity-90 text-white text-[10px] uppercase font-mono py-1.5 px-3 rounded-lg"
        >
          Amina Analytics
        </button>
      </div>
    );
  }

  const badgeCls =
    event.type === 'Focus'  ? 'bg-[#4648d4]/10 text-[#4648d4]' :
    event.type === 'Review' ? 'bg-emerald-50 text-[#10B981]' :
    event.type === 'Buffer' ? 'bg-gray-100 text-gray-500' :
    'bg-[#F59E0B]/10 text-[#F59E0B]';

  const connectedResource = parseConnectedResource(event.connected_resource_json);

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        key={selectedEventId}
        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
        transition={{ duration: 0.2 }}
        className="bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 p-5 shadow-ambient"
      >
        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-1.5 text-[#4648d4]">
            <Sparkles size={14} className="animate-pulse" />
            <h3 className="font-headline text-sm font-bold text-black uppercase tracking-wide">AI Reasoning</h3>
            <NeedsImplementationBadge />
          </div>
          <button onClick={() => setIsDrawerOpen(false)} className="p-1 hover:bg-gray-100 rounded text-gray-400">
            <X size={14} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-[#f8f9fa] rounded-xl p-4 border border-gray-150 shadow-sm">
            <h4 className="font-headline text-sm font-black text-gray-900 mb-1.5">{event.title}</h4>
            <div className="flex items-center gap-2 mb-3">
              <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${badgeCls}`}>{event.type}</span>
              <span className="font-mono text-[9px] text-gray-400">{event.time_str}</span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed mb-4">{event.description}</p>

            {connectedResource && (
              <div className="border-t border-gray-100 pt-3.5">
                <h5 className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-1.5 font-bold">Connected Resource</h5>
                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white border border-gray-150 hover:bg-gray-50 cursor-pointer">
                  <FileText size={14} className="text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-black font-bold truncate leading-tight">{connectedResource.title}</p>
                    <p className="text-[9px] font-mono text-gray-400 mt-0.5">{connectedResource.source}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={() => { triggerToast('Proposed slot validated and saved.', 'success'); setIsDrawerOpen(false); }}
              className="flex-1 py-2 bg-black text-white rounded-lg text-xs font-mono uppercase font-bold hover:opacity-95 active:scale-95 transition-all shadow-sm"
            >
              Accept Slot
            </button>
            <button
              onClick={handleReschedule}
              className="flex-1 py-2 border border-gray-200 text-black bg-white rounded-lg text-xs font-mono uppercase hover:bg-gray-50 active:scale-95 transition-all"
            >
              Reschedule
            </button>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

// ─── Schedule View ────────────────────────────────────────────────────────────
export function ScheduleView() {
  const { selectedEventId, setSelectedEventId, setIsDrawerOpen, isOptimizing, setIsOptimizing, triggerToast } = useAppStore();
  const events = useLiveQuery(() => db.events.toArray()) ?? [];

  const { days, todayIdx, weekLabel } = getWeekInfo();

  const [currentHour, setCurrentHour] = useState(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentHour(now.getHours() + now.getMinutes() / 60);
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const showTimeIndicator = currentHour >= START_HOUR && currentHour < START_HOUR + HOURS;

  const handleFixMyWeek = async () => {
    setIsOptimizing(true);
    triggerToast('AI analysis active. Resolving structural conflicts...', 'info');
    setTimeout(async () => {
      await dbFixMyWeek();
      setIsOptimizing(false);
      triggerToast('Weekly plan recalibrated! Focus parameters stabilized.', 'success');
    }, 1800);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-10 py-6 flex flex-col animate-fade-in">
      <div className="flex justify-between items-end mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-headline text-2xl font-bold text-black">This Week</h2>
            <NeedsImplementationBadge />
          </div>
          <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mt-1">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleFixMyWeek}
            disabled={isOptimizing}
            className="p-2 px-3 bg-[#EEF2FF] hover:bg-[#c0c1ff]/20 text-[#4648d4] border border-[#c0c1ff] rounded-lg font-sans font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <Sparkles size={13} className={isOptimizing ? 'animate-spin' : 'animate-pulse'} />
            {isOptimizing ? 'Recalculating…' : 'Fix my Week'}
            <NeedsImplementationBadge className="hidden xl:inline-flex" />
          </button>
          <div className="flex gap-1 border border-gray-200 rounded-lg p-0.5 bg-[#f8f9fa]">
            <button onClick={() => triggerToast('Previous week retrieved.', 'info')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600">
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => triggerToast('Next week initialized.', 'info')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
          {/* Day headers */}
          <div className="grid grid-cols-8 border-b border-gray-150 bg-gray-50 shrink-0">
            <div className="p-3 border-r border-gray-150/40 font-mono text-[9px] text-gray-400 uppercase tracking-wider flex items-center justify-center">GMT+3</div>
            {days.map((day, dIdx) => {
              const isToday = dIdx === todayIdx;
              const [name, date] = day.split(' ');
              return (
                <div key={day} className={`p-2.5 border-r border-gray-150/40 flex flex-col items-center ${isToday ? 'bg-[#EEF2FF]/20' : ''}`}>
                  <span className={`text-[10px] font-mono uppercase tracking-widest font-bold ${isToday ? 'text-[#4648d4]' : 'text-gray-400'}`}>{name}</span>
                  {isToday ? (
                    <span className="text-base font-bold font-headline mt-0.5 bg-[#4648d4] text-white rounded-full w-8 h-8 flex items-center justify-center shadow-sm">{date}</span>
                  ) : (
                    <span className="text-base font-bold font-headline mt-0.5 text-black">{date}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scrollable hour grid */}
          <div className="overflow-y-auto max-h-[480px] relative">
            <div className="relative" style={{ height: `${HOURS * PX_PER_HOUR}px` }}>
              {Array.from({ length: HOURS }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-gray-100 flex items-center pointer-events-none"
                  style={{ top: `${i * PX_PER_HOUR}px`, height: `${PX_PER_HOUR}px` }}
                >
                  <span className="w-[62px] text-right pr-2 font-mono text-[9px] text-gray-400 shrink-0">{fmtHour(START_HOUR + i)}</span>
                </div>
              ))}

              {/* Current time indicator */}
              {showTimeIndicator && (
                <div className="absolute left-0 right-0 z-10 flex items-center pointer-events-none" style={{ top: `${(currentHour - START_HOUR) * PX_PER_HOUR}px` }}>
                  <div className="w-[62px] text-right pr-2.5 font-mono text-[9px] text-[#4648d4] font-bold shrink-0">{fmtHourLabel(currentHour)}</div>
                  <div className="flex-1 border-t-2 border-[#4648d4] relative">
                    <div className="absolute -left-1 -top-[5px] w-2.5 h-2.5 rounded-full bg-[#4648d4]" />
                  </div>
                </div>
              )}

              {/* Event blocks */}
              <div className="absolute inset-0 pointer-events-none z-20" style={{ left: '62px' }}>
                <div className="grid grid-cols-7 h-full">
                  {Array.from({ length: 7 }).map((_, colIdx) => (
                    <div key={colIdx} className="relative border-r border-gray-100/60 h-full">
                      {events
                        .filter(e => e.day_index === colIdx)
                        .map(evt => {
                          const style = EVENT_STYLE[evt.type] ?? EVENT_STYLE.Focus;
                          const isSelected = evt.id === selectedEventId;
                          const top    = (evt.start_hour - START_HOUR) * PX_PER_HOUR;
                          const height = evt.duration_hours * PX_PER_HOUR;
                          return (
                            <div
                              key={evt.id}
                              onClick={(e) => { e.stopPropagation(); setSelectedEventId(evt.id); setIsDrawerOpen(true); }}
                              className={`absolute left-1 right-1 rounded-lg border p-2 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col pointer-events-auto ${style.border} ${style.bg} ${isSelected ? 'ring-2 ring-black bg-white' : ''}`}
                              style={{ top, height }}
                            >
                              <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.bar}`} />
                              <div className="pl-1.5 flex flex-col min-h-0 h-full">
                                <span className="font-mono text-[8px] uppercase tracking-wider bg-gray-100 font-bold px-1 rounded mb-0.5 w-max">{evt.type}</span>
                                <h3 className="text-[11px] font-bold text-gray-900 truncate tracking-tight">{evt.title}</h3>
                                <p className="font-mono text-[8px] text-gray-400 truncate mt-0.5">{evt.time_str}</p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4">
          <AIDrawer />
        </div>
      </div>
    </div>
  );
}
