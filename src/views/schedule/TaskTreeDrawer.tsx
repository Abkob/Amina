import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronRight, FolderTree, PanelLeftClose, Plus, X } from 'lucide-react';
import { TaskTree } from '../../components/TaskTree';
import { buildTaskForest } from '../../utils/taskTree';
import { parseTaskTimeInput } from '../../utils/taskTime';
import type { DBGoal, DBTask } from '../../db/schema';

export interface OneOffTaskDraft {
  title: string;
  estimatedMinutes: number | null;
  dueDate: string | null;
}

export function OneOffTaskComposer({ onCreate, onCancel }: {
  onCreate: (draft: OneOffTaskDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Give the task a title.');
      return;
    }
    const estimatedMinutes = parseTaskTimeInput(estimate);
    if (estimate.trim() && !estimatedMinutes) {
      setError('Use a time like 30m, 1h, or 1h 30m.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onCreate({
        title: cleanTitle,
        estimatedMinutes,
        dueDate: dueDate || null,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the task.');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-b border-indigo-100 bg-indigo-50/50 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold text-[#33359c]">New one-off task</p>
          <p className="text-[9px] leading-snug text-indigo-400">Standalone — no goal and no parent task.</p>
        </div>
        <button type="button" onClick={onCancel} className="rounded p-0.5 text-indigo-300 hover:bg-white hover:text-indigo-600" aria-label="Cancel one-off task">
          <X size={13} />
        </button>
      </div>
      <label className="block">
        <span className="sr-only">Task title</span>
        <input
          autoFocus
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="What needs doing?"
          className="h-8 w-full rounded-lg border border-indigo-100 bg-white px-2.5 text-xs text-gray-800 outline-none focus:border-[#4648d4]"
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[8px] font-bold uppercase tracking-wide text-indigo-400">Estimate</span>
          <input
            value={estimate}
            onChange={event => setEstimate(event.target.value.replace(/[^\d.hm\s]/gi, ''))}
            placeholder="e.g. 30m"
            className="h-8 w-full rounded-lg border border-indigo-100 bg-white px-2 text-[10px] text-gray-700 outline-none focus:border-[#4648d4]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[8px] font-bold uppercase tracking-wide text-indigo-400">Due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={event => setDueDate(event.target.value)}
            className="h-8 w-full rounded-lg border border-indigo-100 bg-white px-2 text-[10px] text-gray-700 outline-none focus:border-[#4648d4]"
          />
        </label>
      </div>
      {error && <p role="alert" className="mt-2 text-[10px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-[#4648d4] font-mono text-[9px] font-bold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-50"
      >
        <Plus size={11} /> {saving ? 'Creating…' : 'Create one-off'}
      </button>
    </form>
  );
}

/**
 * Left drawer of the Schedule, goal-first: pick a goal, get that goal's task
 * tree, drag tasks onto the calendar (a card asks how long). Dropping
 * anything back here unschedules it.
 */
export function TaskTreeDrawer({ tasks, goals, draggableIds, scheduledDates, onCollapse, onCreateOneOff }: {
  tasks: DBTask[];
  goals: DBGoal[];
  draggableIds: Set<string>;
  scheduledDates: Map<string, string>;
  onCollapse: () => void;
  onCreateOneOff: (draft: OneOffTaskDraft) => Promise<void>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog' });
  const [goalId, setGoalId] = useState<string | null | undefined>(undefined); // undefined = goal list
  const [creatingOneOff, setCreatingOneOff] = useState(false);

  const groups = useMemo(() => buildTaskForest(tasks, goals), [tasks, goals]);
  const active = goalId === undefined ? undefined : groups.find(g => g.goalId === goalId);
  const activeGoal = goalId ? goals.find(g => g.id === goalId) : null;

  const scopedTasks = useMemo(() => {
    if (goalId === undefined) return [];
    return tasks.filter(t => (t.goal_id ?? null) === goalId);
  }, [tasks, goalId]);

  return (
    <div
      ref={setNodeRef}
      className={`sticky top-20 flex max-h-[calc(100vh-140px)] flex-col overflow-hidden rounded-xl border bg-white transition-colors
        ${isOver ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-300/50' : 'border-gray-200'}`}
    >
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-gray-700">
          {active !== undefined ? (
            <>
              <button
                onClick={() => setGoalId(undefined)}
                className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                title="All goals"
              >
                <ArrowLeft size={13} />
              </button>
              <span className="truncate">{active?.goalTitle ?? activeGoal?.title ?? 'Goal'}</span>
            </>
          ) : (
            <>
              <FolderTree size={12} className="shrink-0 text-gray-400" /> Tasks by goal
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCreatingOneOff(value => !value)}
            className={`rounded p-1 transition-colors ${creatingOneOff ? 'bg-indigo-50 text-[#4648d4]' : 'text-gray-300 hover:bg-indigo-50 hover:text-[#4648d4]'}`}
            title="Create a one-off task with no goal or parent"
            aria-label="Create one-off task"
            aria-pressed={creatingOneOff}
          >
            <Plus size={13} />
          </button>
          <button onClick={onCollapse} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600" title="Hide the task drawer">
            <PanelLeftClose size={13} />
          </button>
        </div>
      </div>

      {creatingOneOff && (
        <OneOffTaskComposer
          onCancel={() => setCreatingOneOff(false)}
          onCreate={async draft => {
            await onCreateOneOff(draft);
            setGoalId(null);
            setCreatingOneOff(false);
          }}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <AnimatePresence mode="wait" initial={false}>
          {active === undefined ? (
            <motion.div
              key="goals"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="mb-2 text-[10px] leading-snug text-gray-400">
                Pick a goal to open its task tree. Drop a task back here to unschedule it.
              </p>
              <div className="space-y-1">
                {groups.map(g => (
                  <button
                    key={g.goalId ?? '__none__'}
                    onClick={() => setGoalId(g.goalId)}
                    className="flex w-full items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-2 text-left transition-colors hover:border-[#4648d4]/40 hover:bg-indigo-50/50"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-800">{g.goalTitle}</span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-1.5 font-mono text-[9px] text-gray-500">{g.taskCount}</span>
                    <ChevronRight size={12} className="shrink-0 text-gray-300" />
                  </button>
                ))}
                {groups.length === 0 && <p className="px-1 py-2 text-[11px] text-gray-400">No open tasks anywhere.</p>}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`goal-${goalId}`}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="mb-2 text-[10px] leading-snug text-gray-400">
                Drag a task onto the calendar — you'll pick how long to spend on it.
              </p>
              <TaskTree
                tasks={scopedTasks}
                goals={goals}
                mode="drag"
                draggableIds={draggableIds}
                scheduledDates={scheduledDates}
                searchPlaceholder="Find a task…"
                hideGoalHeaders
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
