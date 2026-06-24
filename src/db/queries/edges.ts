import type { DBEdge, NodeType, EdgeRelationship } from '../schema';

const API = '/api';

export async function addEdge(
  data: Omit<DBEdge, 'id' | 'created_at'>
): Promise<string> {
  const r = await fetch(`${API}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const { id } = await r.json();
  return id;
}

export async function removeEdge(sourceId: string, targetId: string): Promise<void> {
  const edges: DBEdge[] = await fetch(`${API}/edges?source_id=${sourceId}`).then(r => r.json());
  const match = edges.find(e => e.target_id === targetId);
  if (match) await fetch(`${API}/edges/${match.id}`, { method: 'DELETE' });
}

export async function removeAllEdgesForNode(nodeId: string): Promise<void> {
  const [out, inc]: [DBEdge[], DBEdge[]] = await Promise.all([
    fetch(`${API}/edges?source_id=${nodeId}`).then(r => r.json()),
    fetch(`${API}/edges?target_id=${nodeId}`).then(r => r.json()),
  ]);
  await Promise.all([...out, ...inc].map(e => fetch(`${API}/edges/${e.id}`, { method: 'DELETE' })));
}

export async function getOutgoingEdges(nodeId: string): Promise<DBEdge[]> {
  return fetch(`${API}/edges?source_id=${nodeId}`).then(r => r.json());
}

export async function getIncomingEdges(nodeId: string): Promise<DBEdge[]> {
  return fetch(`${API}/edges?target_id=${nodeId}`).then(r => r.json());
}

export async function getEdgesByRelationship(_rel: EdgeRelationship): Promise<DBEdge[]> {
  return fetch(`${API}/edges`).then(r => r.json());
}

export async function getNeighborIds(
  nodeId: string,
  nodeType: NodeType
): Promise<{ id: string; type: NodeType; relationship: EdgeRelationship; direction: 'out' | 'in' }[]> {
  const [outgoing, incoming]: [DBEdge[], DBEdge[]] = await Promise.all([
    getOutgoingEdges(nodeId),
    getIncomingEdges(nodeId),
  ]);
  const results: { id: string; type: NodeType; relationship: EdgeRelationship; direction: 'out' | 'in' }[] = [];
  for (const e of outgoing) {
    if (e.source_type === nodeType) results.push({ id: e.target_id, type: e.target_type, relationship: e.relationship, direction: 'out' });
  }
  for (const e of incoming) {
    if (e.target_type === nodeType) results.push({ id: e.source_id, type: e.source_type, relationship: e.relationship, direction: 'in' });
  }
  return results;
}
