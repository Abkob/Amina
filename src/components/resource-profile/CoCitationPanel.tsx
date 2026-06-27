import { ResourceTypeIcon } from '../ResourceMentionPicker';
import type { ResourceGraphData, ResourceGraphNode } from '../../db/queries/resources';

export function CoCitationPanel({
  graphData,
  onResourceClick,
}: {
  graphData: ResourceGraphData;
  onResourceClick: (id: string) => void;
}) {
  // Co-cited resource nodes are non-centre resource nodes
  const centreId = graphData.nodes[0]?.id;
  const coNodes  = graphData.nodes.filter(n => n.nodeType === 'resource' && n.id !== centreId);

  // Count how many co_cited edges each has
  const sharedCount: Record<string, number> = {};
  for (const e of graphData.edges) {
    if (e.rel === 'co_cited') sharedCount[e.target] = (sharedCount[e.target] ?? 0) + 1;
  }

  const sorted = [...coNodes].sort((a, b) => (sharedCount[b.id] ?? 0) - (sharedCount[a.id] ?? 0));

  return (
    <div>
      <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-widest text-gray-400">
        Co-cited Resources
      </p>
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-5 text-center text-xs text-gray-300">
          No co-cited resources yet
        </p>
      ) : (
        <div className="space-y-1">
          {sorted.map(node => (
            <button
              key={node.id}
              data-testid="co-citation-item"
              onClick={() => onResourceClick(node.id)}
              className="group/co w-full flex items-center gap-2.5 rounded-lg border border-gray-100
                bg-white px-3 py-2 text-left hover:border-[#4648d4]/30 hover:bg-[#EEF2FF]/40 transition-colors"
            >
              <ResourceTypeIcon type={(node.meta?.subtype as any) ?? 'other'} size={12} />
              <span className="min-w-0 flex-1 text-xs font-semibold text-gray-800 truncate
                group-hover/co:text-[#4648d4] transition-colors">
                {node.label}
              </span>
              <span className="shrink-0 font-mono text-[9px] text-gray-400">
                appeared together {sharedCount[node.id] ?? 1} time{(sharedCount[node.id] ?? 1) !== 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
