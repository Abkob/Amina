import type { DBResource, ResourceLog, ResourceReadState, ResourceStats, ResourceType } from '../schema';

export type MentionSourceType = 'note' | 'task' | 'braindump' | 'goal';

const API = '/api';

// ── Collection ────────────────────────────────────────────────────────────────

export async function getResourcesForGoal(goalId: string): Promise<DBResource[]> {
  return fetch(`${API}/resources?goal_id=${goalId}`).then(r => r.json());
}

export async function getAllResources(): Promise<DBResource[]> {
  return fetch(`${API}/resources`).then(r => r.json());
}

export async function getResourcesForTask(taskId: string): Promise<DBResource[]> {
  return fetch(`${API}/resources?task_id=${taskId}`).then(r => r.json());
}

export async function createResource(
  data: { title: string; url: string | null; type: ResourceType; info: string },
  goalId: string,
  taskId?: string,
): Promise<string> {
  const r = await fetch(`${API}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, attach_to_id: taskId ?? goalId, attach_to_type: taskId ? 'task' : 'goal' }),
  });
  const { id } = await r.json();
  return id;
}

export async function getAllResourcesGrouped(
  goalId: string,
  taskIds: string[],
): Promise<{ goalResources: DBResource[]; taskResources: Record<string, DBResource[]> }> {
  const [goalResources, ...taskResourceArrays] = await Promise.all([
    getResourcesForGoal(goalId),
    ...taskIds.map(id => getResourcesForTask(id).then(res => [id, res] as const)),
  ]);
  const taskResources: Record<string, DBResource[]> = {};
  for (const [taskId, res] of taskResourceArrays as [string, DBResource[]][]) {
    if (res.length) taskResources[taskId] = res;
  }
  return { goalResources: goalResources as DBResource[], taskResources };
}

export async function deleteResource(resourceId: string): Promise<void> {
  await fetch(`${API}/resources/${resourceId}`, { method: 'DELETE' });
}

export function detectResourceType(input: string): ResourceType {
  const isLink = input.startsWith('http://') || input.startsWith('https://');
  if (isLink && input.toLowerCase().includes('figma')) return 'figma';
  if (isLink) return 'link';
  return 'document';
}

export async function createStandaloneResource(data: {
  title: string;
  type: ResourceType;
  url?: string | null;
  info?: string;
}): Promise<string> {
  const r = await fetch(`${API}/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: data.title, type: data.type, url: data.url ?? null, info: data.info ?? '' }),
  });
  const { id } = await r.json();
  return id;
}

// ── @mention edges ────────────────────────────────────────────────────────────

export async function getMentionsForItem(
  sourceType: MentionSourceType,
  sourceId: string,
): Promise<(DBResource & { edge_id: string })[]> {
  return fetch(`${API}/resources/mentions?source_id=${sourceId}&source_type=${sourceType}`).then(r => r.json());
}

export async function addMention(
  sourceType: MentionSourceType,
  sourceId: string,
  resourceId: string,
): Promise<string> {
  const r = await fetch(`${API}/resources/mentions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id: sourceId, source_type: sourceType, resource_id: resourceId }),
  });
  const { id } = await r.json();
  return id;
}

export async function removeMention(edgeId: string): Promise<void> {
  await fetch(`${API}/resources/mentions/${edgeId}`, { method: 'DELETE' });
}

// ── Single resource ───────────────────────────────────────────────────────────

export async function getResource(id: string): Promise<DBResource> {
  return fetch(`${API}/resources/${id}`).then(r => r.json());
}

export async function updateResource(
  id: string,
  patch: Partial<Pick<DBResource, 'title' | 'type' | 'url' | 'info' | 'read_state' | 'next_action' | 'tags_json'>>,
): Promise<void> {
  await fetch(`${API}/resources/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

// ── Resource profile data ─────────────────────────────────────────────────────

export interface ResourceReference {
  edge_id: string;
  source_id: string;
  source_type: string;
  source_title: string | null;
  source_content: string | null;
  parent_title: string | null;
  created_at: string;
}

export async function getResourceReferences(resourceId: string): Promise<ResourceReference[]> {
  return fetch(`${API}/resources/${resourceId}/references`).then(r => r.json());
}

export async function getResourceStats(resourceId: string): Promise<ResourceStats> {
  return fetch(`${API}/resources/${resourceId}/stats`).then(r => r.json());
}

export async function getResourceLogs(resourceId: string): Promise<ResourceLog[]> {
  return fetch(`${API}/resources/${resourceId}/logs`).then(r => r.json());
}

export async function addResourceLog(resourceId: string, content: string, isInsight: boolean): Promise<string> {
  const r = await fetch(`${API}/resources/${resourceId}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, is_insight: isInsight }),
  });
  const { id } = await r.json();
  return id;
}

export async function deleteResourceLog(resourceId: string, logId: string): Promise<void> {
  await fetch(`${API}/resources/${resourceId}/logs/${logId}`, { method: 'DELETE' });
}

// ── Resource graph data ───────────────────────────────────────────────────────

export interface ResourceGraphNode {
  id: string;
  label: string;
  nodeType: 'resource' | 'task' | 'goal';
  meta?: { subtype?: string; completed?: boolean; status?: string; goal_id?: string; actual_minutes?: number };
}
export interface ResourceGraphEdge {
  source: string;
  target: string;
  rel: 'mentions' | 'contains' | 'co_cited';
}
export interface ResourceGraphData {
  nodes: ResourceGraphNode[];
  edges: ResourceGraphEdge[];
}

export async function getResourceGraph(resourceId: string): Promise<ResourceGraphData> {
  return fetch(`${API}/resources/${resourceId}/graph`).then(r => r.json());
}

// ── File upload ───────────────────────────────────────────────────────────────

export async function uploadResourceFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await fetch(`${API}/resources/upload`, { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Upload failed');
  const { id } = await r.json();
  return id;
}

// ── Read state cycling ────────────────────────────────────────────────────────

const READ_STATE_CYCLE: ResourceReadState[] = ['Unread', 'Reading', 'Done', 'Shelved'];

export function nextReadState(current: ResourceReadState): ResourceReadState {
  const idx = READ_STATE_CYCLE.indexOf(current);
  return READ_STATE_CYCLE[(idx + 1) % READ_STATE_CYCLE.length];
}
