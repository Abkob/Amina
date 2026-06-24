import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { formatTaskTime, parseTaskTimeInput } from '../utils/taskTime';

interface Props {
  minutes: number;
  estimatedMinutes?: number | null;
  onSave: (minutes: number | null) => void;
}

export function ActualTimeChip({ minutes, estimatedMinutes, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatTaskTime(minutes));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(formatTaskTime(minutes));
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    if (t === '') {
      onSave(null);
    } else {
      const parsed = parseTaskTimeInput(t);
      onSave(parsed);
    }
    setEditing(false);
  };

  const isOver = estimatedMinutes != null && minutes > estimatedMinutes;

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/[^\d.hm\s]/gi, ''))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder="e.g. 1h 30m"
        className="h-[22px] w-20 rounded-full border border-[#4648d4]/40 bg-white px-2.5 text-[10px] text-[#4648d4] outline-none ring-1 ring-[#4648d4]/20"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to edit actual time"
      className={`inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition-all hover:shadow-sm ${
        isOver
          ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300'
      }`}
    >
      <Check size={9} className="shrink-0" />
      {formatTaskTime(minutes)}
      {estimatedMinutes != null && (
        <span className={`rounded-full px-1 py-px text-[8px] font-bold ${
          isOver ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
        }`}>
          {isOver
            ? `+${formatTaskTime(minutes - estimatedMinutes)}`
            : `-${formatTaskTime(estimatedMinutes - minutes)}`}
        </span>
      )}
    </button>
  );
}
