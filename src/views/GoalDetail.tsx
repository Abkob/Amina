import { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, Folder, Calendar, Target, Sparkles,
  FolderOpen, Upload, FileText, CheckSquare, Square,
  Plus, Trash2, X, Paperclip, ChevronDown, ChevronRight, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppStore } from '../store/useAppStore';
import { db } from '../db/db';
import { updateGoal, updateGoalProgress } from '../db/queries/goals';
import { toggleTask, recalcGoalProgress, createTask, deleteTask, updateTask } from '../db/queries/tasks';
import { createResource, deleteResource, detectResourceType, getAllResourcesGrouped } from '../db/queries/resources';
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

// ─── Subtask row ──────────────────────────────────────────────────────────────
function SubtaskRow({
  task,
  resources,
  goalId,
  onToggle,
  onDelete,
  onTitleSave,
  onAttachResource,
  onDeleteResource,
}: {
  task: DBTask;
  resources: DBResource[];
  goalId: string;
  onToggle: () => void;
  onDelete: () => void;
  onTitleSave: (title: string) => void;
  onAttachResource: (title: string, url: string | null, type: DBResource['type']) => void;
  onDeleteResource: (resId: string) => void;
}) {
  const [showResourceInput, setShowResourceInput] = useState(false);
  const [resourceInput, setResourceInput] = useState('');
  const resRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (showResourceInput) resRef.current?.focus(); }, [showResourceInput]);

  const submitResource = () => {
    const val = resourceInput.trim();
    if (!val) { setShowResourceInput(false); return; }
    const type = detectResourceType(val);
    const url = type !== 'document' ? val : null;
    onAttachResource(val, url, type);
    setResourceInput('');
    setShowResourceInput(false);
  };

  return (
    <div className="group/sub flex flex-col gap-1 py-1.5 px-1 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="flex items-center gap-2">
        <button onClick={onToggle} className="text-gray-300 hover:text-[#4648d4] shrink-0 transition-colors">
          {task.completed ? <CheckSquare size={14} className="text-[#10B981]" /> : <Square size={14} />}
        </button>

        <InlineTitle
          value={task.title}
          onSave={onTitleSave}
          strikethrough={task.completed}
          className="text-xs text-gray-700 font-medium flex-1 min-w-0"
        />

        <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => setShowResourceInput(v => !v)}
            className="text-gray-300 hover:text-[#4648d4] transition-colors p-0.5 rounded"
            title="Attach resource"
          >
            <Paperclip size={11} />
          </button>
          <button
            onClick={onDelete}
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
    </div>
  );
}

// ─── Milestone card ───────────────────────────────────────────────────────────
function MilestoneCard({
  milestone,
  subtasks,
  taskResources,
  goalId,
  category,
  goalTitle,
  onToggleSubtask,
  onDeleteSubtask,
  onUpdateSubtaskTitle,
  onAddSubtask,
  onAttachResource,
  onDeleteResource,
}: {
  milestone: DBTask;
  subtasks: DBTask[];
  taskResources: Record<string, DBResource[]>;
  goalId: string;
  category: string;
  goalTitle: string;
  onToggleSubtask: (task: DBTask) => void;
  onDeleteSubtask: (task: DBTask) => void;
  onUpdateSubtaskTitle: (taskId: string, title: string) => void;
  onAddSubtask: (milestoneId: string, title: string) => Promise<void>;
  onAttachResource: (taskId: string, title: string, url: string | null, type: DBResource['type']) => Promise<void>;
  onDeleteResource: (resourceId: string) => void;
}) {
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
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#f8f9fa] transition-colors"
      >
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
        {expanded
          ? <ChevronDown size={13} className="text-gray-400 shrink-0" />
          : <ChevronRight size={13} className="text-gray-400 shrink-0" />}
      </button>

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
                    <SubtaskRow
                      key={sub.id}
                      task={sub}
                      resources={taskResources[sub.id] ?? []}
                      goalId={goalId}
                      onToggle={() => onToggleSubtask(sub)}
                      onDelete={() => onDeleteSubtask(sub)}
                      onTitleSave={title => onUpdateSubtaskTitle(sub.id, title)}
                      onAttachResource={(title, url, type) => onAttachResource(sub.id, title, url, type)}
                      onDeleteResource={onDeleteResource}
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

  useEffect(() => { if (editingGoalTitle) goalTitleRef.current?.focus(); }, [editingGoalTitle]);

  const goal = useLiveQuery(
    () => selectedGoalId ? db.goals.get(selectedGoalId) : undefined,
    [selectedGoalId],
  );

  const allTasks = useLiveQuery(
    () => selectedGoalId
      ? db.tasks.where('goal_id').equals(selectedGoalId).sortBy('position')
      : Promise.resolve([]),
    [selectedGoalId],
  ) ?? [];

  const groupedResources = useLiveQuery(
    async () => {
      if (!selectedGoalId) return { goalResources: [], taskResources: {} };
      const tasks = await db.tasks.where('goal_id').equals(selectedGoalId).toArray();
      return getAllResourcesGrouped(selectedGoalId, tasks.map(t => t.id));
    },
    [selectedGoalId],
  ) ?? { goalResources: [] as DBResource[], taskResources: {} as Record<string, DBResource[]> };

  if (!goal) return null;

  // Derive tree
  const milestones = allTasks.filter(t => t.kind === 'critical_path' && !t.parent_task_id);
  const aiTasks    = allTasks.filter(t => t.kind === 'ai_generated');
  const subtasksByParent: Record<string, DBTask[]> = {};
  allTasks.filter(t => t.parent_task_id).forEach(t => {
    subtasksByParent[t.parent_task_id!] = [...(subtasksByParent[t.parent_task_id!] ?? []), t];
  });

  const statusDot = goal.status === 'Safe' ? 'bg-[#10B981]' : goal.status === 'Watch' ? 'bg-[#F59E0B]' : 'bg-[#EF4444]';

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

  const handleDeleteResource = (resourceId: string) => {
    showConfirm('Remove this resource?', async () => {
      await deleteResource(resourceId);
      triggerToast('Resource removed.', 'info');
    });
  };

  // ── AI task toggle ──
  const handleToggleAiTask = async (task: DBTask) => {
    await toggleTask(task.id);
    const baseline = selectedGoalId === 'goal-1' ? 75 : 40;
    const newProgress = await recalcGoalProgress(selectedGoalId!, baseline, 'ai_generated');
    await updateGoalProgress(goal.id, newProgress);
  };

  // ── Goal-level resource drop ──
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    await createResource(
      { title: 'Uploaded Document Spec.pdf', url: null, type: 'document', info: 'added just now' },
      goal.id,
    );
    triggerToast('File resource attached to goal!', 'success');
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
            {allTasks.filter(t => t.completed).length} done
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white rounded-xl p-4 border border-gray-100 shadow-ambient shrink-0">
          <DetailRing progress={goal.progress} status={goal.status} />
          <div>
            <div className="font-headline text-base font-bold text-gray-900 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${statusDot}`} />
              {goal.status}
            </div>
            <div className="font-mono text-[10px] text-gray-400 flex items-center gap-1 mt-1">
              <Calendar size={11} />
              Due {goal.deadline ?? '—'}
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-8">
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
                  subtasks={subtasksByParent[milestone.id] ?? []}
                  taskResources={groupedResources.taskResources}
                  goalId={goal.id}
                  category={goal.category}
                  goalTitle={goal.title}
                  onToggleSubtask={handleToggleSubtask}
                  onDeleteSubtask={handleDeleteSubtask}
                  onUpdateSubtaskTitle={handleUpdateSubtaskTitle}
                  onAddSubtask={handleAddSubtask}
                  onAttachResource={handleAttachResource}
                  onDeleteResource={handleDeleteResource}
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
                    {t.estimated_duration && (
                      <p className="text-[9px] font-mono text-gray-400 mt-1">{t.estimated_duration}</p>
                    )}
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
            <button
              onClick={() => openAddResourceModal(goal.id)}
              className="text-[9px] font-mono uppercase bg-[#f8f9fa] hover:bg-gray-100 text-gray-500 py-1 px-2.5 rounded border border-gray-200 transition-colors"
            >
              Attach Link
            </button>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-gray-200 hover:border-[#4648d4]/40 rounded-xl p-6 text-center bg-[#f8f9fa] hover:bg-white transition-all cursor-pointer flex flex-col items-center justify-center gap-2 mb-3"
          >
            <Upload className="text-gray-400" size={22} />
            <p className="text-xs font-semibold text-gray-700">Drag &amp; drop specs here</p>
            <p className="text-[10px] text-gray-400 max-w-[170px] leading-relaxed mx-auto">
              Append Figma sheets, Notion logs, or guidelines into goal database.
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
