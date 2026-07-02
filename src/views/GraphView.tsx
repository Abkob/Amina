import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core';
import '@react-sigma/core/lib/style.css';
import { useAppStore } from '../store/useAppStore';
import { useGoals } from '../api/hooks';
import { apiFetch } from '../utils/apiFetch';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphNode { id: string; type: string; label: string; metadata: Record<string, unknown> }
interface GraphEdge { id: string; source: string; target: string; relationship: string; weight: number }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean; total_nodes: number }

const NODE_COLORS: Record<string, string> = {
  goal:      '#8b5cf6',
  milestone: '#6366f1',
  task:      '#3b82f6',
  resource:  '#10b981',
  meeting:   '#f59e0b',
  journal:   '#d97706',
};
const NODE_SIZES: Record<string, number> = {
  goal: 10, milestone: 7, task: 5, resource: 6, meeting: 6, journal: 4,
};

const ENTITY_TYPES = ['goal', 'milestone', 'task', 'resource', 'meeting', 'journal'] as const;

// ── Graph loader ──────────────────────────────────────────────────────────────

function GraphLoader({ data }: { data: GraphData | null }) {
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const sigma = useSigma();
  const { navigateToGoal, setFocusedTaskId, setCurrentTab } = useAppStore();
  const [selected, setSelected] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (!data) return;
    const graph = new Graph();
    for (const n of data.nodes) {
      graph.addNode(n.id, {
        label: n.label.slice(0, 25),
        size: NODE_SIZES[n.type] ?? 5,
        color: NODE_COLORS[n.type] ?? '#6b7280',
        x: Math.random(),
        y: Math.random(),
        type: n.type,
        meta: n.metadata,
      });
    }
    for (const e of data.edges) {
      if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
      graph.addEdge(e.source, e.target, { label: e.relationship, color: '#374151', size: 1 });
    }
    if (graph.order > 0) {
      forceAtlas2.assign(graph, {
        iterations: 100,
        settings: {
          gravity: 1,
          scalingRatio: 2,
          adjustSizes: true,
          barnesHutOptimize: graph.order > 100,
        },
      });
    }
    loadGraph(graph);
  }, [data, loadGraph]);

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => {
        const attrs = sigma.getGraph().getNodeAttributes(node) as Record<string, unknown>;
        setSelected({ id: node, type: attrs.type as string, label: attrs.label as string, metadata: attrs.meta as Record<string, unknown> });
      },
      clickStage: () => setSelected(null),
    });
  }, [registerEvents, sigma]);

  const handleOpen = () => {
    if (!selected) return;
    // id is the typed "type:uuid" key — use raw_id for navigation
    const rawId = (selected.metadata.raw_id as string) ?? selected.id;
    if (selected.type === 'goal') {
      navigateToGoal(rawId);
    } else if (selected.type === 'task') {
      const gid = selected.metadata.goal_id as string | undefined;
      if (gid) { navigateToGoal(gid); setFocusedTaskId(rawId); }
    } else if (selected.type === 'journal') {
      setCurrentTab('Journal');
    }
  };

  if (!selected) return null;

  return (
    <div className="absolute right-4 top-4 w-56 bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl z-10 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[selected.type] ?? '#6b7280' }} />
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400">{selected.type}</span>
      </div>
      <p className="text-sm font-semibold text-white leading-snug">{selected.label}</p>
      {selected.metadata.status && (
        <p className="text-[10px] font-mono text-gray-500">{String(selected.metadata.status)}</p>
      )}
      {selected.metadata.due_date && (
        <p className="text-[10px] font-mono text-gray-500">{String(selected.metadata.due_date)}</p>
      )}
      {['goal', 'task', 'journal'].includes(selected.type) && (
        <button
          onClick={handleOpen}
          className="w-full text-[10px] font-mono uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-1.5 transition-colors"
        >
          Open →
        </button>
      )}
    </div>
  );
}

// ── Filter controls ───────────────────────────────────────────────────────────

function FilterBar({
  visibleTypes, onToggle, selectedGoalId, onGoalChange, showEdgeLabels, onToggleEdgeLabels,
}: {
  visibleTypes: Set<string>;
  onToggle: (t: string) => void;
  selectedGoalId: string;
  onGoalChange: (id: string) => void;
  showEdgeLabels: boolean;
  onToggleEdgeLabels: () => void;
}) {
  const { data: goals } = useGoals();

  return (
    <div className="absolute left-4 top-4 flex flex-col gap-2 z-10">
      <div className="flex flex-wrap gap-1.5">
        {ENTITY_TYPES.map(t => (
          <button
            key={t}
            onClick={() => onToggle(t)}
            className={`flex items-center gap-1 px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded-full border transition-colors ${
              visibleTypes.has(t)
                ? 'text-white border-transparent'
                : 'text-gray-600 border-gray-700 bg-transparent'
            }`}
            style={visibleTypes.has(t) ? { background: NODE_COLORS[t], borderColor: NODE_COLORS[t] } : {}}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={selectedGoalId}
          onChange={e => onGoalChange(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-[10px] font-mono text-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All goals</option>
          {(goals ?? []).map(g => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>
        <button
          onClick={onToggleEdgeLabels}
          className={`px-2 py-1 text-[9px] font-mono uppercase tracking-wider rounded-full border transition-colors ${
            showEdgeLabels ? 'bg-gray-600 text-white border-gray-500' : 'text-gray-600 border-gray-700 bg-transparent'
          }`}
        >
          Edge labels
        </button>
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function GraphView() {
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set(ENTITY_TYPES));
  const [selectedGoalId, setSelectedGoalId] = useState('');
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);

  const url = selectedGoalId ? `/api/graph?goal_id=${encodeURIComponent(selectedGoalId)}` : '/api/graph';
  const { data, isLoading: loading, error: queryError, refetch } = useQuery<GraphData>({
    queryKey: ['graph', selectedGoalId],
    queryFn: () => apiFetch<GraphData>(url),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const error = queryError instanceof Error ? queryError.message : queryError ? 'Unknown error' : null;

  const toggleType = (t: string) =>
    setVisibleTypes(s => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const handleGoalChange = (id: string) => {
    setSelectedGoalId(id);
  };

  const filteredData: GraphData | null = data ? {
    ...data,
    nodes: data.nodes.filter(n => visibleTypes.has(n.type)),
    edges: data.edges,
  } : null;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950">
        <div className="text-sm text-gray-500 font-mono animate-pulse">Loading graph…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-gray-950">
        <p className="text-sm text-red-400 font-mono">Graph failed to load: {error}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 text-xs font-mono bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-gray-950">
      <FilterBar
        visibleTypes={visibleTypes}
        onToggle={toggleType}
        selectedGoalId={selectedGoalId}
        onGoalChange={handleGoalChange}
        showEdgeLabels={showEdgeLabels}
        onToggleEdgeLabels={() => setShowEdgeLabels(v => !v)}
      />

      {filteredData && (
        <SigmaContainer
          style={{ width: '100%', height: '100%' }}
          settings={{
            nodeProgramClasses: {},
            defaultEdgeType: 'line',
            labelColor: { color: '#9ca3af' },
            labelSize: 11,
            labelFont: 'monospace',
            renderEdgeLabels: showEdgeLabels,
          }}
        >
          <GraphLoader data={filteredData} />
        </SigmaContainer>
      )}

      {!filteredData?.nodes.length && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-gray-600 font-mono">No entities to display.</p>
        </div>
      )}

      {data?.truncated && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-600 bg-gray-900 px-3 py-1.5 rounded-full border border-gray-800">
          Showing 300 of {data.total_nodes} nodes — use goal filter to narrow
        </div>
      )}
    </div>
  );
}
