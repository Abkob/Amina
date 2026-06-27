import { useEffect, useState } from 'react';
import Graph from 'graphology';
import {
  SigmaContainer,
  useLoadGraph,
  useSigma,
  useRegisterEvents,
  useSetSettings,
} from '@react-sigma/core';
import '@react-sigma/core/lib/style.css';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { ChevronDown, ChevronRight, Share2 } from 'lucide-react';
import type { DBTask } from '../db/schema';

// ─── Graph attribute types ────────────────────────────────────────────────────
type NodeAttrs = {
  x: number; y: number; size: number;
  label: string; color: string;
  nodeType: 'goal' | 'milestone' | 'task';
  taskId?: string;
};
type EdgeAttrs = { size: number; color: string };

// ─── Graph loader — builds & lays out the graph then hands it to Sigma ───────
function GraphLoader({
  goalId, goalTitle, tasks,
}: {
  goalId: string;
  goalTitle: string;
  tasks: DBTask[];
}) {
  const loadGraph = useLoadGraph<NodeAttrs, EdgeAttrs>();

  useEffect(() => {
    const graph = new Graph<NodeAttrs, EdgeAttrs>({ multi: false });

    // Goal — large indigo centre node
    graph.addNode('__goal__', {
      x: 0, y: 0, size: 16,
      label: goalTitle.length > 24 ? goalTitle.slice(0, 23) + '…' : goalTitle,
      color: '#4648d4',
      nodeType: 'goal',
    });

    // Milestones — seeded in a ring so ForceAtlas2 spreads them nicely
    const milestones = tasks.filter(t => t.kind === 'critical_path');
    const mLen = Math.max(milestones.length, 1);
    milestones.forEach((m, i) => {
      const angle = (i / mLen) * 2 * Math.PI;
      const done  = m.critical_path_status === 'Completed';
      const active = m.critical_path_status === 'In Progress';
      graph.addNode(m.id, {
        x: Math.cos(angle) * 3, y: Math.sin(angle) * 3,
        size: 9,
        label: m.title.length > 20 ? m.title.slice(0, 19) + '…' : m.title,
        color: done ? '#10B981' : active ? '#6366f1' : '#4b4f70',
        nodeType: 'milestone',
        taskId: m.id,
      });
      graph.addEdge('__goal__', m.id, { size: 1.5, color: '#2e2e6e' });
    });

    // Regular tasks — scattered, then force layout arranges them
    const regularTasks = tasks.filter(t => t.kind !== 'critical_path');
    regularTasks.forEach(task => {
      const done  = task.completed || task.status === 'done';
      const inProg = !done && task.status === 'in_progress';
      const isLeaf = !tasks.some(t => t.parent_task_id === task.id);
      graph.addNode(task.id, {
        x: Math.random() * 8 - 4, y: Math.random() * 8 - 4,
        size: isLeaf ? 4.5 : 6,
        label: task.title.length > 18 ? task.title.slice(0, 17) + '…' : task.title,
        color: done ? '#10B981' : inProg ? '#f59e0b' : '#374151',
        nodeType: 'task',
        taskId: task.id,
      });

      // Connect to parent if it exists in the graph, else directly to goal
      const parentId = task.parent_task_id && graph.hasNode(task.parent_task_id)
        ? task.parent_task_id
        : '__goal__';
      graph.addEdge(parentId, task.id, { size: isLeaf ? 0.6 : 1, color: '#1e2334' });
    });

    // ForceAtlas2 layout — same algorithm Obsidian uses (via Gephi lineage)
    const inferredSettings = forceAtlas2.inferSettings(graph);
    forceAtlas2.assign(graph, {
      iterations: 200,
      settings: {
        ...inferredSettings,
        gravity: 0.8,
        scalingRatio: 2,
        strongGravityMode: true,
      },
    });

    loadGraph(graph);
  // Re-layout whenever any task's identity, completion, status, or milestone state changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId, tasks.map(t => `${t.id}:${t.completed}:${t.status}:${t.critical_path_status}`).join('|')]);

  return null;
}

// ─── Interaction layer — hover dim/focus, click-to-scroll ────────────────────
function GraphInteractions({ onNodeClick }: { onNodeClick: (taskId: string) => void }) {
  const sigma = useSigma<NodeAttrs, EdgeAttrs>();
  const setSettings = useSetSettings<NodeAttrs, EdgeAttrs>();
  const registerEvents = useRegisterEvents<NodeAttrs, EdgeAttrs>();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Register mouse/click events once on mount
  useEffect(() => {
    registerEvents({
      enterNode: ({ node }) => setHoveredNode(node),
      leaveNode:  ()         => setHoveredNode(null),
      clickNode:  ({ node }) => {
        const taskId = sigma.getGraph().getNodeAttribute(node, 'taskId');
        if (taskId) onNodeClick(taskId);
      },
    });
  }, []);

  // Obsidian-style dim: connected nodes stay vivid, everything else fades to near-black
  useEffect(() => {
    if (!hoveredNode) {
      setSettings({ nodeReducer: null, edgeReducer: null });
      return;
    }

    const graph = sigma.getGraph();
    const connected = new Set<string>([hoveredNode]);
    try { graph.neighbors(hoveredNode).forEach(n => connected.add(n)); } catch { /* node not yet loaded */ }

    setSettings({
      nodeReducer: (node, data) => ({
        x:     data.x,
        y:     data.y,
        size:  node === hoveredNode ? data.size * 1.5 : data.size,
        label: connected.has(node) ? data.label : '',
        color: connected.has(node) ? data.color : '#131320',
      }),
      edgeReducer: (edge, data) => {
        const [s, t] = graph.extremities(edge);
        const lit = s === hoveredNode || t === hoveredNode;
        return {
          color: lit ? '#6366f1' : '#07070f',
          size:  lit ? data.size * 2.5 : data.size * 0.3,
        };
      },
    });
  }, [hoveredNode]);

  return null;
}

// ─── Public component ─────────────────────────────────────────────────────────
export function TaskGraphView({
  goalId,
  goalTitle,
  tasks,
  onNodeClick,
}: {
  goalId: string;
  goalTitle: string;
  tasks: DBTask[];
  onNodeClick: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const legend = [
    { color: '#4648d4', label: 'goal' },
    { color: '#6366f1', label: 'milestone' },
    { color: '#10B981', label: 'done' },
    { color: '#f59e0b', label: 'active' },
    { color: '#374151', label: 'pending' },
  ];

  return (
    <section>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 mb-3 group"
      >
        <Share2 size={14} className="text-[#4648d4] shrink-0" />
        <span className="font-headline text-sm font-bold text-gray-900 flex-1 text-left">Task Graph</span>
        <span className="font-mono text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
          {tasks.length + 1} nodes · ForceAtlas2
        </span>
        <span className="text-gray-400 group-hover:text-gray-600 transition-colors ml-1 shrink-0">
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </button>

      {open && (
        <div
          className="relative rounded-xl overflow-hidden border border-[#1a1a2e] shadow-2xl"
          style={{ height: 300 }}
        >
          <SigmaContainer<NodeAttrs, EdgeAttrs>
            style={{ height: '100%', width: '100%', background: '#080812' }}
            settings={{
              renderLabels: true,
              renderEdgeLabels: false,
              labelRenderedSizeThreshold: 7,
              defaultNodeColor: '#374151',
              defaultEdgeColor: '#1e2334',
              labelFont: 'Inter, sans-serif',
              labelSize: 10,
              labelWeight: '500',
              labelColor: { color: '#9ca3af' },
              hideEdgesOnMove: true,
              hideLabelsOnMove: true,
            }}
          >
            <GraphLoader goalId={goalId} goalTitle={goalTitle} tasks={tasks} />
            <GraphInteractions onNodeClick={onNodeClick} />
          </SigmaContainer>

          {/* Colour legend */}
          <div className="absolute bottom-2.5 left-3 flex items-center gap-3 pointer-events-none">
            {legend.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[8px] font-mono text-gray-600">{label}</span>
              </div>
            ))}
          </div>

          {/* Interaction hint */}
          <div className="absolute bottom-2.5 right-3 pointer-events-none">
            <span className="text-[8px] font-mono text-gray-700">scroll · drag · hover · click to open</span>
          </div>
        </div>
      )}
    </section>
  );
}
