import type { DBEdge, NodeType, EdgeRelationship } from '../schema';
import { apiFetch, apiPost, apiDelete } from '../../utils/apiFetch';

const API = '/api';

export async function addEdge(
  data: Omit<DBEdge, 'id' | 'created_at'>
): Promise<string> {
  const { id } = await apiPost<{ id: string }>(`${API}/edges`, data);
  return id;
}

export async function removeEdge(sourceId: string, targetId: string): Promise<void> {
  const edges = await apiFetch<DBEdge[]>(`${API}/edges?source_id=${sourceId}`);
  const match = edges.find(e => e.target_id === targetId);
  if (match) await apiDelete(`${API}/edges/${match.id}`);
}

export async function removeAllEdgesForNode(nodeId: string): Promise<void> {
  const [out, inc] = await Promise.all([
    apiFetch<DBEdge[]>(`${API}/edges?source_id=${nodeId}`),
    apiFetch<DBEdge[]>(`${API}/edges?target_id=${nodeId}`),
  ]);
  await Promise.all([...out, ...inc].map(e => apiDelete(`${API}/edges/${e.id}`)));
}

export async function getOutgoingEdges(nodeId: string): Promise<DBEdge[]> {
  return apiFetch<DBEdge[]>(`${API}/edges?source_id=${nodeId}`);
}

export async function getIncomingEdges(nodeId: string): Promise<DBEdge[]> {
  return apiFetch<DBEdge[]>(`${API}/edges?target_id=${nodeId}`);
}

export async function getEdgesByRelationship(_rel: EdgeRelationship): Promise<DBEdge[]> {
  return apiFetch<DBEdge[]>(`${API}/edges`);
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
