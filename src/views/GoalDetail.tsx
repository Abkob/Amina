import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, Clock, Folder, Calendar, Target, Sparkles,
  FolderOpen, Upload, FileText, CheckSquare, Square,
  Plus, Trash2, X, Paperclip, ChevronDown, ChevronRight, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { NeedsImplementationBadge } from '../components/NeedsImplementationBadge';
import { useGoal, useGoalTasks, useGoalResources, useTaskResources } from '../api/hooks';
import { archiveGoal, restoreGoal, updateGoal } from '../db/queries/goals';
import { toggleTask, createTask, deleteTask, updateTask } from '../db/queries/tasks';
import { createResource, deleteResource, detectResourceType } from '../db/queries/resources';
import { getGoalFinishEstimate } from '../utils/goalFinishEstimate';
import { formatTaskTime, getTaskEstimatedMinutes, getTaskLeafProgress, getRolledUpTime, parseTaskTimeInput } from '../utils/taskTime';
import { calculateGoalTaskMetrics, computeGoalStatus } from '../utils/goalTaskMetrics';
import { generateSuggestions } from '../utils/subtaskSuggestions';
import type { DBTask, DBResource, CriticalPathStatus } from '../db/schema';

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

// ─── Suggestion chips ──────────────────────────────────────────────────────────
function SuggestionChips({ chips, onPick }: { chips: string[]; onPick: (s: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      <NeedsImplementationBadge />
      {chips.map(chip => (
        <button
          key={chip}
          onClick={() => onPick(chip)}
          className="flex items-center gap-1 text-[10px] font-mono bg-[#EEF2FF] hover:bg-[#dde3ff] text-[#4648d4] px-2 py-0.5 rounded-full border border-[#4648d4]/20 transition-colors"
        >
          <Sparkles size={8} />
          {chip}
        </button>
      ))}
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

  const isIso = value ? /^\d{4}-\d{2}-\d{2}/.test(value) : false;
  const parsed = isIso ? new Date(`${value!.slice(0, 10)}T00:00:00`) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = parsed ? Math.round((parsed.getTime() - today.getTime()) / 86_400_000) : null;
  const isOverdue = diffDays !== null && diffDays < 0;
  const isSoon = diffDays !== null && diffDays >= 0 && diffDays <= 3;

  const dateLabel = parsed
    ? parsed.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
        year: parsed.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      })
    : value;

  const proximityBadge =
    diffDays === 0 ? 'today' :
    diffDays === 1 ? 'tmrw' :
    diffDays !== null && diffDays > 0 && diffDays <= 6 ? `${diffDays}d` :
    diffDays !== null && diffDays < 0 ? `${Math.abs(diffDays)}d ago` :
    null;

  if (editing) {
    return (
      <input
        ref={ref}
        type="date"
        defaultValue={isIso ? value!.slice(0, 10) : ''}
        onBlur={e => { onSave(e.target.value || null); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false); }}
        className="h-[22px] rounded-full border border-[#4648d4]/40 bg-white px-2.5 text-[10px] text-[#4648d4] outline-none ring-1 ring-[#4648d4]/20"
      />
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

  return (
    <button
      onClick={() => setEditing(true)}
      title={isOverdue ? `Overdue by ${Math.abs(diffDays!)} day${Math.abs(diffDays!) === 1 ? '' : 's'}` : `Due: ${dateLabel}`}
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
      {proximityBadge && (
        <span className={`rounded-full px-1 py-px text-[8px] font-bold ${
          isOverdue ? 'bg-red-100 text-red-500' : isSoon ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'
        }`}>
          {proximityBadge}
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
  const { minutes, isRollup, conflict } = getRolledUpTime(task, allTasks);
  const progress = getTaskLeafProgress(task, allTasks);
  const ownMinutes = getTaskEstimatedMinutes(task);
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

  const isDone = progress >= 1;
  const hasProgress = progress > 0 && !isDone;
  const remainingMinutes = minutes !== null ? Math.max(0, Math.round(minutes * (1 - progress))) : null;

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

  const tooltipText = isDone
    ? `Done · estimated ${formatTaskTime(minutes)}`
    : hasProgress
    ? `${formatTaskTime(remainingMinutes)} remaining of ${formatTaskTime(minutes)} · ${Math.round(progress * 100)}% done`
    : isRollup
    ? `Summed from children: ${formatTaskTime(minutes)}`
    : `Estimated: ${formatTaskTime(minutes)}`;

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={() => setEditing(true)}
        title={tooltipText}
        className={`inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium transition-all hover:shadow-sm ${
          isDone
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:border-emerald-300'
            : hasProgress
            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
            : isRollup
            ? 'border-[#4648d4]/20 bg-[#4648d4]/5 text-[#4648d4]/70 hover:border-[#4648d4]/40'
            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#4648d4]/30 hover:bg-[#4648d4]/5 hover:text-[#4648d4]'
        }`}
      >
        <Clock size={9} className="shrink-0" />
        {isRollup && !isDone && <span className="text-[8px] opacity-50 font-bold">Σ</span>}

        {isDone ? (
          <span className="flex items-center gap-1">
            <Check size={9} />
            <span>{formatTaskTime(minutes)}</span>
          </span>
        ) : hasProgress ? (
          <span className="flex items-center gap-1">
            <span className="font-semibold">{formatTaskTime(remainingMinutes)}</span>
            <span className="text-[9px] opacity-40">/</span>
            <span className="text-[9px] opacity-50">{formatTaskTime(minutes)}</span>
          </span>
        ) : (
          <span>{formatTaskTime(minutes)}</span>
        )}
      </button>
      {conflict && !isDone && (
        <span title="Own estimate differs from children's sum" className="cursor-help text-amber-400 text-[11px] leading-none">⚠</span>
      )}
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
}) {
  const children = childrenByParent[task.id] ?? [];
  const resources = taskResources[task.id] ?? [];
  const [expanded, setExpanded] = useState(depth === 0);
  const [addingChild, setAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [showResourceInput, setShowResourceInput] = useState(false);
  const [resourceInput, setResourceInput] = useState('');
  const resRef = useRef<HTMLInputElement>(null);
  const childRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (showResourceInput) resRef.current?.focus(); }, [showResourceInput]);
  useEffect(() => { if (addingChild) childRef.current?.focus(); }, [addingChild]);

  const submitResource = () => {
    const val = resourceInput.trim();
    if (!val) { setShowResourceInput(false); return; }
    const type = detectResourceType(val);
    const url = type !== 'document' ? val : null;
    onAttachResource(task.id, val, url, type);
    setResourceInput('');
    setShowResourceInput(false);
  };

  const submitChild = async () => {
    const title = childTitle.trim();
    if (!title) return;
    await onAddSubtask(task.id, title);
    setChildTitle('');
    setAddingChild(false);
    setExpanded(true);
  };

  return (
    <div className="group/sub flex flex-col gap-1 py-1.5">
      <div className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-gray-50 transition-colors">
        <button
          onClick={() => setExpanded(v => !v)}
          className={`text-gray-300 hover:text-[#4648d4] shrink-0 transition-colors ${children.length === 0 ? 'invisible' : ''}`}
          title={expanded ? 'Collapse child tasks' : 'Expand child tasks'}
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
        <div className={`flex items-center gap-1 shrink-0 ${!task.due_date && getTaskEstimatedMinutes(task) === null ? 'opacity-0 group-hover/sub:opacity-100' : ''} transition-opacity`}>
          <DeadlinePill
            value={task.due_date}
            onSave={d => onUpdateDeadline(task.id, d)}
          />
          <InlineTimePill
            task={task}
            allTasks={allTasks}
            onSave={m => onUpdateTime(task.id, m)}
          />
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
            onClick={() => { setAddingChild(v => !v); setExpanded(true); }}
            className="text-gray-300 hover:text-[#4648d4] transition-colors p-0.5 rounded"
            title="Add child task"
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

      <AnimatePresence>
        {addingChild && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="ml-6 flex gap-2 overflow-hidden"
          >
            <input
              ref={childRef}
              value={childTitle}
              onChange={e => setChildTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitChild(); if (e.key === 'Escape') { setAddingChild(false); setChildTitle(''); } }}
              placeholder="Child task title..."
              className="flex-1 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-[11px] text-gray-700 focus:outline-none focus:border-[#4648d4] transition-all"
            />
            <button onClick={submitChild} className="bg-[#4648d4] text-white rounded-lg px-2 py-1 hover:opacity-90 transition-colors">
              <Check size={11} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded && children.length > 0 && (
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
              />
            ))}
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
}) {
  const subtasks = subtasksByParent[milestone.id] ?? [];
  const [expanded, setExpanded] = useState(milestone.critical_path_status === 'In Progress');
  const [addInput, setAddInput] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) addRef.current?.focus();
  }, [adding]);

  const handleInputChange = (val: string) => {
    setAddInput(val);
    const existing = subtasks.map(s => s.title);
    setChips(generateSuggestions(goalTitle, category, milestone.title, val, existing));
  };

  const handleAdd = async (text?: string) => {
    const t = (text ?? addInput).trim();
    if (!t) return;
    await onAddSubtask(milestone.id, t);
    setAddInput('');
    setChips([]);
    setAdding(false);
  };

  // Refresh chips on mount
  useEffect(() => {
    setChips(generateSuggestions(goalTitle, category, milestone.title, '', subtasks.map(s => s.title)));
  }, [subtasks.length]);

  const dotCls =
    milestone.critical_path_status === 'Completed'   ? 'bg-[#10B981]' :
    milestone.critical_path_status === 'In Progress' ? 'bg-[#4648d4]' :
    'bg-gray-300';

  const badgeCls =
    milestone.critical_path_status === 'Completed'   ? 'bg-emerald-50 text-[#10B981]' :
    milestone.critical_path_status === 'In Progress' ? 'bg-[#4648d4]/10 text-[#4648d4]' :
    'bg-gray-100 text-gray-400';

  return (
    <div className="bg-white rounded-xl border border-gray-150 shadow-sm overflow-hidden">
      {/* Milestone header */}
      <div className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#f8f9fa] transition-colors">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-gray-400 hover:text-[#4648d4] transition-colors shrink-0"
          title={expanded ? 'Collapse milestone' : 'Expand milestone'}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`} />
        <span className="flex-1 min-w-0">
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
        <DeadlinePill
          value={milestone.due_date}
          label="milestone deadline"
          onSave={d => onUpdateDeadline(milestone.id, d)}
        />
        <InlineTimePill
          task={milestone}
          allTasks={allTasks}
          onSave={m => onUpdateTime(milestone.id, m)}
        />
        <button
          onClick={() => onOpenFocus(milestone.id)}
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
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-gray-300 italic mb-3">No subtasks yet.</p>
              )}

              {/* Add subtask */}
              {adding ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      ref={addRef}
                      value={addInput}
                      onChange={e => handleInputChange(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setAddInput(''); setChips([]); } }}
                      placeholder="Subtask title…"
                      className="flex-1 bg-[#f8f9fa] border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-[#4648d4] transition-all"
                    />
                    <button onClick={() => handleAdd()} className="bg-[#4648d4] text-white rounded-lg px-2.5 py-1.5 hover:opacity-90 transition-colors">
                      <Plus size={12} />
                    </button>
                    <button onClick={() => { setAdding(false); setAddInput(''); setChips([]); }} className="text-gray-300 hover:text-gray-500 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <SuggestionChips chips={chips} onPick={text => handleAdd(text)} />
                </div>
              ) : (
                <button
                  onClick={() => { setAdding(true); setChips(generateSuggestions(goalTitle, category, milestone.title, '', subtasks.map(s => s.title))); }}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-gray-400 hover:text-[#4648d4] transition-colors"
                >
                  <Plus size={11} /> Add subtask
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
  const goalTitleRef = useRef<HTMLInputElement>(null);
  const goalFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingGoalTitle) goalTitleRef.current?.focus(); }, [editingGoalTitle]);

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

  if (!goal) return null;

  // Derive tree
  const milestones = allTasks.filter(t => t.kind === 'critical_path' && !t.parent_task_id);
  const aiTasks    = allTasks.filter(t => t.kind === 'ai_generated');
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
    await toggleTask(task.id);
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

          <p className="text-xs text-gray-400 mt-2">
            {milestones.length} milestone{milestones.length !== 1 ? 's' : ''}
            {' · '}
            {allTasks.filter(t => t.parent_task_id).length} subtask{allTasks.filter(t => t.parent_task_id).length !== 1 ? 's' : ''}
            {' · '}
            {taskMetrics.completedTasks}/{taskMetrics.totalTasks} done
            {taskMetrics.usesExplicitWeights && (
              <>
                {' / '}
                weighted progress
              </>
            )}
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

        {/* ── Critical Path ── */}
        <section>
          <h2 className="font-headline text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
            <Target size={15} className="text-black" />
            Critical Path
          </h2>

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
                />
              ))}
            </div>
          )}
        </section>

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
    </motion.div>
  );
}
