import { useEffect, useRef, useState } from 'react';
import {
  Check, CheckSquare, ChevronLeft, ChevronRight, Clock, Download,
  Eye, FileText, Paperclip, Plus, Square, Target, Trash2, Upload, X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useGoal, useGoalTasks, useTask, useTaskNotes, useNoteFiles, useInvalidate } from '../api/hooks';
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
import { ActualTimeModal } from '../components/ActualTimeModal';
import { ActualTimeChip } from '../components/ActualTimeChip';
import { FileViewerModal } from '../components/FileViewerModal';
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
  const { minutes, isRollup, ownMinutes, childrenSum } = getRolledUpTime(task, allTasks);

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

  const hasOverhead = isRollup && ownMinutes !== null && childrenSum !== null;
  const tooltip = isRollup
    ? hasOverhead
      ? `${formatTaskTime(minutes)} total · ${formatTaskTime(ownMinutes)} own + ${formatTaskTime(childrenSum)} subtasks`
      : `Auto-summed from subtasks: ${formatTaskTime(minutes)}`
    : (minutes === null ? 'No time set — click to add' : `Time needed: ${formatTaskTime(minutes)}`);

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button
        onClick={() => setEditing(true)}
        title={tooltip}
        className={`inline-flex items-center gap-1 rounded-md border bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors hover:border-[#4648d4]/30 hover:text-[#4648d4] ${isRollup ? 'border-[#4648d4]/20 text-[#4648d4]/70' : 'border-gray-200 text-gray-400'}`}
      >
        <Clock size={9} />
        {isRollup && <span className="text-[7px] opacity-60">{hasOverhead ? '+' : 'Σ'}</span>}
        {formatTaskTime(minutes)}
      </button>
    </span>
  );
}

function SectionPlanningWidgets({
  task,
  allTasks,
  onSaveTime,
  className = '',
}: {
  task: DBTask;
  allTasks: DBTask[];
  onSaveTime: (minutes: number | null) => void;
  className?: string;
}) {
  return (
    <div className={className}>
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
// ─── Live image thumbnail for pending (not-yet-uploaded) files ────────────────
function PendingImageThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.18 }}
      className="group/pthumb relative shrink-0"
    >
      {url ? (
        <img
          src={url}
          alt={file.name}
          className="h-20 w-auto max-w-[160px] rounded-xl border border-gray-100 object-cover shadow-sm"
        />
      ) : (
        <div className="h-20 w-24 animate-pulse rounded-xl bg-gray-100" />
      )}
      {/* filename tooltip on hover */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/50 to-transparent px-1.5 pb-1 pt-4 opacity-0 transition-opacity group-hover/pthumb:opacity-100">
        <p className="truncate text-center font-mono text-[8px] text-white">{file.name}</p>
      </div>
      {/* remove button */}
      <button
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm opacity-0 transition-opacity hover:bg-red-50 group-hover/pthumb:opacity-100"
        title="Remove"
      >
        <X size={8} className="text-red-400" />
      </button>
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

      {files.length > 0 && (() => {
        const images = files.filter(f => f.mime_type.startsWith('image/'));
        const others = files.filter(f => !f.mime_type.startsWith('image/'));
        return (
          <>
            {images.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {images.map(f => (
                  <div key={f.id} className="group/img relative cursor-pointer" onClick={() => onView(f)}>
                    <img
                      src={f.file_url ?? ''}
                      alt={f.name}
                      className="h-24 w-auto max-w-[180px] rounded-lg border border-gray-100 object-cover shadow-sm transition-all group-hover/img:brightness-90 group-hover/img:shadow-md"
                    />
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-black/0 opacity-0 transition-all group-hover/img:bg-black/20 group-hover/img:opacity-100">
                      <Eye size={14} className="text-white drop-shadow" />
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleRemoveFile(f); }}
                      className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow opacity-0 transition-opacity hover:bg-red-50 group-hover/img:opacity-100"
                      title="Remove"
                    >
                      <X size={8} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {others.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {others.map(f => (
                  <NoteFileChip
                    key={f.id}
                    file={f}
                    onView={() => onView(f)}
                    onDelete={() => handleRemoveFile(f)}
                  />
                ))}
              </div>
            )}
          </>
        );
      })()}
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

  const invalidate = useInvalidate();

  const [childTitle, setChildTitle] = useState('');
  const [resourceInput, setResourceInput] = useState('');
  const [journalDraft, setJournalDraft] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [viewingFile, setViewingFile] = useState<DBTaskNoteFile | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingComplete, setPendingComplete] = useState<DBTask | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const journalFileRef = useRef<HTMLInputElement>(null);

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

  // ── Hierarchy navigation context (computed before hooks that depend on them) ─
  const parent = task?.parent_task_id
    ? (allTasks.find(t => t.id === task!.parent_task_id) ?? null)
    : null;
  const siblings = task
    ? allTasks
        .filter(t => t.parent_task_id === task.parent_task_id)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    : [];
  const sibIdx  = task ? siblings.findIndex(s => s.id === task.id) : -1;
  const prevSib = sibIdx > 0 ? siblings[sibIdx - 1] : null;
  const nextSib = sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : null;

  // Keyboard hierarchy navigation — Alt+Arrows move through the tree, Esc exits
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (parent) setFocusedTaskId(parent.id);
          else setFocusedTaskId(null);
        }
        if (e.key === 'ArrowLeft' && prevSib) { e.preventDefault(); setFocusedTaskId(prevSib.id); }
        if (e.key === 'ArrowRight' && nextSib) { e.preventDefault(); setFocusedTaskId(nextSib.id); }
      }
      if (e.key === 'Escape' && !inInput) setFocusedTaskId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [parent?.id, prevSib?.id, nextSib?.id]);

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

  const addPendingFiles = (files: File[]) => {
    if (files.length) setPendingFiles(prev => [...prev, ...files]);
  };

  const handleJournalPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      addPendingFiles(files);
    }
    // If no files in clipboard, let the default paste behaviour handle text
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear when leaving the container itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addPendingFiles(Array.from(e.dataTransfer.files));
  };

  const handleAddJournalEntry = async () => {
    const content = journalDraft.trim();
    if (!content && pendingFiles.length === 0) return;

    const noteId = await addTaskNote(task.id, content || '—');
    for (const f of pendingFiles) await addNoteFile(noteId, f);

    setJournalDraft('');
    setPendingFiles([]);
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
      {/* ── Hierarchy nav rail ─────────────────────────────────────────── */}
      <div className="mb-5 flex items-start justify-between gap-4">
        {/* Left: breadcrumb + parent shortcut */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-gray-400">
            <button
              onClick={() => setFocusedTaskId(null)}
              className="max-w-[140px] truncate hover:text-[#4648d4] transition-colors"
              title={goal.title}
            >
              {goal.title}
            </button>
            {path.map(item => (
              <span key={item.id} className="flex items-center gap-1 min-w-0">
                <ChevronRight size={10} className="text-gray-300 shrink-0" />
                <button
                  onClick={() => setFocusedTaskId(item.id)}
                  className={`max-w-[160px] truncate transition-colors ${
                    item.id === task.id
                      ? 'text-gray-700 font-bold pointer-events-none'
                      : 'hover:text-[#4648d4]'
                  }`}
                  title={item.title}
                >
                  {item.title}
                </button>
              </span>
            ))}
          </div>

          {/* Parent jump or back-to-goal */}
          {parent ? (
            <button
              onClick={() => setFocusedTaskId(parent.id)}
              className="mt-2 flex items-center gap-1 font-mono text-[9px] text-gray-400 hover:text-[#4648d4] transition-colors group/up"
              title={`Go to parent (Alt+↑)`}
            >
              <ChevronLeft size={11} className="transition-transform group-hover/up:-translate-x-0.5" />
              <span className="max-w-[200px] truncate">{parent.title}</span>
              <kbd className="ml-1.5 rounded bg-gray-100 px-1 py-px font-mono text-[7px] text-gray-400">Alt+↑</kbd>
            </button>
          ) : (
            <button
              onClick={() => setFocusedTaskId(null)}
              className="mt-2 flex items-center gap-1 font-mono text-[9px] text-gray-400 hover:text-[#4648d4] transition-colors group/up"
            >
              <ChevronLeft size={11} className="transition-transform group-hover/up:-translate-x-0.5" />
              Back to Goal
              <kbd className="ml-1.5 rounded bg-gray-100 px-1 py-px font-mono text-[7px] text-gray-400">Esc</kbd>
            </button>
          )}
        </div>

        {/* Right: sibling navigator */}
        {siblings.length > 1 && (
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1">
              <button
                onClick={() => prevSib && setFocusedTaskId(prevSib.id)}
                disabled={!prevSib}
                title={prevSib ? `← ${prevSib.title}` : undefined}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-gray-400 transition-colors hover:border-[#4648d4]/30 hover:text-[#4648d4] disabled:cursor-not-allowed disabled:opacity-25"
              >
                <ChevronLeft size={12} />
                {prevSib && (
                  <span className="max-w-[80px] truncate font-mono text-[9px] hidden sm:block">{prevSib.title}</span>
                )}
              </button>

              <span className="px-2 font-mono text-[9px] text-gray-400 tabular-nums">
                {sibIdx + 1}/{siblings.length}
              </span>

              <button
                onClick={() => nextSib && setFocusedTaskId(nextSib.id)}
                disabled={!nextSib}
                title={nextSib ? `${nextSib.title} →` : undefined}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-gray-400 transition-colors hover:border-[#4648d4]/30 hover:text-[#4648d4] disabled:cursor-not-allowed disabled:opacity-25"
              >
                {nextSib && (
                  <span className="max-w-[80px] truncate font-mono text-[9px] hidden sm:block">{nextSib.title}</span>
                )}
                <ChevronRight size={12} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="rounded bg-gray-100 px-1 py-px font-mono text-[7px] text-gray-400">Alt+←</kbd>
              <span className="font-mono text-[7px] text-gray-300">siblings</span>
              <kbd className="rounded bg-gray-100 px-1 py-px font-mono text-[7px] text-gray-400">Alt+→</kbd>
            </div>
          </div>
        )}
      </div>

      <header className="mb-6 border-b border-gray-100 pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={async () => {
                  if (task.completed) {
                    await toggleTask(task.id);
                    invalidate.tasks(selectedGoalId ?? undefined);
                  } else {
                    setPendingComplete(task);
                  }
                }}
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
          onSaveTime={saveTaskTime}
          className="mt-4 max-w-xs"
        />
        {task.completed && task.actual_minutes != null && (
          <div className="mt-3 flex items-center gap-2">
            <span className="font-mono text-[9px] uppercase tracking-widest text-gray-400">Actual:</span>
            <ActualTimeChip
              minutes={task.actual_minutes}
              estimatedMinutes={task.estimated_minutes}
              onSave={async (m) => { await updateTask(task.id, { actual_minutes: m }); }}
            />
          </div>
        )}
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

          <div
            className={`relative mb-5 rounded-lg border bg-[#f8f9fa] p-3 transition-colors ${isDragOver ? 'border-[#4648d4] bg-[#EEF2FF]/40' : 'border-gray-150'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Drop overlay */}
            {isDragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#4648d4] bg-[#EEF2FF]/80">
                <Paperclip size={22} className="text-[#4648d4]" />
                <span className="font-mono text-xs font-bold text-[#4648d4] uppercase tracking-widest">Drop files to attach</span>
              </div>
            )}

            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-gray-400">
                {formatJournalDate(new Date().toISOString())}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => journalFileRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 font-mono text-[9px] text-gray-500 transition-colors hover:border-[#4648d4]/40 hover:text-[#4648d4]"
                  title="Attach files (or paste / drag-and-drop)"
                >
                  <Paperclip size={10} />
                  Files
                </button>
                <input
                  ref={journalFileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    addPendingFiles(Array.from(e.currentTarget.files ?? []));
                    e.currentTarget.value = '';
                  }}
                />
                <button
                  onClick={handleAddJournalEntry}
                  disabled={!journalDraft.trim() && pendingFiles.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#4648d4] px-2.5 py-1.5 font-mono text-[9px] font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={11} />
                  Append
                </button>
              </div>
            </div>
            <textarea
              value={journalDraft}
              onChange={e => setJournalDraft(e.target.value)}
              onPaste={handleJournalPaste}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAddJournalEntry();
              }}
              placeholder="Write today's section note… (Ctrl+Enter to submit, paste or drag files to attach)"
              className="min-h-[120px] w-full resize-y bg-transparent text-sm leading-relaxed text-gray-800 outline-none placeholder:text-gray-300"
            />
            {pendingFiles.length > 0 && (
              <div className="mt-2.5 border-t border-gray-100 pt-2.5">
                <AnimatePresence initial={false}>
                  {(() => {
                    const images = pendingFiles.filter(f => f.type.startsWith('image/'));
                    const others = pendingFiles.filter(f => !f.type.startsWith('image/'));
                    return (
                      <>
                        {images.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-2">
                            {images.map((f, i) => (
                              <PendingImageThumb
                                key={`${f.name}-${f.size}-${i}`}
                                file={f}
                                onRemove={() => setPendingFiles(prev => prev.filter((_, j) => j !== pendingFiles.indexOf(f)))}
                              />
                            ))}
                          </div>
                        )}
                        {others.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {others.map((f, i) => (
                              <motion.span
                                key={`${f.name}-${f.size}-${i}`}
                                initial={{ opacity: 0, scale: 0.92 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.88 }}
                                transition={{ duration: 0.15 }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#4648d4]/20 bg-[#EEF2FF] px-2 py-1 text-[11px]"
                              >
                                <FileText size={10} className="shrink-0 text-[#4648d4]" />
                                <span className="max-w-[120px] truncate font-medium text-[#4648d4]">{f.name}</span>
                                <span className="shrink-0 font-mono text-[9px] text-[#4648d4]/50">{formatBytes(f.size)}</span>
                                <button
                                  onClick={() => setPendingFiles(prev => prev.filter(p => p !== f))}
                                  className="shrink-0 text-[#4648d4]/40 transition-colors hover:text-red-400"
                                >
                                  <X size={9} />
                                </button>
                              </motion.span>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </AnimatePresence>
              </div>
            )}
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
                  onToggle={async () => { await toggleTask(child.id); invalidate.tasks(selectedGoalId ?? undefined); }}
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
