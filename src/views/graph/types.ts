import { Target, CheckSquare, Diamond, BookOpen, Calendar, ScrollText } from 'lucide-react';

export interface GraphNode { id: string; type: string; label: string; metadata: Record<string, unknown> }
export interface GraphEdge { id: string; source: string; target: string; relationship: string; weight: number }
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean; total_nodes: number }

export const TYPE_META: Record<string, { label: string; plural: string; color: string; chip: string; Icon: typeof Target }> = {
  goal:      { label: 'Goal',      plural: 'Goals',      color: '#a78bfa', chip: 'bg-violet-500/10 border-violet-500/30 text-violet-200', Icon: Target },
  milestone: { label: 'Milestone', plural: 'Milestones', color: '#818cf8', chip: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200', Icon: Diamond },
  task:      { label: 'Task',      plural: 'Tasks',      color: '#60a5fa', chip: 'bg-blue-500/10 border-blue-500/30 text-blue-200',       Icon: CheckSquare },
  resource:  { label: 'Resource',  plural: 'Resources',  color: '#34d399', chip: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200', Icon: BookOpen },
  meeting:   { label: 'Meeting',   plural: 'Meetings',   color: '#fbbf24', chip: 'bg-amber-500/10 border-amber-500/30 text-amber-200',    Icon: Calendar },
  journal:   { label: 'Journal',   plural: 'Journal entries', color: '#fb923c', chip: 'bg-orange-500/10 border-orange-500/30 text-orange-200', Icon: ScrollText },
};

const REL_MAP: Record<string, string> = {
  contains: 'is part of',
  attached_to: 'attached to',
  mentions: 'mentions',
  mentioned_in: 'mentioned in',
  progress_update: 'progress logged on',
  discusses: 'discusses',
  blocks: 'blocks',
  extracted_to: 'became',
  co_cited: 'used together with',
  journal_evidence: 'mentioned in journal',
  created_task: 'created',
  contributes_to: 'contributes to',
  risk_update: 'risk noted on',
  decision: 'decision about',
  blocker: 'blocker for',
};
// Always readable: unknown relationship keys fall back to de-snake-cased text.
export const REL_EXPLAIN = new Proxy(REL_MAP, {
  get: (t, k: string) => t[k] ?? String(k).replace(/_/g, ' '),
}) as Record<string, string>;
