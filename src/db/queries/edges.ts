import { db } from '../db';
import type { DBEdge, NodeType, EdgeRelationship } from '../schema';

function id() { return crypto.randomUUID(); }

export async function addEdge(
  data: Omit<DBEdge, 'id' | 'created_at'>
): Promise<string> {
  const edge: DBEdge = { ...data, id: id(), created_at: new Date().toISOString() };
  await db.edges.add(edge);
  return edge.id;
}

export async function removeEdge(sourceId: string, targetId: string): Promise<void> {
  await db.edges.where('[source_id+target_id]').equals([sourceId, targetId]).delete();
}

export async function removeAllEdgesForNode(nodeId: string): Promise<void> {
  await db.edges.where('source_id').equals(nodeId).delete();
  await db.edges.where('target_id').equals(nodeId).delete();
}

export async function getOutgoingEdges(nodeId: string): Promise<DBEdge[]> {
  return db.edges.where('source_id').equals(nodeId).toArray();
}

export async function getIncomingEdges(nodeId: string): Promise<DBEdge[]> {
  return db.edges.where('target_id').equals(nodeId).toArray();
}

export async function getEdgesByRelationship(rel: EdgeRelationship): Promise<DBEdge[]> {
  return db.edges.where('relationship').equals(rel).toArray();
}

export async function getNeighborIds(
  nodeId: string,
  nodeType: NodeType
): Promise<{ id: string; type: NodeType; relationship: EdgeRelationship; direction: 'out' | 'in' }[]> {
  const [outgoing, incoming] = await Promise.all([
    db.edges.where('source_id').equals(nodeId).toArray(),
    db.edges.where('target_id').equals(nodeId).toArray(),
  ]);

  const results: { id: string; type: NodeType; relationship: EdgeRelationship; direction: 'out' | 'in' }[] = [];

  for (const e of outgoing) {
    if (e.source_type === nodeType) {
      results.push({ id: e.target_id, type: e.target_type, relationship: e.relationship, direction: 'out' });
    }
  }
  for (const e of incoming) {
    if (e.target_type === nodeType) {
      results.push({ id: e.source_id, type: e.source_type, relationship: e.relationship, direction: 'in' });
    }
  }

  return results;
}
