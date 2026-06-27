import type { ResourceGraphData } from '../../db/queries/resources';

export function GoalCoveragePanel({
  graphData,
  onGoalClick,
}: {
  graphData: ResourceGraphData;
  onGoalClick: (id: string) => void;
}) {
  const goalNodes = graphData.nodes.filter(n => n.nodeType === 'goal');

  return (
    <div>
      <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-widest text-gray-400">
        Goal Coverage
      </p>
      {goalNodes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-xs text-gray-300">
          No goals connected yet
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {goalNodes.map(node => (
            <button
              key={node.id}
              onClick={() => onGoalClick(node.id)}
              className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-mono text-[10px]
                font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
            >
              {node.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
