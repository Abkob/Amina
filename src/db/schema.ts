// ─── Node types for the graph view ─────────────────────────────────────────
export type NodeType =
  | 'goal'
  | 'task'
  | 'note'
  | 'resource'
  | 'event'
  | 'daily_score';

export type EdgeRelationship =
  | 'contains'       // goal → task
  | 'subtask_of'     // task → parent task
  | 'mentioned_in'   // note mentions goal / task
  | 'extracted_to'   // note's parsed task → task record
  | 'attached_to'    // resource → goal or task
  | 'schedules'      // event → task or goal
  | 'references'     // note → note, or note → resource
  | 'linked_to';     // generic bidirectional

// ─── Goals ──────────────────────────────────────────────────────────────────
export interface DBGoal {
  id: string;
  title: string;
  description: string;
  category: string;
  status: 'Safe' | 'Watch' | 'Risky';
  progress: number;                    // 0–100
  deadline: string | null;             // ISO date or quarter string e.g. "Q3 2024"
  overdue: boolean;
  activity_level: number;              // 1–5
  archived_at: string | null;          // null = visible, ISO date = archived
  created_at: string;
  updated_at: string;
}

// ─── Tasks (with subtask hierarchy) ─────────────────────────────────────────
export type TaskStatus = 'todo' | 'in_progress' | 'inactive' | 'done' | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskKind = 'next_action' | 'critical_path' | 'ai_generated' | 'manual';
export type CriticalPathStatus = 'Completed' | 'In Progress' | 'Future';

export interface DBTask {
  id: string;
  goal_id: string | null;              // null = standalone task
  parent_task_id: string | null;       // null = top-level task
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  kind: TaskKind;
  critical_path_status: CriticalPathStatus | null; // only for kind='critical_path'
  tags_json: string;                   // JSON: string[]
  due_date: string | null;             // ISO date ("YYYY-MM-DD") or datetime ("YYYY-MM-DDTHH:MM")
  estimated_duration: string | null;   // e.g. "Est. 2 hrs"
  estimated_minutes?: number | null;   // normalized time needed for scheduling
  actual_minutes?: number | null;      // logged after task is completed
  weight_percent?: number | null;      // optional explicit progress weight, 0-100
  completed: boolean;
  position: number;                    // ordering within sibling tasks
  last_activity_at?: string | null;
  completion_note?: string;
  created_at: string;
  updated_at: string;
}

// ─── Notes on tasks (inline comments / thread) ───────────────────────────────
export interface DBTaskNote {
  id: string;
  task_id: string;
  content: string;
  created_at: string;
}

// ─── Files attached to task-note journal entries ──────────────────────────────
export interface DBTaskNoteFile {
  id: string;
  note_id: string;
  name: string;
  mime_type: string;
  size: number;
  blob: Blob;        // kept for type compatibility; null in API mode, use file_url instead
  file_url?: string; // URL to stream the file from the server
  created_at: string;
}

// ─── Notes / Journals / Capture ──────────────────────────────────────────────
export type NoteType = 'journal' | 'capture' | 'session' | 'task_note';

export interface DBNote {
  id: string;
  title: string;
  content: string;
  type: NoteType;
  date_str: string;                    // human-readable "Today, Oct 24 • 09:41 AM"
  suggested_action_text: string | null;
  suggested_action_applied: boolean;
  suggested_action_ignored: boolean;
  // Embedded JSON arrays (seeded; will migrate to edge-based queries in graph view)
  extracted_tasks_json: string;        // JSON: { text: string; due: string }[]
  relevant_docs_json: string;          // JSON: { title: string; edited: string }[]
  created_at: string;
  updated_at: string;
}

// ─── Resources ───────────────────────────────────────────────────────────────
export type ResourceType      = 'figma' | 'document' | 'link' | 'paper' | 'person' | 'dataset' | 'concept' | 'other';
export type ResourceReadState = 'Unread' | 'Reading' | 'Done' | 'Shelved';

export interface DBResource {
  id: string;
  title: string;
  url: string | null;
  type: ResourceType;
  info: string;
  read_state: ResourceReadState;
  next_action: string;
  tags_json: string;   // JSON: string[]
  created_at: string;
}

export interface DBResourceMention {
  id: string;          // edge id
  resource_id: string;
  source_id: string;
  source_type: string; // 'note' | 'task' | 'braindump' | 'goal'
  created_at: string;
}

export interface ResourceLog {
  id: string;
  resource_id: string;
  content: string;
  is_insight: number;  // 0 = progress note, 1 = key insight
  created_at: string;
}

export interface ResourceStats {
  total_minutes: number;
  reference_count: number;
  goals_count: number;
  last_engaged: string | null;
}

// ─── Calendar Events ─────────────────────────────────────────────────────────
export type EventType = 'Focus' | 'Buffer' | 'Review' | 'Admin';

export interface DBEvent {
  id: string;
  title: string;
  type: EventType;
  day_index: number;                   // 0=Mon … 6=Sun
  start_hour: number;                  // e.g. 10.5 = 10:30
  duration_hours: number;
  time_str: string;
  description: string;
  week_start: string | null;           // ISO date of Monday of the week
  connected_resource_json: string | null; // JSON: { title: string; source: string }
  created_at: string;
  updated_at: string;
}

// ─── Daily Scores ─────────────────────────────────────────────────────────────
export interface DBDailyScore {
  id: string;
  date: string;                        // ISO date YYYY-MM-DD — unique per day
  score: number;                       // 0–100 overall composite
  mood: number;                        // 1–5
  energy: number;                      // 1–5
  focus: number;                       // 1–5
  tasks_completed: number;
  notes: string;
  created_at: string;
}

// ─── Graph Edges ──────────────────────────────────────────────────────────────
export interface DBEdge {
  id: string;
  source_id: string;
  source_type: NodeType;
  target_id: string;
  target_type: NodeType;
  relationship: EdgeRelationship;
  metadata: string | null;             // JSON string (confidence %, context, etc.)
  created_at: string;
}

// ─── Tags ─────────────────────────────────────────────────────────────────────
export interface DBTag {
  id: string;
  name: string;
  color: string;
}

export interface DBEntityTag {
  id: string;
  entity_id: string;
  entity_type: NodeType;
  tag_id: string;
}

// ─── Graph snapshot (for rendering) ──────────────────────────────────────────
export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  meta: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: EdgeRelationship;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Parsed embedded JSON helpers ────────────────────────────────────────────
export type ExtractedTask = { text: string; due: string };
export type RelevantDoc   = { title: string; edited: string };
export type ConnectedResource = { title: string; source: string };

export function parseExtractedTasks(json: string): ExtractedTask[] {
  try { return JSON.parse(json); } catch { return []; }
}
export function parseRelevantDocs(json: string): RelevantDoc[] {
  try { return JSON.parse(json); } catch { return []; }
}
export function parseConnectedResource(json: string | null): ConnectedResource | null {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}
export function parseTags(json: string): string[] {
  try { return JSON.parse(json); } catch { return []; }
}
