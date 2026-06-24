import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, Clock, Folder, Calendar, Target, Sparkles,
  FolderOpen, Upload, FileText, CheckSquare, Square,
  Plus, Trash2, X, Paperclip, ChevronDown, ChevronRight, Check, GripVertical,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderPositions } from '../utils/reorderPositions';
import { useNow } from '../utils/useNow';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { NeedsImplementationBadge } from '../components/NeedsImplementationBadge';
import { ActualTimeModal } from '../components/ActualTimeModal';
import { ActualTimeChip } from '../components/ActualTimeChip';
import { useGoal, useGoalTasks, useGoalResources, useTaskResources, useInvalidate } from '../api/hooks';
import { archiveGoal, restoreGoal, updateGoal } from '../db/queries/goals';
import { toggleTask, createTask, deleteTask, updateTask } from '../db/queries/tasks';
import { createResource, deleteResource, detectResourceType } from '../db/queries/resources';
import { getGoalFinishEstimate } from '../utils/goalFinishEstimate';
import { formatTaskTime, getTaskEstimatedMinutes, getTaskLeafProgress, getTaskTimeProgress, getRolledUpTime, parseTaskTimeInput } from '../utils/taskTime';
import { calculateGoalTaskMetrics, computeGoalStatus } from '../utils/goalTaskMetrics';
import { computeGoalTimeStats, formatVelocity, velocityColor, projectedFinishDate, formatProjectedDate } from '../utils/goalTimeAnalytics';
import { generateSuggestions } from '../utils/subtaskSuggestions';
import type { DBTask, DBResource, CriticalPathStatus } from '../db/schema';

// ─── Task progress tree tooltip ────────────────────────────────────────────────
function TaskProgressTree({ tasks }: { tasks: DBTask[] }) {
  function renderNode(task: DBTask, depth: number): React.ReactNode {
    const done    = task.completed || task.status === 'done';
    const partial = !done && getTaskLeafProgress(task, tasks) > 0;
    const kids    = tasks.filter(t => t.parent_task_id === task.id);
    const isMilestone = task.kind === 'critical_path';

    const icon      = done ? '✓' : partial ? '◑' : '○';
    const iconCls   = done ? 'text-emerald-400' : partial ? 'text-amber-400' : 'text-gray-600';
    const labelCls  = done ? 'text-emerald-300' : partial ? 'text-amber-200/80' : 'text-gray-400';
    const time      = task.estimated_minutes ? formatTaskTime(task.estimated_minutes) : null;
    const label     = task.title.length > 18 ? task.title.slice(0, 17) + '…' : task.title;

    return (
      <div key={task.id}>
        <div className="flex items-center gap-1.5 py-[2px]" style={{ paddingLeft: `${depth * 12}px` }}>
          {depth > 0 && <span className="text-gray-700 text-[9px] select-none">└</span>}
          {isMilestone
            ? <span className="text-[#6366f1] text-[9px]">⬡</span>
            : <span className={`text-[9px] font-bold ${iconCls}`}>{icon}</span>
          }
          {time && <span className="font-mono text-[9px] text-gray-500 w-7 text-right shrink-0">{time}</span>}
          <span className={`text-[9px] leading-tight ${isMilestone ? 'text-[#6366f1] font-semibold' : labelCls}`}>{label}</span>
        </div>
        {kids.map(child => renderNode(child, depth + 1))}
      </div>
    );
  }

  const roots = tasks.filter(t => !t.parent_task_id);
  return <div className="space-y-0">{roots.map(r => renderNode(r, 0))}</div>;
}

// ─── Progress ring ─────────────────────────────────────────────────────────────
function DetailRing({ progress, status }: { progress: number; status: 'Safe' | 'Watch' | 'Risky' }) {
  const color = status === 'Safe' ? '#10B981' : status === 'Watch' ? '#F59E0B' : '#EF4444';
  const circ = 2 * Math.PI * 40;
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-full h-full -rotate-90 origin-center text-gray-100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" />
        <circle cx="50" cy="50" r="40" fill="transparent" stroke={color} strokeWidth="8"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - progress / 100)}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-gray-900">
        {progress}%
      </div>
    </div>
  );
}

// ─── Ghost task row ───────────────────────────────────────────────────────────
// Always-visible click-to-type entry. Enter adds and stays open (rapid entry).
// Esc or blur-when-empty dismisses back to ghost state.
function GhostTaskRow({
  onAdd,
  placeholder = 'Add a task…',
  getSuggestions,
  indent = false,
}: {
  onAdd: (title: string) => Promise<void>;
  placeholder?: string;
  getSuggestions?: (input: string) => string[];
  indent?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) {
      ref.current?.focus();
      if (getSuggestions) setChips(getSuggestions(''));
    }
  }, [active]);

  const submit = async () => {
    const title = value.trim();
    if (!title) return;
    await onAdd(title);
    setValue('');
    if (getSuggestions) setChips(getSuggestions(''));
    setTimeout(() => ref.current?.focus(), 0);
  };

  const handleChange = (val: string) => {
    setValue(val);
    if (getSuggestions) setChips(getSuggestions(val));
  };

  const indentCls = indent ? 'ml-4' : '';

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className={`w-full flex items-center gap-2 rounded-lg px-1 py-1.5 text-gray-200 hover:text-gray-400 hover:bg-gray-50 cursor-text transition-colors group/ghost ${indentCls}`}
      >
        <span className="w-[13px] shrink-0" />
        <Plus size={12} className="shrink-0 opacity-0 group-hover/ghost:opacity-50 transition-opacity" />
        <span className="text-[11px] font-medium">{placeholder}</span>
      </button>
    );
  }

  return (
    <div className={`space-y-1.5 py-0.5 ${indentCls}`}>
      <div className="flex items-center gap-2 rounded-lg px-1 py-1 bg-[#f8f9fa] ring-1 ring-[#4648d4]/20">
        <span className="w-[13px] shrink-0" />
        <Square size={13} className="text-gray-200 shrink-0" />
        <input
          ref={ref}
          value={value}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') { setActive(false); setValue(''); setChips([]); }
          }}
          onBlur={() => { if (!value.trim()) { setActive(false); setChips([]); } }}
          placeholder="Task title… (⏎ add · Esc finish)"
          className="flex-1 bg-transparent text-[11px] text-gray-700 font-medium outline-none placeholder:text-gray-300"
        />
        <button
          onMouseDown={e => { e.preventDefault(); submit(); }}
          className="text-[#4648d4] shrink-0 p-0.5 rounded hover:bg-[#4648d4]/10 transition-colors"
          title="Add (Enter)"
        >
          <Plus size={12} />
        </button>
        <button
          onMouseDown={e => { e.preventDefault(); setActive(false); setValue(''); setChips([]); }}
          className="text-gray-300 hover:text-gray-500 shrink-0 p-0.5 rounded transition-colors"
          title="Cancel (Esc)"
        >
          <X size={12} />
        </button>
      </div>
      {chips.length > 0 && (
        <div className="pl-7 flex flex-wrap gap-1">
          {chips.slice(0, 5).map(chip => (
            <button
              key={chip}
              onMouseDown={e => {
                e.preventDefault();
                onAdd(chip).then(() => {
                  if (getSuggestions) setChips(getSuggestions(''));
                  setTimeout(() => ref.current?.focus(), 0);
                });
              }}
              className="flex items-center gap-1 text-[9px] font-mono text-[#4648d4]/70 bg-[#EEF2FF] hover:bg-[#4648d4]/15 px-2 py-0.5 rounded-full transition-colors"
            >
              <Sparkles size={8} />
              {chip.length > 28 ? chip.slice(0, 27) + '…' : chip}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Resource chip ─────────────────────────────────────────────────────────────
function ResourceChip({ res, onDelete }: { res: DBResource; onDelete: () => void }) {
  const icon = res.type === 'figma'
    ? <span className="text-red-500 font-bold font-mono text-[9px]">F</span>
    : <FileText size={9} className="text-gray-400" />;
  return (
    <span className="inline-flex items-center gap-1 bg-white border border-gray-200 px-1.5 py-0.5 rounded-md text-[10px] text-gray-600 group/chip">
      {icon}
      <span className="max-w-[80px] truncate">{res.title}</span>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover/chip:opacity-100 text-gray-300 hover:text-red-400 transition-all ml-0.5"
      >
        <X size={8} />
      </button>
    </span>
  );
}

// ─── Inline editable title ────────────────────────────────────────────────────
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InlineTitle({
  value,
  onSave,
  className,
  strikethrough,
}: {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  strikethrough?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { setVal(value); }, [value]);

  const commit = () => {
    const trimmed = val.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setVal(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value); setEditing(false); } }}
        className={`bg-transparent border-b border-[#4648d4] outline-none w-full ${className}`}
        onClick={e => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true); }}
      className={`cursor-text hover:text-[#4648d4] transition-colors ${strikethrough ? 'line-through opacity-50' : ''} ${className}`}
      title="Click to edit"
    >
      {value}
    </span>
  );
}

// ─── Deadline pill ────────────────────────────────────────────────────────────
// ─── Deadline helpers ──────────────────────────────────────────────────────────

/** Parse a due_date value (date-only OR datetime) into a Date.
 *  Date-only values (no T) are treated as end-of-day 23:59 so a day deadline
 *  doesn't expire at midnight. */
function parseDueDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  if (value.includes('T')) return new Date(value);
  return new Date(`${value}T23:59:00`);
}

/** Format time remaining/elapsed into a compact label. */
function formatCountdown(diffMs: number): { badge: string; detail: string } {
  const abs = Math.abs(diffMs);
  const totalMins = Math.floor(abs / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  const sign = diffMs < 0 ? '-' : '';

  if (days >= 7)  return { badge: '',            detail: '' };
  if (days >= 2)  return { badge: `${sign}${days}d ${remH}h`, detail: `${days} days ${remH}h` };
  if (hours >= 1) return { badge: `${sign}${hours}h ${mins}m`, detail: `${hours}h ${mins}m` };
  if (totalMins >= 1) return { badge: `${sign}${totalMins}m`, detail: `${totalMins} minutes` };
  return { badge: diffMs < 0 ? 'just now' : '<1m', detail: '' };
}

// ─── DeadlinePill ──────────────────────────────────────────────────────────────
function DeadlinePill({
  value,
  label = 'deadline',
  onSave,
}: {
  value: string | null;
  label?: string;
  onSave: (date: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const now = useNow(); // updates every 30 s — shared across all pills

  const parsed = value ? parseDueDate(value) : null;
  const diffMs = parsed ? parsed.getTime() - now.getTime() : null;
  const isOverdue = diffMs !== null && diffMs < 0;
  // "soon" = within 24 hours
  const isSoon = diffMs !== null && diffMs >= 0 && diffMs < 24 * 3_600_000;
  // For far-future deadlines, only show date label (no countdown re-renders needed)
  const isFar = diffMs !== null && Math.abs(diffMs) >= 7 * 86_400_000;

  const hasTime = value?.includes('T') ?? false;

  const dateLabel = parsed
    ? parsed.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
        ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
        year: parsed.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      })
    : null;

  const { badge } = diffMs !== null ? formatCountdown(diffMs) : { badge: '' };

  // Editing: use datetime-local so user can optionally add time.
  // Pre-fill: datetime value or date + T23:59 for date-only.
  const editDefault = (() => {
    if (!value) return '';
    if (hasTime) return value.slice(0, 16);
    return `${value.slice(0, 10)}T23:59`;
  })();

  const handleSave = (raw: string) => {
    if (!raw) { onSave(null); return; }
    // If user left time at 23:59 and no time was previously set, strip time back to date-only
    if (raw.endsWith('T23:59') && !hasTime) {
      onSave(raw.slice(0, 10));
    } else {
      onSave(raw);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={ref}
          type="datetime-local"
          defaultValue={editDefault}
          onBlur={e => { handleSave(e.target.value); setEditing(false); }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
          className="h-[22px] rounded-full border border-[#4648d4]/40 bg-white px-2.5 text-[10px] text-[#4648d4] outline-none ring-1 ring-[#4648d4]/20"
        />
        {value && (
          <button
            onMouseDown={e => { e.preventDefault(); onSave(null); setEditing(false); }}
            className="text-gray-300 hover:text-red-400 transition-colors"
            title="Clear deadline"
          >
            <X size={10} />
          </button>
        )}
      </div>
    );
  }

  if (!dateLabel) {
    return (
      <button
        onClick={() => setEditing(true)}
        title={`Set ${label}`}
        className="inline-flex h-[22px] items-center gap-1 rounded-full border border-dashed border-gray-200 px-2.5 text-[10px] text-gray-300 transition-all hover:border-[#4648d4]/30 hover:text-[#4648d4]/60"
      >
        <Calendar size={9} />
        <span>+ due date</span>
      </button>
    );
  }

  const title = isOverdue
    ? `Overdue by ${badge.replace('-', '')}`
    : `Due: ${dateLabel}${!isFar && badge ? ` (${badge} left)` : ''}`;

  return (
    <button
      onClick={() => setEditing(true)}
      title={title}
      className={`inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition-all hover:shadow-sm ${
        isOverdue
          ? 'border-red-200 bg-red-50 text-red-500 hover:border-red-300 hover:bg-red-100'
          : isSoon
          ? 'border-amber-200 bg-amber-50 text-amber-600 hover:border-amber-300'
          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#4648d4]/30 hover:bg-[#4648d4]/5 hover:text-[#4648d4]'
      }`}
    >
      <Calendar size={9} className="shrink-0" />
      <span>{dateLabel}</span>
      {!isFar && badge && (
        <span className={`rounded-full px-1 py-px text-[8px] font-bold ${
          isOverdue ? 'bg-red-100 text-red-500' : isSoon ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
        }`}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Inline time-estimate pill (with rollup + remaining-time from progress) ───
function InlineTimePill({
  task,
  allTasks,
  onSave,
}: {
  task: DBTask;
  allTasks: DBTask[];
  onSave: (minutes: number | null) => void;
}) {
  const { minutes, isRollup, ownMinutes, childrenSum } = getRolledUpTime(task, allTasks);
  const tp = getTaskTimeProgress(task, allTasks);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ownMinutes === null ? '' : formatTaskTime(ownMinutes));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => {
    if (!editing) setDraft(ownMinutes === null ? '' : formatTaskTime(ownMinutes));
  }, [editing, task.estimated_minutes, task.estimated_duration]);

  const commit = () => {
    const t = draft.trim();
    onSave(t === '' ? null : parseTaskTimeInput(t));
    setEditing(false);
  };

  const hasOverhead = isRollup && ownMinutes !== null && childrenSum !== null;

  const tooltipText = hasOverhead
    ? `${formatTaskTime(minutes)} total · ${formatTaskTime(ownMinutes)} own + ${formatTaskTime(childrenSum)} subtasks`
    : isRollup
    ? `Summed from subtasks: ${formatTaskTime(minutes)}`
    : `Estimated: ${formatTaskTime(minutes)}`;

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/[^\d.hm\s]/gi, ''))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(ownMinutes === null ? '' : formatTaskTime(ownMinutes)); setEditing(false); }
        }}
        placeholder="e.g. 1h 30m"
        className="h-[22px] w-20 rounded-full border border-[#4648d4]/40 bg-white px-2.5 text-[10px] text-[#4648d4] outline-none ring-1 ring-[#4648d4]/20"
      />
    );
  }

  if (minutes === null) {
    return (
      <button
        onClick={() => setEditing(true)}
        title="Set time estimate"
        className="inline-flex h-[22px] items-center gap-1 rounded-full border border-dashed border-gray-200 px-2.5 text-[10px] text-gray-300 transition-all hover:border-[#4648d4]/30 hover:text-[#4648d4]/60"
      >
        <Clock size={9} />
        <span>+ time</span>
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => setEditing(true)}
        title={tooltipText}
        className={`inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition-all hover:shadow-sm ${
          isRollup
            ? 'border-[#4648d4]/20 bg-[#4648d4]/5 text-[#4648d4]/70 hover:border-[#4648d4]/40'
            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#4648d4]/30 hover:bg-[#4648d4]/5 hover:text-[#4648d4]'
        }`}
      >
        <Clock size={9} className="shrink-0" />
        {isRollup && (
          <span className="text-[8px] opacity-50 font-bold">{hasOverhead ? '+' : 'Σ'}</span>
        )}

        <span>{formatTaskTime(minutes)}</span>
      </button>
    </span>
  );
}

// ─── Subtask row ──────────────────────────────────────────────────────────────
function TaskTreeRow({
  task,
  allTasks,
  childrenByParent,
  taskResources,
  depth = 0,
  onToggleSubtask,
  onDeleteSubtask,
  onUpdateSubtaskTitle,
  onAddSubtask,
  onAttachResource,
  onAttachFiles,
  onDeleteResource,
  onOpenFocus,
  onUpdateDeadline,
  onUpdateTime,
  onUpdateActualTime,
}: {
  task: DBTask;
  allTasks: DBTask[];
  childrenByParent: Record<string, DBTask[]>;
  taskResources: Record<string, DBResource[]>;
  depth?: number;
  onToggleSubtask: (task: DBTask) => void;
  onDeleteSubtask: (task: DBTask) => void;
  onUpdateSubtaskTitle: (taskId: string, title: string) => void;
  onAddSubtask: (parentTaskId: string, title: string) => Promise<void>;
  onAttachResource: (taskId: string, title: string, url: string | null, type: DBResource['type']) => Promise<void>;
  onAttachFiles: (taskId: string, files: FileList | null) => Promise<void>;
  onDeleteResource: (resId: string) => void;
  onOpenFocus: (taskId: string) => void;
  onUpdateDeadline: (taskId: string, date: string | null) => void;
  onUpdateTime: (taskId: string, minutes: number | null) => void;
  onUpdateActualTime: (taskId: string, minutes: number | null) => void;
}) {
  const children = childrenByParent[task.id] ?? [];
  const resources = taskResources[task.id] ?? [];
  const [expanded, setExpanded] = useState(depth === 0);
  const [showResourceInput, setShowResourceInput] = useState(false);
  const [resourceInput, setResourceInput] = useState('');
  const resRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (showResourceInput) resRef.current?.focus(); }, [showResourceInput]);

  const submitResource = () => {
    const val = resourceInput.trim();
    if (!val) { setShowResourceInput(false); return; }
    const type = detectResourceType(val);
    const url = type !== 'document' ? val : null;
    onAttachResource(task.id, val, url, type);
    setResourceInput('');
    setShowResourceInput(false);
  };

  return (
    <div className="group/sub flex flex-col gap-1 py-1.5">
      <div className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-gray-50 transition-colors">
        <button
          onClick={() => setExpanded(v => !v)}
          className={`shrink-0 transition-colors ${children.length === 0 ? 'text-gray-200 hover:text-gray-300' : 'text-gray-300 hover:text-[#4648d4]'}`}
          title={expanded ? 'Collapse' : children.length === 0 ? 'Expand to add child tasks' : 'Expand child tasks'}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        <button onClick={() => onToggleSubtask(task)} className="text-gray-300 hover:text-[#4648d4] shrink-0 transition-colors">
          {task.completed ? <CheckSquare size={14} className="text-[#10B981]" /> : <Square size={14} />}
        </button>

        <InlineTitle
          value={task.title}
          onSave={title => onUpdateSubtaskTitle(task.id, title)}
          strikethrough={task.completed}
          className="text-xs text-gray-700 font-medium flex-1 min-w-0"
        />

        {children.length > 0 && (
          <span className="text-[9px] font-mono text-gray-300 shrink-0">{children.length}</span>
        )}

        {/* Deadline + time — visible when set; shown on hover when empty */}
        <div className={`flex items-center gap-1 shrink-0 ${!task.due_date && getTaskEstimatedMinutes(task) === null && !task.actual_minutes ? 'opacity-0 group-hover/sub:opacity-100' : ''} transition-opacity`}>
          <DeadlinePill
            value={task.due_date}
            onSave={d => onUpdateDeadline(task.id, d)}
          />
          <InlineTimePill
            task={task}
            allTasks={allTasks}
            onSave={m => onUpdateTime(task.id, m)}
          />
          {task.completed && task.actual_minutes != null && (
            <ActualTimeChip
              minutes={task.actual_minutes}
              estimatedMinutes={task.estimated_minutes}
              onSave={m => onUpdateActualTime(task.id, m)}
            />
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onOpenFocus(task.id)}
            className="text-gray-300 hover:text-[#4648d4] transition-colors p-0.5 rounded"
            title="Open focus page"
          >
            <FileText size={11} />
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="text-gray-300 hover:text-[#4648d4] transition-colors p-0.5 rounded"
            title="Expand to add child tasks"
          >
            <Plus size={11} />
          </button>
          <button
            onClick={() => setShowResourceInput(v => !v)}
            className="text-gray-300 hover:text-[#4648d4] transition-colors p-0.5 rounded"
            title="Attach resource"
          >
            <Paperclip size={11} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-gray-300 hover:text-[#4648d4] transition-colors p-0.5 rounded"
            title="Upload files"
          >
            <Upload size={11} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (e) => {
              await onAttachFiles(task.id, e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          <button
            onClick={() => onDeleteSubtask(task)}
            className="text-gray-300 hover:text-red-400 transition-colors p-0.5 rounded"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Resource chips */}
      {resources.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-6">
          {resources.map(r => (
            <ResourceChip key={r.id} res={r} onDelete={() => onDeleteResource(r.id)} />
          ))}
        </div>
      )}

      {/* Inline resource input */}
      <AnimatePresence>
        {showResourceInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-6 flex gap-2 overflow-hidden"
          >
            <input
              ref={resRef}
              value={resourceInput}
              onChange={e => setResourceInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitResource(); if (e.key === 'Escape') setShowResourceInput(false); }}
              placeholder="URL or filename…"
              className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] text-gray-700 focus:outline-none focus:border-[#4648d4] transition-all"
            />
            <button onClick={submitResource} className="bg-[#4648d4] text-white rounded-lg px-2 py-1 hover:opacity-90 transition-colors">
              <Check size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-4 border-l border-gray-100 pl-3 overflow-hidden"
          >
            {children.map(child => (
              <TaskTreeRow
                key={child.id}
                task={child}
                allTasks={allTasks}
                childrenByParent={childrenByParent}
                taskResources={taskResources}
                depth={depth + 1}
                onToggleSubtask={onToggleSubtask}
                onDeleteSubtask={onDeleteSubtask}
                onUpdateSubtaskTitle={onUpdateSubtaskTitle}
                onAddSubtask={onAddSubtask}
                onAttachResource={onAttachResource}
                onAttachFiles={onAttachFiles}
                onDeleteResource={onDeleteResource}
                onOpenFocus={onOpenFocus}
                onUpdateDeadline={onUpdateDeadline}
                onUpdateTime={onUpdateTime}
                onUpdateActualTime={onUpdateActualTime}
              />
            ))}
            <GhostTaskRow
              onAdd={title => onAddSubtask(task.id, title)}
              placeholder="Add child task…"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Milestone card ───────────────────────────────────────────────────────────
function MilestoneCard({
  milestone,
  allTasks,
  subtasksByParent,
  taskResources,
  category,
  goalTitle,
  onToggleSubtask,
  onDeleteSubtask,
  onUpdateSubtaskTitle,
  onAddSubtask,
  onAttachResource,
  onAttachFiles,
  onDeleteResource,
  onOpenFocus,
  onUpdateDeadline,
  onUpdateTime,
  onUpdateActualTime,
}: {
  milestone: DBTask;
  allTasks: DBTask[];
  subtasksByParent: Record<string, DBTask[]>;
  taskResources: Record<string, DBResource[]>;
  category: string;
  goalTitle: string;
  onToggleSubtask: (task: DBTask) => void;
  onDeleteSubtask: (task: DBTask) => void;
  onUpdateSubtaskTitle: (taskId: string, title: string) => void;
  onAddSubtask: (parentTaskId: string, title: string) => Promise<void>;
  onAttachResource: (taskId: string, title: string, url: string | null, type: DBResource['type']) => Promise<void>;
  onAttachFiles: (taskId: string, files: FileList | null) => Promise<void>;
  onDeleteResource: (resourceId: string) => void;
  onOpenFocus: (taskId: string) => void;
  onUpdateDeadline: (taskId: string, date: string | null) => void;
  onUpdateTime: (taskId: string, minutes: number | null) => void;
  onUpdateActualTime: (taskId: string, minutes: number | null) => void;
}) {
  const subtasks = subtasksByParent[milestone.id] ?? [];
  const [expanded, setExpanded] = useState(milestone.critical_path_status === 'In Progress');

  const dotCls =
    milestone.critical_path_status === 'Completed'   ? 'bg-[#10B981]' :
    milestone.critical_path_status === 'In Progress' ? 'bg-[#4648d4]' :
    'bg-gray-300';

  const badgeCls =
    milestone.critical_path_status === 'Completed'   ? 'bg-emerald-50 text-[#10B981]' :
    milestone.critical_path_status === 'In Progress' ? 'bg-[#4648d4]/10 text-[#4648d4]' :
    'bg-gray-100 text-gray-400';

  return (
    <div id={`ms-${milestone.id}`} className="bg-white rounded-xl border border-gray-150 shadow-sm overflow-hidden">
      {/* Milestone header — full row is the expand/collapse target */}
      <div
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#f8f9fa] transition-colors cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-gray-400 hover:text-[#4648d4] transition-colors shrink-0">
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`} />
        <span className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
          <InlineTitle
            value={milestone.title}
            onSave={title => updateTask(milestone.id, { title })}
            className="text-xs font-mono font-bold uppercase tracking-wide text-gray-800"
          />
        </span>
        <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md font-bold shrink-0 ${badgeCls}`}>
          {milestone.critical_path_status}
        </span>
        <span className="text-[10px] font-mono text-gray-400 shrink-0">{subtasks.length}</span>
        <span onClick={e => e.stopPropagation()}>
          <DeadlinePill
            value={milestone.due_date}
            label="milestone deadline"
            onSave={d => onUpdateDeadline(milestone.id, d)}
          />
        </span>
        <span onClick={e => e.stopPropagation()}>
          <InlineTimePill
            task={milestone}
            allTasks={allTasks}
            onSave={m => onUpdateTime(milestone.id, m)}
          />
        </span>
        <button
          onClick={e => { e.stopPropagation(); onOpenFocus(milestone.id); }}
          className="text-gray-300 hover:text-[#4648d4] transition-colors p-1 rounded"
          title="Open focus page"
        >
          <FileText size={13} />
        </button>
      </div>

      {/* Expanded body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 border-t border-gray-100 pt-2">
              {/* Subtasks */}
              {subtasks.length > 0 ? (
                <div className="space-y-0.5 mb-3">
                  {subtasks.map(sub => (
                    <TaskTreeRow
                      key={sub.id}
                      task={sub}
                      allTasks={allTasks}
                      childrenByParent={subtasksByParent}
                      taskResources={taskResources}
                      onToggleSubtask={onToggleSubtask}
                      onDeleteSubtask={onDeleteSubtask}
                      onUpdateSubtaskTitle={onUpdateSubtaskTitle}
                      onAddSubtask={onAddSubtask}
                      onAttachResource={onAttachResource}
                      onAttachFiles={onAttachFiles}
                      onDeleteResource={onDeleteResource}
                      onOpenFocus={onOpenFocus}
                      onUpdateDeadline={onUpdateDeadline}
                      onUpdateTime={onUpdateTime}
                      onUpdateActualTime={onUpdateActualTime}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-gray-300 italic mb-3">No subtasks yet.</p>
              )}

              {/* Add subtask */}
              <GhostTaskRow
                onAdd={title => onAddSubtask(milestone.id, title)}
                placeholder="Add a task…"
                getSuggestions={input => generateSuggestions(goalTitle, category, milestone.title, input, subtasks.map(s => s.title))}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sortable task row wrapper (DnD handle) ───────────────────────────────────
function SortableTaskRow(props: Parameters<typeof TaskTreeRow>[0]) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="relative group/sortable"
    >
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-5 p-0.5 text-gray-300 opacity-0 group-hover/sortable:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hover:text-gray-500 touch-none"
        tabIndex={-1}
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </button>
      <TaskTreeRow {...props} />
    </div>
  );
}

// ─── Goal Time Panel ─────────────────────────────────────────────────────────
function GoalTimePanel({ tasks }: { tasks: DBTask[] }) {
  const stats = computeGoalTimeStats(tasks);
  const { spentMinutes, adjustedRemainingMinutes, velocityRatio, velocityConfidence, totalEstimatedMinutes } = stats;

  const projectedTotalMinutes =
    adjustedRemainingMinutes !== null ? spentMinutes + adjustedRemainingMinutes :
    totalEstimatedMinutes !== null    ? totalEstimatedMinutes :
    null;

  const spentPct = projectedTotalMinutes && projectedTotalMinutes > 0
    ? Math.min(100, Math.round((spentMinutes / projectedTotalMinutes) * 100))
    : 0;

  if (stats.taskCount === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 mb-3">
        <Clock size={12} className="text-[#4648d4]" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#4648d4]">Time Intelligence</span>
        {velocityConfidence !== 'none' && (
          <span className="ml-auto font-mono text-[9px] text-gray-400 capitalize">{velocityConfidence} confidence</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 mb-0.5">Spent</p>
          <p className="text-sm font-bold text-gray-900">{spentMinutes > 0 ? formatTaskTime(spentMinutes) : '—'}</p>
          <p className="font-mono text-[9px] text-gray-400">{stats.completedWithActual} logged</p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 mb-0.5">Remaining</p>
          <p className="text-sm font-bold text-gray-900">
            {adjustedRemainingMinutes != null ? formatTaskTime(adjustedRemainingMinutes) : '—'}
          </p>
          {velocityRatio !== null && adjustedRemainingMinutes !== stats.estimatedRemainingMinutes && (
            <p className="font-mono text-[9px] text-gray-400">adjusted</p>
          )}
          {adjustedRemainingMinutes === stats.estimatedRemainingMinutes && stats.estimatedRemainingMinutes !== null && (
            <p className="font-mono text-[9px] text-gray-400">estimated</p>
          )}
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 mb-0.5">Velocity</p>
          {velocityRatio !== null ? (
            <>
              <p className={`text-sm font-bold ${velocityColor(velocityRatio)}`}>{velocityRatio.toFixed(2)}×</p>
              <p className={`font-mono text-[9px] ${velocityColor(velocityRatio)}`}>{formatVelocity(velocityRatio)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-gray-300">—</p>
              <p className="font-mono text-[9px] text-gray-300">complete tasks to see</p>
            </>
          )}
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 mb-0.5">Est. Total</p>
          <p className="text-sm font-bold text-gray-900">
            {projectedTotalMinutes != null ? formatTaskTime(projectedTotalMinutes) : '—'}
          </p>
          <p className="font-mono text-[9px] text-gray-400">
            {stats.tasksWithEstimate}/{stats.taskCount} tasks timed
          </p>
        </div>
      </div>

      {projectedTotalMinutes != null && projectedTotalMinutes > 0 && (
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden mb-2">
          <div
            className="h-full rounded-full bg-[#4648d4] transition-all duration-700"
            style={{ width: `${spentPct}%` }}
          />
        </div>
      )}

      {(() => {
        const finishDate = projectedFinishDate(stats);
        if (!finishDate) return null;
        return (
          <p className="font-mono text-[10px] text-gray-400 flex items-center gap-1.5">
            <span>At your pace:</span>
            <span className="font-bold text-gray-700">done by {formatProjectedDate(finishDate)}</span>
          </p>
        );
      })()}
    </div>
  );
}

// ─── Goal Detail ──────────────────────────────────────────────────────────────
export function GoalDetail() {
  const {
    selectedGoalId,
    setSelectedGoalId,
    setFocusedTaskId,
    setCurrentTab,
    openAddResourceModal,
    triggerToast,
    setSelectedEventId,
    setIsDrawerOpen,
    showConfirm,
  } = useAppStore();

  const [editingGoalTitle, setEditingGoalTitle] = useState(false);
  const [goalTitleVal, setGoalTitleVal] = useState('');
  const [pendingComplete, setPendingComplete] = useState<DBTask | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskTime, setQuickTaskTime] = useState('');
  const [showTimeField, setShowTimeField] = useState(false);
  const [showProgressTree, setShowProgressTree] = useState(false);
  const goalTitleRef = useRef<HTMLInputElement>(null);
  const goalFileInputRef = useRef<HTMLInputElement>(null);
  const quickTaskRef = useRef<HTMLInputElement>(null);
  const quickTimeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingGoalTitle) goalTitleRef.current?.focus(); }, [editingGoalTitle]);

  // Global N shortcut: jump to quick-add when not typing in an input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      quickTaskRef.current?.focus();
      quickTaskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { data: goal } = useGoal(selectedGoalId);
  const { data: allTasks = [] } = useGoalTasks(selectedGoalId);
  const { data: goalResourceList = [] } = useGoalResources(selectedGoalId);

  // Build per-task resources grouped by task id
  const taskIds = allTasks.map(t => t.id);
  const [taskResourceMap, setTaskResourceMap] = useState<Record<string, DBResource[]>>({});
  useEffect(() => {
    if (taskIds.length === 0) { setTaskResourceMap({}); return; }
    Promise.all(taskIds.map(id => fetch(`/api/resources?task_id=${id}`).then(r => r.json()).then((res: DBResource[]) => [id, res] as const)))
      .then(pairs => setTaskResourceMap(Object.fromEntries(pairs)))
      .catch(() => {});
  }, [JSON.stringify(taskIds)]);

  const groupedResources = { goalResources: goalResourceList, taskResources: taskResourceMap };

  const invalidate = useInvalidate();

  // ── DnD sensors must be called before any conditional return (Rules of Hooks) ──
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  if (!goal) return null;

  // Derive tree
  const milestones  = allTasks.filter(t => t.kind === 'critical_path' && !t.parent_task_id);
  const manualTasks = allTasks.filter(t => t.kind === 'manual' && !t.parent_task_id);
  const aiTasks     = allTasks.filter(t => t.kind === 'ai_generated' && !t.parent_task_id);
  const subtasksByParent: Record<string, DBTask[]> = {};
  allTasks.filter(t => t.parent_task_id).forEach(t => {
    subtasksByParent[t.parent_task_id!] = [...(subtasksByParent[t.parent_task_id!] ?? []), t];
  });

  const dynStatus = computeGoalStatus(goal, allTasks);
  const statusDot = dynStatus === 'Safe' ? 'bg-[#10B981]' : dynStatus === 'Watch' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]';
  const finishEstimate = getGoalFinishEstimate(goal, allTasks);
  const taskMetrics = calculateGoalTaskMetrics(allTasks);

  // ── Goal title edit ──
  const startGoalTitleEdit = () => { setGoalTitleVal(goal.title); setEditingGoalTitle(true); };
  const saveGoalTitle = async () => {
    const t = goalTitleVal.trim();
    if (t && t !== goal.title) await updateGoal(goal.id, { title: t });
    setEditingGoalTitle(false);
  };

  // ── Subtask actions ──
  const handleToggleSubtask = async (task: DBTask) => {
    if (!task.completed) {
      setPendingComplete(task);
    } else {
      await toggleTask(task.id);
      invalidate.tasks(selectedGoalId ?? undefined);
    }
  };

  const handleDeleteSubtask = (task: DBTask) => {
    showConfirm(`Delete subtask "${task.title}"?`, async () => {
      await deleteTask(task.id);
      triggerToast('Subtask removed.', 'info');
    });
  };

  const handleUpdateSubtaskTitle = async (taskId: string, title: string) => {
    await updateTask(taskId, { title });
  };

  const handleUpdateDeadline = async (taskId: string, date: string | null) => {
    await updateTask(taskId, { due_date: date });
  };

  const handleUpdateTime = async (taskId: string, minutes: number | null) => {
    await updateTask(taskId, { estimated_minutes: minutes });
  };

  const handleUpdateActualTime = async (taskId: string, minutes: number | null) => {
    await updateTask(taskId, { actual_minutes: minutes });
  };

  const handleManualTaskDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = manualTasks.map(t => t.id);
    const changed = reorderPositions(ids, String(active.id), String(over.id));
    if (Object.keys(changed).length === 0) return;
    await Promise.all(
      Object.entries(changed).map(([id, pos]) => updateTask(id, { position: pos }))
    );
  };

  const handleAddSubtask = async (milestoneId: string, title: string) => {
    const milestone = allTasks.find(t => t.id === milestoneId);
    if (!milestone) return;
    const pos = (subtasksByParent[milestoneId] ?? []).length;
    await createTask({
      goal_id: goal.id,
      parent_task_id: milestoneId,
      title,
      description: '',
      status: 'todo',
      priority: 'medium',
      kind: 'manual',
      critical_path_status: null,
      tags_json: '[]',
      due_date: null,
      estimated_duration: null,
      estimated_minutes: null,
      completed: false,
      position: pos,
    });
    triggerToast('Subtask added.', 'success');
  };

  const handleQuickAddTask = async () => {
    const title = quickTaskTitle.trim();
    if (!title) return;
    const estimatedMinutes = quickTaskTime.trim()
      ? parseTaskTimeInput(quickTaskTime.trim())
      : null;
    await createTask({
      goal_id: goal.id,
      parent_task_id: null,
      title,
      description: '',
      status: 'todo',
      priority: 'medium',
      kind: 'manual',
      critical_path_status: null,
      tags_json: '[]',
      due_date: null,
      estimated_duration: null,
      estimated_minutes: estimatedMinutes,
      completed: false,
      position: manualTasks.length,
    });
    setQuickTaskTitle('');
    setQuickTaskTime('');
    setShowTimeField(false);
    quickTaskRef.current?.focus();
    triggerToast('Task added.', 'success');
  };

  const handleAttachResource = async (
    taskId: string,
    title: string,
    url: string | null,
    type: DBResource['type'],
  ) => {
    await createResource({ title, url, type, info: 'attached now' }, goal.id, taskId);
    triggerToast('Resource attached.', 'success');
  };

  const handleAttachFiles = async (taskId: string, files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;

    for (const file of selected) {
      await createResource(
        { title: file.name, url: null, type: 'document', info: `${formatBytes(file.size)} from file picker` },
        goal.id,
        taskId,
      );
    }
    triggerToast(`${selected.length} file${selected.length === 1 ? '' : 's'} attached.`, 'success');
  };

  const handleDeleteResource = (resourceId: string) => {
    showConfirm('Remove this resource?', async () => {
      await deleteResource(resourceId);
      triggerToast('Resource removed.', 'info');
    });
  };

  const handleRestoreGoal = async () => {
    await restoreGoal(goal.id);
    triggerToast('Goal restored with progress intact.', 'success');
  };

  const handleArchiveGoal = () => {
    showConfirm(`Archive goal "${goal.title}"? Your tasks, resources, and progress will be saved.`, async () => {
      await archiveGoal(goal.id);
      triggerToast('Goal archived. Progress saved.', 'info');
    });
  };

  // ── AI task toggle ──
  const handleToggleAiTask = async (task: DBTask) => {
    await toggleTask(task.id);
    invalidate.tasks(selectedGoalId ?? undefined);
  };

  // ── Goal-level resource drop ──
  const handleGoalFiles = async (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;

    for (const file of selected) {
      await createResource(
        { title: file.name, url: null, type: 'document', info: `${formatBytes(file.size)} from file picker` },
        goal.id,
      );
    }
    triggerToast(`${selected.length} goal file${selected.length === 1 ? '' : 's'} attached.`, 'success');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    await handleGoalFiles(e.dataTransfer.files);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-[860px] mx-auto px-4 md:px-10 py-6"
    >
      {/* Back */}
      <button
        onClick={() => setSelectedGoalId(null)}
        className="group mb-5 font-mono text-xs uppercase tracking-wider text-gray-400 hover:text-black flex items-center gap-1.5 cursor-pointer"
      >
        <ChevronLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
        Back into Goals Matrix
      </button>

      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-gray-100 pb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-gray-400 font-mono text-[10px] uppercase tracking-wider mb-2 font-bold">
            <Folder size={12} />
            {goal.category}
          </div>

          {editingGoalTitle ? (
            <input
              ref={goalTitleRef}
              value={goalTitleVal}
              onChange={e => setGoalTitleVal(e.target.value)}
              onBlur={saveGoalTitle}
              onKeyDown={e => { if (e.key === 'Enter') saveGoalTitle(); if (e.key === 'Escape') setEditingGoalTitle(false); }}
              className="font-headline text-2xl font-black text-gray-900 leading-tight w-full bg-transparent border-b-2 border-[#4648d4] outline-none"
            />
          ) : (
            <h1
              onClick={startGoalTitleEdit}
              className="font-headline text-2xl font-black text-gray-900 leading-tight cursor-text hover:text-[#4648d4] transition-colors"
              title="Click to edit goal title"
            >
              {goal.title}
            </h1>
          )}

          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1 flex-wrap">
            {milestones.length} milestone{milestones.length !== 1 ? 's' : ''}
            {' · '}
            {allTasks.filter(t => t.parent_task_id).length} subtask{allTasks.filter(t => t.parent_task_id).length !== 1 ? 's' : ''}
            {' · '}
            <span
              className="relative cursor-default"
              onMouseEnter={() => setShowProgressTree(true)}
              onMouseLeave={() => setShowProgressTree(false)}
            >
              <span className="underline decoration-dotted underline-offset-2">
                {taskMetrics.completedTasks}/{taskMetrics.totalTasks} tasks done
              </span>
              {taskMetrics.usesExplicitWeights && ' / weighted progress'}
              {showProgressTree && (
                <div className="absolute z-50 bottom-full left-0 mb-2 bg-gray-950 border border-gray-800 rounded-xl p-3 shadow-2xl min-w-[220px]">
                  <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest mb-2">Task Tree</p>
                  <TaskProgressTree tasks={allTasks} />
                  <div className="border-t border-gray-800 mt-2 pt-2 flex items-center justify-between">
                    <span className="text-[8px] text-gray-600">{taskMetrics.completedTasks} explicitly done</span>
                    <span className="text-[8px] font-mono text-gray-500">{taskMetrics.progress}% by time</span>
                  </div>
                </div>
              )}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white rounded-xl p-4 border border-gray-100 shadow-ambient shrink-0">
          <DetailRing progress={taskMetrics.progress} status={dynStatus} />
          <div>
            <div className="font-headline text-base font-bold text-gray-900 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusDot}`} />
              {dynStatus}
            </div>
            <div className="font-mono text-[10px] text-gray-400 flex items-center gap-1 mt-1">
              <Calendar size={11} />
              <span className="uppercase tracking-wider">{finishEstimate.caption}</span>
              <span title={finishEstimate.title}>{finishEstimate.label}</span>
            </div>
            <div className="mt-2">
              <DeadlinePill
                value={goal.deadline}
                label="goal deadline"
                onSave={async (date) => updateGoal(goal.id, { deadline: date })}
              />
            </div>
            <button
              onClick={goal.archived_at ? handleRestoreGoal : handleArchiveGoal}
              className="mt-3 text-[9px] font-mono uppercase bg-[#f8f9fa] hover:bg-gray-100 text-gray-500 py-1 px-2 rounded border border-gray-200 transition-colors"
            >
              {goal.archived_at ? 'Restore Goal' : 'Archive Goal'}
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {/* ── Time Intelligence ── */}
        <GoalTimePanel tasks={allTasks} />

        {/* ── Quick Add Task ── */}
        <section>
          <div className="flex gap-2">
            <input
              ref={quickTaskRef}
              value={quickTaskTitle}
              onChange={e => setQuickTaskTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { handleQuickAddTask(); return; }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  setShowTimeField(true);
                  setTimeout(() => quickTimeRef.current?.focus(), 0);
                }
              }}
              placeholder="Add a task… (Tab to add time)"
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-[#4648d4] focus:ring-2 focus:ring-[#4648d4]/10 transition-all placeholder:text-gray-300"
            />
            <AnimatePresence>
              {showTimeField && (
                <motion.input
                  ref={quickTimeRef}
                  key="time-field"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 96, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  value={quickTaskTime}
                  onChange={e => setQuickTaskTime(e.target.value.replace(/[^\d.hm\s]/gi, ''))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { handleQuickAddTask(); return; }
                    if (e.key === 'Escape') { setShowTimeField(false); setQuickTaskTime(''); quickTaskRef.current?.focus(); }
                    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); quickTaskRef.current?.focus(); }
                  }}
                  placeholder="e.g. 2h"
                  className="rounded-xl border border-[#4648d4]/30 bg-[#EEF2FF] px-3 py-2.5 text-sm text-[#4648d4] outline-none focus:border-[#4648d4] focus:ring-2 focus:ring-[#4648d4]/10 transition-all placeholder:text-[#4648d4]/30 font-mono"
                  style={{ minWidth: 0 }}
                />
              )}
            </AnimatePresence>
            <button
              onClick={handleQuickAddTask}
              disabled={!quickTaskTitle.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-[#4648d4] px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Plus size={13} />
              Add Task
            </button>
          </div>
          {!showTimeField && (
            <p className="mt-1.5 font-mono text-[9px] text-gray-300 pl-1">
              Press <kbd className="bg-gray-100 text-gray-500 px-1 py-px rounded text-[8px]">N</kbd> from anywhere to jump here
              {' · '}
              <kbd className="bg-gray-100 text-gray-500 px-1 py-px rounded text-[8px]">Tab</kbd> to add time estimate
            </p>
          )}
        </section>

        {goal.archived_at && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-amber-900">Archived goal</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This goal is hidden from Active and Completed, but its tasks, resources, and progress are still saved.
              </p>
            </div>
            <button
              onClick={handleRestoreGoal}
              className="bg-amber-900 text-white text-[10px] font-mono uppercase py-2 px-3 rounded-lg font-bold hover:opacity-90 shrink-0"
            >
              Restore Goal
            </button>
          </section>
        )}

        {/* ── Tasks (manual) ── */}
        {manualTasks.length > 0 && (
          <section>
            <h2 className="font-headline text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
              <CheckSquare size={15} className="text-black" />
              Tasks
              <span className="font-mono text-[10px] text-gray-400 font-normal">
                {manualTasks.filter(t => t.completed).length}/{manualTasks.length}
              </span>
            </h2>
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleManualTaskDragEnd}>
              <SortableContext items={manualTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-0.5 pl-5">
                  {manualTasks.map(task => (
                    <SortableTaskRow
                      key={task.id}
                      task={task}
                      allTasks={allTasks}
                      childrenByParent={subtasksByParent}
                      taskResources={groupedResources.taskResources}
                      onToggleSubtask={handleToggleSubtask}
                      onDeleteSubtask={handleDeleteSubtask}
                      onUpdateSubtaskTitle={handleUpdateSubtaskTitle}
                      onAddSubtask={handleAddSubtask}
                      onAttachResource={handleAttachResource}
                      onAttachFiles={handleAttachFiles}
                      onDeleteResource={handleDeleteResource}
                      onOpenFocus={setFocusedTaskId}
                      onUpdateDeadline={handleUpdateDeadline}
                      onUpdateTime={handleUpdateTime}
                      onUpdateActualTime={handleUpdateActualTime}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </section>
        )}

        {/* ── Critical Path ── */}
        {milestones.length > 0 && (
        <section>
          <h2 className="font-headline text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
            <Target size={15} className="text-black" />
            Critical Path
          </h2>

          {/* Jump bar — shown when there are 2+ milestones */}
          {milestones.length > 1 && (
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1">
              {milestones.map(m => (
                <button
                  key={m.id}
                  onClick={() => document.getElementById(`ms-${m.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                  className={`shrink-0 font-mono text-[9px] uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
                    m.critical_path_status === 'Completed'   ? 'border-emerald-200 bg-emerald-50 text-[#10B981]' :
                    m.critical_path_status === 'In Progress' ? 'border-[#4648d4]/20 bg-[#4648d4]/5 text-[#4648d4]' :
                    'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
                  }`}
                >
                  {m.title.length > 22 ? m.title.slice(0, 21) + '…' : m.title}
                </button>
              ))}
            </div>
          )}

          {milestones.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400 italic border-2 border-dashed border-gray-200 rounded-xl">
              No milestones yet. Edit the goal to add some.
            </div>
          ) : (
            <div className="space-y-3">
              {milestones.map(milestone => (
                <MilestoneCard
                  key={milestone.id}
                  milestone={milestone}
                  allTasks={allTasks}
                  subtasksByParent={subtasksByParent}
                  taskResources={groupedResources.taskResources}
                  category={goal.category}
                  goalTitle={goal.title}
                  onToggleSubtask={handleToggleSubtask}
                  onDeleteSubtask={handleDeleteSubtask}
                  onUpdateSubtaskTitle={handleUpdateSubtaskTitle}
                  onAddSubtask={handleAddSubtask}
                  onAttachResource={handleAttachResource}
                  onAttachFiles={handleAttachFiles}
                  onDeleteResource={handleDeleteResource}
                  onOpenFocus={setFocusedTaskId}
                  onUpdateDeadline={handleUpdateDeadline}
                  onUpdateTime={handleUpdateTime}
                  onUpdateActualTime={handleUpdateActualTime}
                />
              ))}
            </div>
          )}
        </section>
        )}

        {/* ── AI Micro-tasks ── */}
        {aiTasks.length > 0 && (
          <section>
            <h2 className="font-headline text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-[#4648d4]" />
              AI Micro-tasks
              <NeedsImplementationBadge />
            </h2>
            <div className="bg-[#EEF2FF] rounded-xl border border-[#4648d4]/10 p-4 space-y-2">
              {aiTasks.map(t => (
                <div
                  key={t.id}
                  onClick={() => handleToggleAiTask(t)}
                  className="bg-white rounded-lg p-3 border border-gray-150 flex items-start gap-3 cursor-pointer select-none hover:shadow-sm transition-shadow"
                >
                  <button className="text-gray-300 hover:text-[#4648d4] shrink-0 mt-0.5">
                    {t.completed
                      ? <CheckSquare size={14} className="text-[#4648d4]" />
                      : <Square size={14} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold text-gray-800 leading-tight ${t.completed ? 'line-through text-gray-400' : ''}`}>
                      {t.title}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Resources ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-headline text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <FolderOpen size={14} className="text-gray-500" />
              Goal Resources
            </h2>
            <div className="flex items-center gap-2">
              <input
                ref={goalFileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={async (e) => {
                  await handleGoalFiles(e.currentTarget.files);
                  e.currentTarget.value = '';
                }}
              />
              <button
                onClick={() => goalFileInputRef.current?.click()}
                className="flex items-center gap-1 text-[9px] font-mono uppercase bg-[#f8f9fa] hover:bg-gray-100 text-gray-500 py-1 px-2.5 rounded border border-gray-200 transition-colors"
              >
                <Upload size={11} />
                Upload Files
              </button>
              <button
                onClick={() => openAddResourceModal(goal.id)}
                className="text-[9px] font-mono uppercase bg-[#f8f9fa] hover:bg-gray-100 text-gray-500 py-1 px-2.5 rounded border border-gray-200 transition-colors"
              >
                Attach Link
              </button>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => goalFileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-200 hover:border-[#4648d4]/40 rounded-xl p-6 text-center bg-[#f8f9fa] hover:bg-white transition-all cursor-pointer flex flex-col items-center justify-center gap-2 mb-3"
          >
            <Upload className="text-gray-400" size={22} />
            <p className="text-xs font-semibold text-gray-700 flex items-center justify-center gap-2">
              <span>Drop files here or choose from file explorer</span>
            </p>
            <p className="text-[10px] text-gray-400 max-w-[170px] leading-relaxed mx-auto">
              File names and sizes are saved as goal resources.
            </p>
          </div>

          {groupedResources.goalResources.length > 0 && (
            <div className="space-y-2 animate-fade-in">
              {groupedResources.goalResources.map(res => (
                <div key={res.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-150 hover:border-gray-200 shadow-sm">
                  {res.type === 'figma'
                    ? <span className="text-red-500 shrink-0 font-bold font-mono text-xs border border-red-200 bg-red-50 p-1 rounded">F</span>
                    : <FileText size={16} className="text-gray-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{res.title}</p>
                    <p className="text-[9px] font-mono text-gray-400 truncate mt-1 uppercase tracking-widest">{res.info}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteResource(res.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {pendingComplete && (
          <ActualTimeModal
            key="actual-time"
            taskTitle={pendingComplete.title}
            estimatedMinutes={pendingComplete.estimated_minutes}
            onLog={async (minutes) => {
              await updateTask(pendingComplete.id, { actual_minutes: minutes });
              await toggleTask(pendingComplete.id);
              invalidate.tasks(selectedGoalId ?? undefined);
              setPendingComplete(null);
              triggerToast('Time logged.', 'success');
            }}
            onSkip={async () => {
              await toggleTask(pendingComplete.id);
              invalidate.tasks(selectedGoalId ?? undefined);
              setPendingComplete(null);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
