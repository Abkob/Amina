import { db } from '../db';
import type { GraphData, GraphNode, GraphEdge, NodeType } from '../schema';

async function labelFor(id: string, type: NodeType): Promise<string> {
  switch (type) {
    case 'goal':        return (await db.goals.get(id))?.title        ?? id;
    case 'task':        return (await db.tasks.get(id))?.title        ?? id;
    case 'note':        return (await db.notes.get(id))?.title        ?? id;
    case 'resource':    return (await db.resources.get(id))?.title    ?? id;
    case 'event':       return (await db.events.get(id))?.title       ?? id;
    case 'daily_score': return (await db.daily_scores.get(id))?.date  ?? id;
  }
}

async function metaFor(id: string, type: NodeType): Promise<Record<string, unknown>> {
  switch (type) {
    case 'goal': {
      const g = await db.goals.get(id);
      return g ? { status: g.status, progress: g.progress, category: g.category } : {};
    }
    case 'task': {
      const t = await db.tasks.get(id);
      return t ? { completed: t.completed, kind: t.kind, status: t.status } : {};
    }
    case 'note': {
      const n = await db.notes.get(id);
      return n ? { type: n.type } : {};
    }
    case 'resource': {
      const r = await db.resources.get(id);
      return r ? { type: r.type } : {};
    }
    case 'event': {
      const e = await db.events.get(id);
      return e ? { type: e.type, day_index: e.day_index } : {};
    }
    case 'daily_score': {
      const d = await db.daily_scores.get(id);
      return d ? { score: d.score, tasks_completed: d.tasks_completed } : {};
    }
  }
}

// Returns ALL nodes + ALL edges — use for the full graph canvas
export async function getFullGraphData(): Promise<GraphData> {
  const [goals, tasks, notes, resources, events, scores, edges] = await Promise.all([
    db.goals.toArray(),
    db.tasks.toArray(),
    db.notes.toArray(),
    db.resources.toArray(),
    db.events.toArray(),
    db.daily_scores.toArray(),
    db.edges.toArray(),
  ]);

  const nodes: GraphNode[] = [
    ...goals.map(g => ({
      id: g.id, type: 'goal' as NodeType, label: g.title,
      meta: { status: g.status, progress: g.progress, category: g.category },
    })),
    ...tasks.map(t => ({
      id: t.id, type: 'task' as NodeType, label: t.title,
      meta: { completed: t.completed, kind: t.kind },
    })),
    ...notes.map(n => ({
      id: n.id, type: 'note' as NodeType, label: n.title,
      meta: { type: n.type },
    })),
    ...resources.map(r => ({
      id: r.id, type: 'resource' as NodeType, label: r.title,
      meta: { type: r.type },
    })),
    ...events.map(e => ({
      id: e.id, type: 'event' as NodeType, label: e.title,
      meta: { type: e.type },
    })),
    ...scores.map(s => ({
      id: s.id, type: 'daily_score' as NodeType, label: s.date,
      meta: { score: s.score },
    })),
  ];

  const graphEdges: GraphEdge[] = edges.map(e => ({
    id: e.id,
    source: e.source_id,
    target: e.target_id,
    relationship: e.relationship,
  }));

  return { nodes, edges: graphEdges };
}

// Returns the ego-network of a single node (depth=1 by default)
export async function getNodeNeighborhood(
  nodeId: string,
  nodeType: NodeType,
  depth = 1
): Promise<GraphData> {
  const visited = new Set<string>([nodeId]);
  const queue: { id: string; type: NodeType; d: number }[] = [{ id: nodeId, type: nodeType, d: 0 }];
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const label = await labelFor(cur.id, cur.type);
    const meta  = await metaFor(cur.id, cur.type);
    nodeMap.set(cur.id, { id: cur.id, type: cur.type, label, meta });

    if (cur.d >= depth) continue;

    const [outgoing, incoming] = await Promise.all([
      db.edges.where('source_id').equals(cur.id).toArray(),
      db.edges.where('target_id').equals(cur.id).toArray(),
    ]);

    for (const e of [...outgoing, ...incoming]) {
      const edgeId = e.id;
      if (!edgeMap.has(edgeId)) {
        edgeMap.set(edgeId, {
          id: edgeId, source: e.source_id, target: e.target_id,
          relationship: e.relationship,
        });
      }
      const neighborId   = e.source_id === cur.id ? e.target_id   : e.source_id;
      const neighborType = e.source_id === cur.id ? e.target_type : e.source_type;
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ id: neighborId, type: neighborType, d: cur.d + 1 });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}
