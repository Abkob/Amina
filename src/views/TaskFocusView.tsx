import { useEffect, useRef, useState } from 'react';
import {
  Check, CheckSquare, ChevronLeft, ChevronRight, Clock, Download,
  FileText, Paperclip, Plus, Square, Target, Trash2, Upload,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGoal, useGoalTasks, useTask, useTaskNotes, useNoteFiles } from '../api/hooks';
import { createResource, deleteResource, detectResourceType, getResourcesForTask } from '../db/queries/resources';
import {
  addTaskNote,
  createTask,
  deleteTask,
  deleteTaskNote,
  getTaskNotesForTask,
  toggleTask,
  updateTask,
} from '../db/queries/tasks';
import { useAppStore } from '../store/useAppStore';
import { normalizeTaskWeight } from '../utils/goalTaskMetrics';
import { formatTaskTime, getTaskEstimatedMinutes, getRolledUpTime, parseTaskTimeInput } from '../utils/taskTime';
import { addNoteFile, deleteNoteFile, getNoteFilesForNote } from '../db/queries/noteFiles';
import type { DBResource, DBTask, DBTaskNote, DBTaskNoteFile } from '../db/schema';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildTaskPath(task: DBTask, tasks: DBTask[]) {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const path: DBTask[] = [];
  let cursor: DBTask | undefined = task;

  while (cursor) {
    path.unshift(cursor);
    cursor = cursor.parent_task_id ? byId.get(cursor.parent_task_id) : undefined;
  }

  return path;
}

function dateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'undated';
  return date.toLocaleDateString('en-CA');
}

function formatJournalDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Undated';

  const today = dateKey(new Date().toISOString());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const prefix =
    dateKey(value) === today ? 'Today' :
    dateKey(value) === dateKey(yesterday.toISOString()) ? 'Yesterday' :
    date.toLocaleDateString('en-US', { weekday: 'short' });

  return `${prefix}, ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })}`;
}

function formatJournalTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function groupNotesByDate(notes: DBTaskNote[]) {
  const groups: { key: string; label: string; notes: DBTaskNote[] }[] = [];

  [...notes]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .forEach(note => {
      const key = dateKey(note.created_at);
      const group = groups.find(item => item.key === key);
      if (group) group.notes.push(note);
      else groups.push({ key, label: formatJournalDate(note.created_at), notes: [note] });
    });

  return groups;
}

function ResourceItem({ resource, onDelete }: { resource: DBResource; onDelete: () => void }) {
  const body = (
    <>
      <FileText size={14} className="text-gray-400 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-800 truncate">{resource.title}</p>
        <p className="text-[9px] font-mono text-gray-400 uppercase tracking-widest truncate">{resource.info}</p>
      </div>
    </>
  );

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-150 bg-white p-3 shadow-sm">
      {resource.url ? (
        <a href={resource.url} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
          {body}
        </a>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      <button onClick={onDelete} className="text-gray-300 hover:text-red-400 transition-colors">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function WeightPill({
  value,
  onSave,
}: {
  value: number | null | undefined;
  onSave: (weight: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value === null || value === undefined ? '' : String(value));
  }, [editing, value]);

  const commit = () => {
    const trimmed = draft.trim();
    onSave(trimmed === '' ? null : normalizeTaskWeight(Number(trimmed)));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(value === null || value === undefined ? '' : String(value));
            setEditing(false);
          }
        }}
        className="w-12 shrink-0 rounded-md border border-[#4648d4]/30 bg-white px-1.5 py-0.5 text-right font-mono text-[10px] font-bold text-[#4648d4] outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="shrink-0 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-gray-400 hover:border-[#4648d4]/30 hover:text-[#4648d4]"
      title={value === null || value === undefined ? 'Auto share of remaining progress percent' : `Progress weight: ${value}%`}
    >
      {value === null || value === undefined ? 'Auto %' : `${value}%`}
    </button>
  );
}

function TimePill({
  task,
  allTasks,
  onSave,
}: {
  task: DBTask;
  allTasks: DBTask[];
  onSave: (minutes: number | null) => void;
}) {
  const { minutes, isRollup, conflict, childrenSum } = getRolledUpTime(task, allTasks);
  const ownMinutes = getTaskEstimatedMinutes(task);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ownMinutes === null ? '' : formatTaskTime(ownMinutes));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(ownMinutes === null ? '' : formatTaskTime(ownMinutes));
  }, [editing, task.estimated_minutes, task.estimated_duration]);

  const commit = () => {
    const trimmed = draft.trim();
    onSave(trimmed === '' ? null : parseTaskTimeInput(trimmed));
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/[^\d.hm\s]/gi, ''))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(ownMinutes === null ? '' : formatTaskTime(ownMinutes));
            setEditing(false);
          }
        }}
        placeholder="1h 30m"
        className="w-16 shrink-0 rounded-md border border-[#4648d4]/30 bg-white px-1.5 py-0.5 text-right font-mono text-[10px] font-bold text-[#4648d4] outline-none"
      />
    );
  }

  const tooltip = isRollup
    ? conflict
      ? `Children sum: ${formatTaskTime(childrenSum)} · own override: ${formatTaskTime(ownMinutes)} — click to fix override`
      : `Auto-summed from child tasks: ${formatTaskTime(minutes)}`
    : (minutes === null ? 'No time set — click to add' : `Time needed: ${formatTaskTime(minutes)}`);

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        onClick={() => setEditing(true)}
        title={tooltip}
        className={`inline-flex items-center gap-1 rounded-md border bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors hover:border-[#4648d4]/30 hover:text-[#4648d4] ${isRollup ? 'border-[#4648d4]/20 text-[#4648d4]/70' : 'border-gray-200 text-gray-400'}`}
      >
        <Clock size={9} />
        {isRollup && <span className="text-[7px] opacity-60">Σ</span>}
        {formatTaskTime(minutes)}
      </button>
      {conflict && (
        <span
          title={`Conflict: own estimate (${formatTaskTime(ownMinutes)}) ≠ children sum (${formatTaskTime(childrenSum)}). Edit to resolve.`}
          className="cursor-help text-[11px] text-amber-400"
        >
          ⚠
        </span>
      )}
    </span>
  );
}

function SectionPlanningWidgets({
  task,
  allTasks,
  onSaveWeight,
  onSaveTime,
  className = '',
}: {
  task: DBTask;
  allTasks: DBTask[];
  onSaveWeight: (weight: number | null) => void;
  onSaveTime: (minutes: number | null) => void;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      <div className="min-w-0 rounded-lg border border-gray-150 bg-[#f8f9fa] px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-gray-400">Progress</span>
          <Target size={10} className="shrink-0 text-gray-300" />
        </div>
        <WeightPill value={task.weight_percent} onSave={onSaveWeight} />
      </div>
      <div className="min-w-0 rounded-lg border border-gray-150 bg-[#f8f9fa] px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-gray-400">Time Needed</span>
          <Clock size={10} className="shrink-0 text-gray-300" />
        </div>
        <TimePill task={task} allTasks={allTasks} onSave={onSaveTime} />
      </div>
    </div>
  );
}

function ChildTaskRow({
  task,
  childCount,
  onOpen,
  onToggle,
  onDelete,
}: {
  task: DBTask;
  childCount: number;
  onOpen: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-150 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onToggle} className="text-gray-300 hover:text-[#4648d4] transition-colors">
          {task.completed ? <CheckSquare size={15} className="text-[#10B981]" /> : <Square size={15} />}
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className={`truncate text-xs font-semibold text-gray-800 ${task.completed ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </p>
          <p className="mt-0.5 text-[9px] font-mono uppercase tracking-widest text-gray-400">
            {childCount} child task{childCount !== 1 ? 's' : ''}
          </p>
        </button>
        <button onClick={onOpen} className="rounded-md p-1 text-gray-300 hover:bg-gray-50 hover:text-[#4648d4] transition-colors" title="Open focus page">
          <ChevronRight size={14} />
        </button>
        <button onClick={onDelete} className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── PDF / Image viewer modal ─────────────────────────────────────────────────
function FileViewerModal({ file, onClose }: { file: DBTaskNoteFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isPdf    = file.mime_type === 'application/pdf';
  const isImage  = file.mime_type.startsWith('image/');

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file.blob]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[60] flex flex-col bg-black/95"
    >
      {/* toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#0d0d0d] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${isPdf ? 'bg-red-500/20 text-red-400' : isImage ? 'bg-[#4648d4]/20 text-[#c0c1ff]' : 'bg-white/10 text-gray-400'}`}>
            {isPdf ? 'PDF' : isImage ? 'IMG' : 'FILE'}
          </span>
          <span className="truncate text-sm font-semibold text-white">{file.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-gray-500">{formatBytes(file.size)}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {url && (
            <a
              href={url}
              download={file.name}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[10px] text-gray-300 transition-colors hover:border-white/20 hover:text-white"
            >
              <Download size={11} />
              Download
            </a>
          )}
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            title="Close (Esc)"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* viewer area */}
      <div className="relative min-h-0 flex-1">
        {!url && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-sm text-gray-500">
            Loading…
          </div>
        )}
        {url && isPdf && (
          <iframe
            src={url}
            className="absolute inset-0 h-full w-full border-0"
            title={file.name}
          />
        )}
        {url && isImage && (
          <div className="absolute inset-0 flex items-center justify-center overflow-auto p-8">
            <img
              src={url}
              alt={file.name}
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
            />
          </div>
        )}
        {url && !isPdf && !isImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-gray-400">
            <FileText size={48} className="opacity-20" />
            <p className="font-mono text-sm">Preview not available for this file type.</p>
            <a
              href={url}
              download={file.name}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 font-mono text-sm text-white transition-colors hover:bg-white/15"
            >
              <Download size={14} />
              Download {file.name}
            </a>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Single file chip attached to a journal entry ─────────────────────────────
function NoteFileChip({
  file,
  onView,
  onDelete,
}: {
  file: DBTaskNoteFile;
  onView: () => void;
  onDelete: () => void;
}) {
  const isPdf      = file.mime_type === 'application/pdf';
  const isViewable = isPdf || file.mime_type.startsWith('image/');

  return (
    <span className="group/chip inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] shadow-sm">
      <FileText size={11} className={`shrink-0 ${isPdf ? 'text-red-400' : 'text-gray-400'}`} />
      <span className="max-w-[140px] truncate font-medium leading-none text-gray-700">{file.name}</span>
      <span className="shrink-0 font-mono text-[9px] text-gray-400">{formatBytes(file.size)}</span>
      {isViewable && (
        <button
          onClick={onView}
          className="shrink-0 rounded bg-[#4648d4]/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#4648d4] transition-colors hover:bg-[#4648d4]/20"
        >
          View
        </button>
      )}
      <button
        onClick={onDelete}
        className="shrink-0 opacity-0 text-gray-300 transition-all hover:text-red-400 group-hover/chip:opacity-100"
      >
        <Trash2 size={9} />
      </button>
    </span>
  );
}

// ─── One journal entry with file attachment support ───────────────────────────
function NoteArticle({
  note,
  onDelete,
  onView,
}: {
  note: DBTaskNote;
  onDelete: () => void;
  onView: (file: DBTaskNoteFile) => void;
}) {
  const { triggerToast, showConfirm } = useAppStore();
  const { data: files = [] } = useNoteFiles(note.id);
  const attachRef = useRef<HTMLInputElement>(null);

  const handleAttach = async (list: FileList | null) => {
    const items = Array.from(list ?? []);
    if (!items.length) return;
    for (const f of items) await addNoteFile(note.id, f);
    triggerToast(`${items.length} file${items.length === 1 ? '' : 's'} attached.`, 'success');
  };

  const handleRemoveFile = (f: DBTaskNoteFile) => {
    showConfirm(`Remove "${f.name}" from this entry?`, async () => {
      await deleteNoteFile(f.id);
      triggerToast('Attachment removed.', 'info');
    });
  };

  return (
    <article className="group/note -mx-2 rounded-lg border border-transparent px-2 py-2.5 transition-colors hover:border-gray-100 hover:bg-[#fafafa]">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <time className="font-mono text-[9px] uppercase tracking-widest text-gray-300">
          {formatJournalTime(note.created_at)}
        </time>
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover/note:opacity-100">
          <button
            onClick={() => attachRef.current?.click()}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[9px] text-gray-400 transition-colors hover:bg-[#EEF2FF] hover:text-[#4648d4]"
            title="Attach document"
          >
            <Paperclip size={10} />
            Attach
          </button>
          <input
            ref={attachRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => { handleAttach(e.currentTarget.files); e.currentTarget.value = ''; }}
          />
          <button
            onClick={onDelete}
            className="text-gray-300 transition-colors hover:text-red-400"
            title="Delete entry"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{note.content}</p>

      {files.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {files.map(f => (
            <NoteFileChip
              key={f.id}
              file={f}
              onView={() => onView(f)}
              onDelete={() => handleRemoveFile(f)}
            />
          ))}
        </div>
      )}
    </article>
  );
}

export function TaskFocusView() {
  const {
    selectedGoalId,
    focusedTaskId,
    setFocusedTaskId,
    triggerToast,
    showConfirm,
  } = useAppStore();

  const [childTitle, setChildTitle] = useState('');
  const [resourceInput, setResourceInput] = useState('');
  const [journalDraft, setJournalDraft] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [viewingFile, setViewingFile] = useState<DBTaskNoteFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: goal }           = useGoal(selectedGoalId);
  const { data: task }           = useTask(focusedTaskId);
  const { data: allTasks = [] }  = useGoalTasks(selectedGoalId);
  const { data: taskNotes = [] } = useTaskNotes(focusedTaskId);

  const [resources, setResources] = useState<DBResource[]>([]);
  useEffect(() => {
    if (!focusedTaskId) { setResources([]); return; }
    const load = () => getResourcesForTask(focusedTaskId).then(setResources).catch(() => {});
    load();
    const id = setInterval(load, 800);
    return () => clearInterval(id);
  }, [focusedTaskId]);

  useEffect(() => {
    if (task) setTaskTitle(task.title);
  }, [task?.id, task?.title]);

  useEffect(() => {
    setJournalDraft('');
  }, [task?.id]);

  if (!goal || !task || !selectedGoalId) return null;

  const childrenByParent = allTasks.reduce<Record<string, DBTask[]>>((acc, item) => {
    if (!item.parent_task_id) return acc;
    acc[item.parent_task_id] = [...(acc[item.parent_task_id] ?? []), item];
    return acc;
  }, {});
  const children = childrenByParent[task.id] ?? [];
  const path = buildTaskPath(task, allTasks);
  const noteGroups = groupNotesByDate(taskNotes);

  const attachResource = async (title: string, url: string | null, type: DBResource['type'], info = 'attached now') => {
    await createResource({ title, url, type, info }, goal.id, task.id);
    triggerToast('Resource attached.', 'success');
  };

  const handleAttachTextResource = async () => {
    const value = resourceInput.trim();
    if (!value) return;
    const type = detectResourceType(value);
    await attachResource(value, type === 'document' ? null : value, type);
    setResourceInput('');
  };

  const handleFiles = async (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    if (selected.length === 0) return;

    for (const file of selected) {
      await attachResource(file.name, null, 'document', `${formatBytes(file.size)} from file picker`);
    }
  };

  const handleAddJournalEntry = async () => {
    const content = journalDraft.trim();
    if (!content) return;

    await addTaskNote(task.id, content);
    setJournalDraft('');
    triggerToast('Journal entry appended.', 'success');
  };

  const handleAddChild = async () => {
    const title = childTitle.trim();
    if (!title) return;

    await createTask({
      goal_id: goal.id,
      parent_task_id: task.id,
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
      position: children.length,
    });
    setChildTitle('');
    triggerToast('Child task added.', 'success');
  };

  const saveTaskTitle = async () => {
    const title = taskTitle.trim();
    if (!title) {
      setTaskTitle(task.title);
      return;
    }
    if (title !== task.title) await updateTask(task.id, { title });
  };

  const saveTaskWeight = async (weight: number | null) => {
    await updateTask(task.id, { weight_percent: weight });
  };

  const saveTaskTime = async (minutes: number | null) => {
    await updateTask(task.id, {
      estimated_minutes: minutes,
      estimated_duration: minutes === null ? null : formatTaskTime(minutes),
    });
  };

  const handleDeleteResource = (resourceId: string) => {
    showConfirm('Remove this resource?', async () => {
      await deleteResource(resourceId);
      triggerToast('Resource removed.', 'info');
    });
  };

  const handleDeleteChild = (child: DBTask) => {
    showConfirm(`Delete "${child.title}" and its children?`, async () => {
      await deleteTask(child.id);
      triggerToast('Task branch removed.', 'info');
    });
  };

  const handleDeleteJournalEntry = (note: DBTaskNote) => {
    showConfirm(`Delete journal entry from ${formatJournalDate(note.created_at)}?`, async () => {
      await deleteTaskNote(note.id);
      triggerToast('Journal entry removed.', 'info');
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-[980px] px-4 py-6 md:px-10"
    >
      <button
        onClick={() => setFocusedTaskId(null)}
        className="group mb-5 flex cursor-pointer items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-gray-400 hover:text-black"
      >
        <ChevronLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
        Back to Goal
      </button>

      <header className="mb-6 border-b border-gray-100 pb-5">
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-gray-400">
          <button onClick={() => setFocusedTaskId(null)} className="hover:text-[#4648d4]">{goal.title}</button>
          {path.map((item) => (
            <span key={item.id} className="flex items-center gap-1.5">
              <ChevronRight size={11} />
              <button onClick={() => setFocusedTaskId(item.id)} className="max-w-[180px] truncate hover:text-[#4648d4]">
                {item.title}
              </button>
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={() => toggleTask(task.id)}
                className="text-gray-300 hover:text-[#4648d4] transition-colors"
              >
                {task.completed ? <CheckSquare size={18} className="text-[#10B981]" /> : <Square size={18} />}
              </button>
              <span className="rounded-md bg-[#EEF2FF] px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest text-[#4648d4]">
                Focus Section
              </span>
            </div>
            <input
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              onBlur={saveTaskTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setTaskTitle(task.title);
                  e.currentTarget.blur();
                }
              }}
              className="w-full bg-transparent font-headline text-2xl font-black leading-tight text-gray-900 outline-none focus:text-[#4648d4]"
            />
            <p className="mt-2 text-xs text-gray-400">
              {children.length} child task{children.length !== 1 ? 's' : ''} / {resources.length} resource{resources.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={async (e) => {
                await handleFiles(e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-widest text-gray-500 hover:bg-gray-50"
            >
              <Upload size={13} />
              Upload Files
            </button>
          </div>
        </div>
        <SectionPlanningWidgets
          task={task}
          allTasks={allTasks}
          onSaveWeight={saveTaskWeight}
          onSaveTime={saveTaskTime}
          className="mt-4 max-w-md"
        />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-gray-500" />
              <h2 className="font-headline text-sm font-bold text-gray-900">Section Journal</h2>
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400">
              {taskNotes.length} entr{taskNotes.length === 1 ? 'y' : 'ies'}
            </span>
          </div>

          <div className="mb-5 rounded-lg border border-gray-150 bg-[#f8f9fa] p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-gray-400">
                {formatJournalDate(new Date().toISOString())}
              </span>
              <button
                onClick={handleAddJournalEntry}
                disabled={!journalDraft.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#4648d4] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={11} />
                Append
              </button>
            </div>
            <textarea
              value={journalDraft}
              onChange={e => setJournalDraft(e.target.value)}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddJournalEntry();
              }}
              placeholder="Write today's section note..."
              className="min-h-[120px] w-full resize-y bg-transparent text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-300"
            />
          </div>

          {noteGroups.length > 0 ? (
            <div className="space-y-5">
              {noteGroups.map(group => (
                <div key={group.key} className="border-t border-gray-100 pt-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      {group.label}
                    </span>
                    <span className="h-px flex-1 bg-gray-100" />
                  </div>
                  <div className="space-y-1">
                    {group.notes.map(note => (
                      <NoteArticle
                        key={note.id}
                        note={note}
                        onDelete={() => handleDeleteJournalEntry(note)}
                        onView={file => setViewingFile(file)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-[11px] text-gray-300">
              No journal entries yet.
            </p>
          )}
        </section>

        <aside className="space-y-6">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-sm font-bold text-gray-900">Child Tasks</h2>
            </div>

            <div className="mb-3 flex gap-2">
              <input
                value={childTitle}
                onChange={e => setChildTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddChild(); }}
                placeholder="New child task"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-[#4648d4]"
              />
              <button onClick={handleAddChild} className="rounded-lg bg-[#4648d4] px-2.5 py-1.5 text-white hover:opacity-90">
                <Plus size={13} />
              </button>
            </div>

            <div className="space-y-2">
              {children.length > 0 ? children.map(child => (
                <ChildTaskRow
                  key={child.id}
                  task={child}
                  childCount={(childrenByParent[child.id] ?? []).length}
                  onOpen={() => setFocusedTaskId(child.id)}
                  onToggle={() => toggleTask(child.id)}
                  onDelete={() => handleDeleteChild(child)}
                />
              )) : (
                <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-[11px] text-gray-300">No child tasks yet.</p>
              )}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-1.5">
              <Paperclip size={14} className="text-gray-500" />
              <h2 className="font-headline text-sm font-bold text-gray-900">Resources</h2>
            </div>

            <div className="mb-3 flex gap-2">
              <input
                value={resourceInput}
                onChange={e => setResourceInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAttachTextResource(); }}
                placeholder="URL or filename"
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-[#4648d4]"
              />
              <button onClick={handleAttachTextResource} className="rounded-lg bg-[#4648d4] px-2.5 py-1.5 text-white hover:opacity-90">
                <Check size={13} />
              </button>
            </div>

            <div className="space-y-2">
              {resources.length > 0 ? resources.map(resource => (
                <ResourceItem
                  key={resource.id}
                  resource={resource}
                  onDelete={() => handleDeleteResource(resource.id)}
                />
              )) : (
                <p className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-[11px] text-gray-300">No resources attached.</p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <AnimatePresence>
        {viewingFile && (
          <FileViewerModal
            key="file-viewer"
            file={viewingFile}
            onClose={() => setViewingFile(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
