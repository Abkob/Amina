import { useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronRight, FolderTree, PanelLeftClose } from 'lucide-react';
import { TaskTree } from '../../components/TaskTree';
import { buildTaskForest } from '../../utils/taskTree';
import type { DBGoal, DBTask } from '../../db/schema';

/**
 * Left drawer of the Schedule, goal-first: pick a goal, get that goal's task
 * tree, drag tasks onto the calendar (a card asks how long). Dropping
 * anything back here unschedules it.
 */
export function TaskTreeDrawer({ tasks, goals, draggableIds, scheduledDates, onCollapse }: {
  tasks: DBTask[];
  goals: DBGoal[];
  draggableIds: Set<string>;
  scheduledDates: Map<string, string>;
  onCollapse: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'backlog' });
  const [goalId, setGoalId] = useState<string | null | undefined>(undefined); // undefined = goal list

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
        <button onClick={onCollapse} className="rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-gray-600" title="Hide the task drawer">
          <PanelLeftClose size={13} />
        </button>
      </div>

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
