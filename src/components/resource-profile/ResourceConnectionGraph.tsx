import { useEffect, useState } from 'react';
import Graph from 'graphology';
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSetSettings, useSigma } from '@react-sigma/core';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { ResourceGraphData, ResourceGraphNode } from '../../db/queries/resources';

type NA = { x: number; y: number; size: number; label: string; color: string; nodeType: string; entityId: string };
type EA = { size: number; color: string };

const NODE_COLOR: Record<string, string> = {
  resource: '#4648d4',
  task_done: '#10b981',
  task_prog: '#f59e0b',
  task_todo: '#6b7280',
  goal:      '#1e40af',
  co_resource: '#7c3aed',
};

// ── Graph loader ──────────────────────────────────────────────────────────────
function GraphLoader({ data, centreId }: { data: ResourceGraphData; centreId: string }) {
  const loadGraph = useLoadGraph<NA, EA>();

  useEffect(() => {
    const g = new Graph<NA, EA>({ multi: false });

    data.nodes.forEach((n: ResourceGraphNode, i) => {
      const isCentre = n.id === centreId;
      let color = NODE_COLOR.resource;
      if (n.nodeType === 'task') {
        color = n.meta?.completed ? NODE_COLOR.task_done
              : n.meta?.status === 'in_progress' ? NODE_COLOR.task_prog
              : NODE_COLOR.task_todo;
      } else if (n.nodeType === 'goal') {
        color = NODE_COLOR.goal;
      } else if (!isCentre) {
        color = NODE_COLOR.co_resource;
      }

      const angle = (i / Math.max(data.nodes.length, 1)) * 2 * Math.PI;
      g.addNode(n.id, {
        x: isCentre ? 0 : Math.cos(angle) * 4,
        y: isCentre ? 0 : Math.sin(angle) * 4,
        size: isCentre ? 14 : n.nodeType === 'goal' ? 9 : 6,
        label: n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label,
        color,
        nodeType: n.nodeType,
        entityId: n.id,
      });
    });

    data.edges.forEach(e => {
      if (!g.hasNode(e.source) || !g.hasNode(e.target)) return;
      const isDashed = e.rel === 'co_cited';
      g.addEdgeWithKey(`${e.source}-${e.target}`, e.source, e.target, {
        size: isDashed ? 0.8 : 1.4,
        color: isDashed ? '#7c3aed44' : '#1e233488',
      });
    });

    forceAtlas2.assign(g, {
      iterations: 180,
      settings: {
        ...forceAtlas2.inferSettings(g),
        gravity: 1,
        scalingRatio: 2.5,
        strongGravityMode: true,
      },
    });

    loadGraph(g);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.nodes.map(n => n.id).join('|')]);

  return null;
}

// ── Interactions ──────────────────────────────────────────────────────────────
function GraphInteractions({
  onTaskClick,
  onResourceClick,
}: {
  onTaskClick: (id: string) => void;
  onResourceClick: (id: string) => void;
}) {
  const sigma = useSigma<NA, EA>();
  const registerEvents = useRegisterEvents<NA, EA>();
  const setSettings    = useSetSettings<NA, EA>();
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    registerEvents({
      enterNode: ({ node }) => setHovered(node),
      leaveNode: ()         => setHovered(null),
      clickNode: ({ node }) => {
        const attrs = sigma.getGraph().getNodeAttributes(node);
        if (attrs.nodeType === 'task')     onTaskClick(attrs.entityId);
        if (attrs.nodeType === 'resource' && attrs.entityId !== sigma.getGraph().nodes()[0])
          onResourceClick(attrs.entityId);
      },
    });
  }, []);

  useEffect(() => {
    setSettings({
      nodeReducer: (node, data) => {
        if (!hovered) return { ...data, highlighted: false };
        const g = sigma.getGraph();
        const isNeighbor = g.hasEdge(hovered, node) || g.hasEdge(node, hovered);
        return { ...data, highlighted: node === hovered || isNeighbor, color: (node === hovered || isNeighbor) ? data.color : data.color + '44' };
      },
      edgeReducer: (edge, data) => {
        if (!hovered) return data;
        const g = sigma.getGraph();
        const [s, t] = g.extremities(edge);
        const visible = s === hovered || t === hovered;
        return { ...data, color: visible ? data.color : data.color.slice(0, 7) + '18' };
      },
    });
  }, [hovered]);

  return null;
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-gray-100 bg-gray-50 rounded-b-xl">
      {[
        { color: '#4648d4', label: 'Resource' },
        { color: '#10b981', label: 'Task (done)' },
        { color: '#f59e0b', label: 'Task (active)' },
        { color: '#1e40af', label: 'Goal' },
        { color: '#7c3aed', label: 'Co-cited' },
      ].map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1 font-mono text-[8px] text-gray-500">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1 font-mono text-[8px] text-gray-400 ml-2">
        <span className="inline-block h-px w-4 bg-[#7c3aed44] border-t border-dashed border-[#7c3aed]" />
        Co-cite edge
      </span>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function ResourceConnectionGraph({
  data,
  onTaskClick,
  onResourceClick,
}: {
  data: ResourceGraphData;
  onTaskClick: (id: string) => void;
  onResourceClick: (id: string) => void;
}) {
  const hasConnections = data.nodes.length > 1;

  if (!hasConnections) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-12 text-center">
        <p className="text-sm text-gray-400 font-semibold">No connections yet</p>
        <p className="mt-1 text-xs text-gray-300">
          Reference this resource somewhere to start building its connection map.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
      <SigmaContainer<NA, EA>
        style={{ width: '100%', height: 280 }}
        settings={{
          renderLabels: true,
          labelSize: 10,
          labelWeight: '600',
          labelColor: { color: '#374151' },
          defaultEdgeColor: '#1e233444',
          defaultNodeColor: '#4648d4',
          minCameraRatio: 0.4,
          maxCameraRatio: 4,
        }}
      >
        <GraphLoader data={data} centreId={data.nodes[0]?.id ?? ''} />
        <GraphInteractions onTaskClick={onTaskClick} onResourceClick={onResourceClick} />
      </SigmaContainer>
      <Legend />
    </div>
  );
}
