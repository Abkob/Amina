import { useEffect, useRef, useState } from 'react';
import { Check, Clock, X } from 'lucide-react';
import { motion } from 'motion/react';
import { formatTaskTime, parseTaskTimeInput } from '../utils/taskTime';

interface Props {
  taskTitle: string;
  estimatedMinutes: number | null | undefined;
  onLog: (actualMinutes: number) => void;
  onSkip: () => void;
}

export function ActualTimeModal({ taskTitle, estimatedMinutes, onLog, onSkip }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onSkip(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  const handleLog = () => {
    const t = draft.trim();
    if (!t) return;
    const parsed = parseTaskTimeInput(t);
    if (parsed !== null) onLog(parsed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-sm mx-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
              <Check size={14} className="text-emerald-600" />
            </span>
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-600">
              Task Complete
            </span>
          </div>
          <button onClick={onSkip} className="text-gray-300 hover:text-gray-500 transition-colors">
            <X size={14} />
          </button>
        </div>

        <p className="text-sm font-bold text-gray-900 leading-snug mb-1 line-clamp-2">
          {taskTitle}
        </p>

        {estimatedMinutes != null && (
          <p className="font-mono text-[10px] text-gray-400 mb-4">
            Estimated: <span className="text-gray-600 font-semibold">{formatTaskTime(estimatedMinutes)}</span>
          </p>
        )}
        {estimatedMinutes == null && <div className="mb-4" />}

        <label className="block font-mono text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">
          How long did it actually take?
        </label>
        <div className="relative mb-4">
          <Clock size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value.replace(/[^\d.hm\s]/gi, ''))}
            onKeyDown={e => { if (e.key === 'Enter') handleLog(); }}
            placeholder="e.g. 1h 30m, 45m, 2h"
            className="w-full rounded-xl border border-gray-200 bg-[#f8f9fa] pl-8 pr-3 py-2.5 text-sm text-gray-800 outline-none focus:border-[#4648d4] focus:bg-white transition-all placeholder:text-gray-300"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleLog}
            disabled={!draft.trim()}
            className="flex-1 rounded-xl bg-[#4648d4] py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Log Time
          </button>
        </div>
      </motion.div>
    </div>
  );
}
