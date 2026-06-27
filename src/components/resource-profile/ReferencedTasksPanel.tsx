import { Check, Circle } from 'lucide-react';
import type { ResourceGraphData } from '../../db/queries/resources';

function fmtMins(m: number | undefined): string {
  if (!m || m <= 0) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

export function ReferencedTasksPanel({
  graphData,
  onTaskClick,
}: {
  graphData: ResourceGraphData;
  onTaskClick: (id: string) => void;
}) {
  const taskNodes = graphData.nodes.filter(n => n.nodeType === 'task');

  // Find goal label for each task
  const goalLabel = (goalId: string | undefined): string => {
    if (!goalId) return '';
    const g = graphData.nodes.find(n => n.id === goalId && n.nodeType === 'goal');
    return g?.label ?? '';
  };

  const sorted = [...taskNodes].sort(
    (a, b) => ((b.meta?.actual_minutes as number) ?? 0) - ((a.meta?.actual_minutes as number) ?? 0)
  );

  return (
    <div>
      <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-widest text-gray-400">
        Referenced Tasks
      </p>
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-xs text-gray-300">
          No tasks referenced this resource yet
        </p>
      ) : (
        <div className="space-y-1">
          {sorted.map(node => {
            const done = !!node.meta?.completed;
            const goal = goalLabel(node.meta?.goal_id);
            const mins = node.meta?.actual_minutes as number | undefined;
            return (
              <button
                key={node.id}
                data-testid="task-row"
                onClick={() => onTaskClick(node.id)}
                className="group/tr w-full flex items-center gap-2.5 rounded-lg border border-gray-100
                  bg-white px-3 py-2 text-left hover:border-[#4648d4]/30 hover:bg-[#EEF2FF]/40 transition-colors"
              >
                {done
                  ? <Check size={12} className="shrink-0 text-emerald-500" data-testid="task-completed-icon" />
                  : <Circle size={12} className="shrink-0 text-gray-300" />
                }
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate group-hover/tr:text-[#4648d4] transition-colors">
                    {node.label}
                  </p>
                  {goal && <p className="text-[10px] text-gray-400 truncate">{goal}</p>}
                </div>
                <span className="shrink-0 font-mono text-[9px] text-gray-400">{fmtMins(mins)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
