import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DBGoal, DBTask, DBTaskNote, DBTaskNoteFile, DBNote, DBEvent, DBResource, DBMeeting, DBDeadline, DBMilestone, DBSchedulePrefs, DBWorkSession, DBJournalEntry, IngestionStatus } from '../db/schema';
import { apiFetch, apiPost, apiDelete } from '../utils/apiFetch';

// Static data: don't poll — use mutation-driven invalidation instead.
// Journal/proposal/schedule-preview use explicit intervals since they change server-side.
const STALE_SHORT = 30_000;  // 30s — task/goal data, invalidated on mutation
const STALE_STATIC = 120_000; // 2min — prefs, events, meetings

// ── Goals ─────────────────────────────────────────────────────────────────────

export function useGoals() {
  return useQuery<DBGoal[]>({
    queryKey: ['goals'],
    queryFn: () => apiFetch<DBGoal[]>('/api/goals'),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useGoal(goalId: string | null) {
  return useQuery<DBGoal | null>({
    queryKey: ['goals', goalId],
    queryFn: async () => {
      if (!goalId) return null;
      try { return await apiFetch<DBGoal>(`/api/goals/${goalId}`); }
      catch (e: unknown) { if ((e as { status?: number }).status === 404) return null; throw e; }
    },
    enabled: Boolean(goalId),
    staleTime: STALE_SHORT,
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function useAllTasks() {
  return useQuery<DBTask[]>({
    queryKey: ['tasks'],
    queryFn: () => apiFetch<DBTask[]>('/api/tasks'),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useGoalTasks(goalId: string | null) {
  return useQuery<DBTask[]>({
    queryKey: ['tasks', { goalId }],
    queryFn: () => apiFetch<DBTask[]>(`/api/tasks?goal_id=${goalId}`),
    enabled: Boolean(goalId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useTask(taskId: string | null) {
  return useQuery<DBTask | null>({
    queryKey: ['tasks', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      try { return await apiFetch<DBTask>(`/api/tasks/${taskId}`); }
      catch (e: unknown) { if ((e as { status?: number }).status === 404) return null; throw e; }
    },
    enabled: Boolean(taskId),
    staleTime: STALE_SHORT,
  });
}

// ── Task notes ────────────────────────────────────────────────────────────────

export function useTaskNotes(taskId: string | null) {
  return useQuery<DBTaskNote[]>({
    queryKey: ['task-notes', taskId],
    queryFn: () => apiFetch<DBTaskNote[]>(`/api/tasks/${taskId}/notes`),
    enabled: Boolean(taskId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

// ── Note files ────────────────────────────────────────────────────────────────

export function useNoteFiles(noteId: string | null) {
  return useQuery<DBTaskNoteFile[]>({
    queryKey: ['note-files', noteId],
    queryFn: async () => {
      const rows = await apiFetch<Array<Omit<DBTaskNoteFile, 'blob'>>>(`/api/task-note-files/${noteId}`);
      return rows.map(row => ({
        ...row,
        blob: null as unknown as Blob,
        file_url: `/api/task-note-files/data/${row.id}`,
      }));
    },
    enabled: Boolean(noteId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

// ── Brain dump notes ──────────────────────────────────────────────────────────

export function useNotes() {
  return useQuery<DBNote[]>({
    queryKey: ['notes'],
    queryFn: () => apiFetch<DBNote[]>('/api/notes'),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

// ── Events ────────────────────────────────────────────────────────────────────

export function useEvents() {
  return useQuery<DBEvent[]>({
    queryKey: ['events'],
    queryFn: () => apiFetch<DBEvent[]>('/api/events'),
    staleTime: STALE_STATIC,
    initialData: [],
  });
}

// ── Resources ────────────────────────────────────────────────────────────────

export function useAllResources() {
  return useQuery<DBResource[]>({
    queryKey: ['resources'],
    queryFn: () => apiFetch<DBResource[]>('/api/resources'),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useGoalResources(goalId: string | null) {
  return useQuery<DBResource[]>({
    queryKey: ['resources', { goalId }],
    queryFn: () => apiFetch<DBResource[]>(`/api/resources?goal_id=${goalId}`),
    enabled: Boolean(goalId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useTaskResources(taskId: string | null) {
  return useQuery<DBResource[]>({
    queryKey: ['resources', { taskId }],
    queryFn: () => apiFetch<DBResource[]>(`/api/resources?task_id=${taskId}`),
    enabled: Boolean(taskId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

// ── Goal Health Aggregate ─────────────────────────────────────────────────────

export interface GoalHealthRow {
  goal_id: string;
  total: number;
  completed: number;
  overdue: number;
  in_progress: number;
  estimated_minutes_total: number;
  actual_minutes_total: number;
  earliest_due: string | null;
  latest_due: string | null;
}

export function useGoalsHealth() {
  return useQuery<GoalHealthRow[]>({
    queryKey: ['goals-health'],
    queryFn: () => apiFetch<GoalHealthRow[]>('/api/goals/health'),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

// ── Goal Deadlines ────────────────────────────────────────────────────────────

export function useGoalDeadlines(goalId: string | null) {
  return useQuery<DBDeadline[]>({
    queryKey: ['deadlines', goalId],
    queryFn: () => apiFetch<DBDeadline[]>(`/api/goal-deadlines?goal_id=${goalId}`),
    enabled: Boolean(goalId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

// ── Meetings ──────────────────────────────────────────────────────────────────

export function useGoalMeetings(goalId: string | null) {
  return useQuery<DBMeeting[]>({
    queryKey: ['meetings', goalId],
    queryFn: () => apiFetch<DBMeeting[]>(`/api/meetings?goal_id=${goalId}`),
    enabled: Boolean(goalId),
    staleTime: STALE_STATIC,
    initialData: [],
  });
}

export function useAllMeetings() {
  return useQuery<DBMeeting[]>({
    queryKey: ['meetings'],
    queryFn: () => apiFetch<DBMeeting[]>('/api/meetings'),
    staleTime: STALE_STATIC,
    initialData: [],
  });
}

// ── Milestones ────────────────────────────────────────────────────────────────

export function useGoalMilestones(goalId: string | null) {
  return useQuery<DBMilestone[]>({
    queryKey: ['milestones', goalId],
    queryFn: () => apiFetch<DBMilestone[]>(`/api/milestones?goal_id=${goalId}`),
    enabled: Boolean(goalId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

// ── Schedule Preferences ──────────────────────────────────────────────────────

export function useSchedulePrefs() {
  return useQuery<DBSchedulePrefs>({
    queryKey: ['schedule-prefs'],
    queryFn: () => apiFetch<DBSchedulePrefs>('/api/schedule-prefs'),
    staleTime: STALE_STATIC,
  });
}

// ── Work Sessions ─────────────────────────────────────────────────────────────

export function useTaskWorkSessions(taskId: string | null) {
  return useQuery<DBWorkSession[]>({
    queryKey: ['work-sessions', taskId],
    queryFn: () => apiFetch<DBWorkSession[]>(`/api/work-sessions?task_id=${taskId}`),
    enabled: Boolean(taskId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useCreateWorkSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      task_id: string;
      minutes: number;
      notes?: string;
      source?: string;
    }) => apiPost<{ id: string }>('/api/work-sessions', body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['work-sessions', variables.task_id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['goal-tasks'] });
    },
  });
}

export function useDeleteWorkSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/work-sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-sessions'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// ── Journal ───────────────────────────────────────────────────────────────────

// DBJournalEntry is imported from schema.ts (canonical type)
export type { DBJournalEntry, IngestionStatus };

export interface DBJournalLink {
  id: string;
  journal_entry_id: string;
  target_type: string;
  target_id: string;
  target_title: string | null;
  relationship: string;
  confidence: number;
}

export interface DBExtractedFact {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string | null;
  target_id: string | null;
  fact_type: string;
  fact_text: string;
  confidence: number;
  status: string;
}

const TERMINAL_STATUSES = new Set(['processed', 'needs_review']);

export function useJournalEntries() {
  return useQuery<DBJournalEntry[]>({
    queryKey: ['journal'],
    queryFn: () => apiFetch<DBJournalEntry[]>('/api/journal'),
    // Poll only while any entry is still in-flight; stop once all are terminal
    refetchInterval: (query) => {
      const data = query.state.data as DBJournalEntry[] | undefined;
      const hasInFlight = data?.some(e => !TERMINAL_STATUSES.has(e.ingestion_status));
      return hasInFlight ? 5_000 : false;
    },
    initialData: [],
  });
}

/** Single entry — polls while pending/processing, stops at terminal states. */
export function useJournalEntry(id: string | null) {
  return useQuery<DBJournalEntry | null>({
    queryKey: ['journal', id],
    queryFn: async () => {
      if (!id) return null;
      try { return await apiFetch<DBJournalEntry>(`/api/journal/${id}`); }
      catch (e: unknown) { if ((e as { status?: number }).status === 404) return null; throw e; }
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const entry = query.state.data as DBJournalEntry | null | undefined;
      if (!entry) return false;
      return TERMINAL_STATUSES.has(entry.ingestion_status) ? false : 3_000;
    },
    staleTime: STALE_SHORT,
  });
}

/** Journal links — polls while the parent entry is still in-flight; stops at terminal. */
export function useJournalLinks(entryId: string | null) {
  const qc = useQueryClient();
  return useQuery<DBJournalLink[]>({
    queryKey: ['journal-links', entryId],
    queryFn: () => apiFetch<DBJournalLink[]>(`/api/journal/${entryId}/links`),
    enabled: Boolean(entryId),
    // Stop polling once the parent journal entry reaches a terminal state.
    refetchInterval: () => {
      const entry = qc.getQueryData<DBJournalEntry | null>(['journal', entryId]);
      if (entry && TERMINAL_STATUSES.has(entry.ingestion_status)) return false;
      return 5_000;
    },
    initialData: [],
  });
}

// ── AI Proposals ──────────────────────────────────────────────────────────────

export interface DBProposal {
  id: string;
  action_type: string;
  action_payload: string;
  explanation: string | null;
  confidence: number;
  status: string;
  source_type: string | null;
  source_id: string | null;
  source_entry_date: string | null;
  created_at: string;
}

export function useAIProposals() {
  return useQuery<DBProposal[]>({
    queryKey: ['ai-proposals'],
    queryFn: () => apiFetch<DBProposal[]>('/api/ai/proposals'),
    // Only poll while there are pending proposals; mutation-driven invalidation handles the rest.
    refetchInterval: (query) => {
      const data = query.state.data as DBProposal[] | undefined;
      return data?.some(p => p.status === 'pending') ? 5_000 : false;
    },
    initialData: [],
  });
}

// ── Schedule Preview ──────────────────────────────────────────────────────────

export interface ScheduleDay {
  date: string;
  tasks: Array<{ id: string; title: string; goal_id: string | null; due_date: string; estimated_minutes: number | null; priority: string; status: string }>;
  meetings: Array<{ id: string; title: string; scheduled_at: string; duration_minutes: number | null }>;
  deadline_titles: string[];
  proposals: Array<{ id: string; action_type: string; explanation: string | null; confidence: number; target_date: string; params: Record<string, unknown> }>;
  override: { available_minutes: number; note: string | null } | null;
}

export interface DayAssignment {
  date: string;
  available_minutes: number;
  used_minutes: number;
  task_ids: string[];
}

export interface SchedulerResult {
  status: 'feasible' | 'tight' | 'risky' | 'impossible';
  total_available_minutes: number;
  total_required_minutes: number;
  gap_minutes: number;
  tasks_fit: string[];
  tasks_overflow: string[];
  unestimated_task_ids: string[];
  cycle_task_ids: string[];
  day_assignments: DayAssignment[];
  impossible_reason?: string;
}

export interface ScheduleTaskInfo {
  title: string;
  goal_id: string | null;
  priority: string;
  estimated_minutes: number;
}

export function useSchedulePreview() {
  return useQuery<{
    days: ScheduleDay[];
    scheduler_result?: SchedulerResult;
    task_lookup?: Record<string, ScheduleTaskInfo>;
  }>({
    queryKey: ['schedule-preview'],
    queryFn: () => apiFetch<{
      days: ScheduleDay[];
      scheduler_result?: SchedulerResult;
      task_lookup?: Record<string, ScheduleTaskInfo>;
    }>('/api/ai/schedule-preview'),
    refetchInterval: 5_000,
  });
}

// ── Schedule Day Overrides ────────────────────────────────────────────────────

export interface DBScheduleOverride {
  id: string;
  date: string;
  available_minutes: number | null;
  unavailable_blocks: string;
  note: string | null;
  created_at: string;
}

export function useScheduleOverrides(from?: string, to?: string) {
  const params = from && to ? `?from=${from}&to=${to}` : '';
  return useQuery<DBScheduleOverride[]>({
    queryKey: ['schedule-overrides', from, to],
    queryFn: () => apiFetch<DBScheduleOverride[]>(`/api/schedule-prefs/overrides${params}`),
    staleTime: STALE_STATIC,
    initialData: [],
  });
}

export function useUpsertScheduleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, available_minutes, note }: { date: string; available_minutes: number | null; note?: string }) =>
      apiFetch(`/api/schedule-prefs/overrides/${date}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available_minutes, note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-overrides'] });
      qc.invalidateQueries({ queryKey: ['schedule-preview'] });
    },
  });
}

export function useDeleteScheduleOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => apiDelete(`/api/schedule-prefs/overrides/${date}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-overrides'] });
      qc.invalidateQueries({ queryKey: ['schedule-preview'] });
    },
  });
}

// ── Event-Task Links ──────────────────────────────────────────────────────────

export interface DBEventTaskLinkFull {
  id: string;
  event_id: string;
  task_id: string;
  planned_minutes: number | null;
  created_at: string;
  // task fields when querying by event_id
  task_title?: string;
  task_status?: string;
  goal_id?: string | null;
  completed?: boolean;
  // event fields when querying by task_id
  event_title?: string;
  event_type?: string;
  day_index?: number;
  start_hour?: number;
  duration_hours?: number;
  week_start?: string | null;
}

export function useEventTaskLinks(params: { event_id?: string; task_id?: string }) {
  const qs = params.event_id ? `?event_id=${params.event_id}` : params.task_id ? `?task_id=${params.task_id}` : null;
  return useQuery<DBEventTaskLinkFull[]>({
    queryKey: ['event-task-links', params],
    queryFn: () => apiFetch<DBEventTaskLinkFull[]>(`/api/event-task-links${qs}`),
    enabled: Boolean(qs),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useCreateEventTaskLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { event_id: string; task_id: string; planned_minutes?: number }) =>
      apiPost<{ id: string }>('/api/event-task-links', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-task-links'] });
      qc.invalidateQueries({ queryKey: ['schedule-preview'] });
    },
  });
}

export function useDeleteEventTaskLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/event-task-links/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event-task-links'] });
      qc.invalidateQueries({ queryKey: ['schedule-preview'] });
    },
  });
}

// ── Entity Aliases ────────────────────────────────────────────────────────────

export interface DBEntityAlias {
  id: string;
  entity_type: string;
  entity_id: string;
  alias: string;
  created_by: string | null;
  created_at: string;
  entity_title: string | null;
}

export function useEntityAliases(filters?: { entity_type?: string; entity_id?: string; created_by?: string }) {
  const params = new URLSearchParams();
  if (filters?.entity_type) params.set('entity_type', filters.entity_type);
  if (filters?.entity_id)   params.set('entity_id',   filters.entity_id);
  if (filters?.created_by)  params.set('created_by',  filters.created_by);
  const qs = params.toString();
  return useQuery<DBEntityAlias[]>({
    queryKey: ['entity-aliases', filters],
    queryFn: () => apiFetch<DBEntityAlias[]>(`/api/entity-aliases${qs ? `?${qs}` : ''}`),
    staleTime: STALE_STATIC,
    initialData: [],
  });
}

export function useDeleteEntityAlias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/entity-aliases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entity-aliases'] }),
  });
}

// ── Work session stats ────────────────────────────────────────────────────────

export interface WorkSessionStats {
  total_minutes: number;
  session_count: number;
  manual_minutes: number;
  journal_minutes: number;
  by_day: { day: string; minutes: number; sessions: number }[];
  by_goal: { id: string; title: string; minutes: number; tasks_worked: number }[];
  by_task: { id: string; title: string; goal_id: string | null; minutes: number; sessions: number }[];
  from: string | null;
  to: string | null;
}

export function useWorkSessionStats(params?: { from?: string; to?: string; goal_id?: string }) {
  const qs = new URLSearchParams();
  if (params?.from)     qs.set('from',    params.from);
  if (params?.to)       qs.set('to',      params.to);
  if (params?.goal_id)  qs.set('goal_id', params.goal_id);
  return useQuery<WorkSessionStats>({
    queryKey: ['work-session-stats', params],
    queryFn: () => apiFetch<WorkSessionStats>(`/api/work-sessions/stats${qs.toString() ? `?${qs}` : ''}`),
    staleTime: STALE_SHORT,
  });
}

// ── Global search ──────────────────────────────────────────────────────────────

export interface SearchResult {
  entity_type: string;
  entity_id: string;
  title: string;
  snippet: string | null;
  score: number;
  url?: string | null;
  due_date?: string | null;
  status?: string | null;
  goal_id?: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  vector_degraded: boolean;
  query: string;
}

export function useSearch(q: string, types?: string[]) {
  const params = new URLSearchParams({ q });
  if (types?.length) params.set('types', types.join(','));
  return useQuery<SearchResponse>({
    queryKey: ['search', q, types],
    queryFn: () => apiFetch<SearchResponse>(`/api/search?${params}`),
    enabled: q.trim().length > 0,
    staleTime: 30_000,
  });
}

// ── Data readiness ────────────────────────────────────────────────────────────

export interface DataReadinessItem {
  bucket: string;
  count: number;
  severity: 'info' | 'warning' | 'error';
  description: string;
}

export interface DataReadiness {
  ok: boolean;
  total_gaps: number;
  items: DataReadinessItem[];
  timestamp: string;
}

export function useDataReadiness() {
  return useQuery<DataReadiness>({
    queryKey: ['data-readiness'],
    queryFn: () => apiFetch<DataReadiness>('/api/data-readiness'),
    staleTime: 60_000,
  });
}

// ── Org inbox ─────────────────────────────────────────────────────────────────

export interface OrgInboxSection {
  bucket: string;
  label: string;
  items: Record<string, unknown>[];
}

export interface OrgInbox {
  total: number;
  sections: OrgInboxSection[];
  timestamp: string;
}

export function useOrgInbox() {
  return useQuery<OrgInbox>({
    queryKey: ['org-inbox'],
    queryFn: () => apiFetch<OrgInbox>('/api/ai/org-inbox'),
    staleTime: 60_000,
  });
}

// ── Chat sessions ─────────────────────────────────────────────────────────────

export interface ChatSession {
  id: string;
  title: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function useChatSessions() {
  return useQuery<ChatSession[]>({
    queryKey: ['chat-sessions'],
    queryFn: () => apiFetch<ChatSession[]>('/api/ai/sessions'),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useChatSessionMessages(sessionId: string | null) {
  return useQuery<ChatMessage[]>({
    queryKey: ['chat-session-messages', sessionId],
    queryFn: () => apiFetch<ChatMessage[]>(`/api/ai/sessions/${sessionId}/messages`),
    enabled: Boolean(sessionId),
    staleTime: STALE_SHORT,
    initialData: [],
  });
}

export function useCreateChatSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) =>
      apiPost<ChatSession>('/api/ai/sessions', { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-sessions'] }),
  });
}

export function useDeleteChatSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/ai/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat-sessions'] }),
  });
}

export function useSendSessionMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, message }: { sessionId: string; message: string }) =>
      apiPost<{ reply: string; actions?: unknown[]; session_id: string }>(
        `/api/ai/sessions/${sessionId}/chat`,
        { message },
      ),
    onSuccess: (_data, { sessionId }) => {
      qc.invalidateQueries({ queryKey: ['chat-session-messages', sessionId] });
      qc.invalidateQueries({ queryKey: ['chat-sessions'] });
      qc.invalidateQueries({ queryKey: ['proposals'] });
    },
  });
}

// ── Invalidation helpers (call after mutations) ───────────────────────────────

export function useInvalidate() {
  const qc = useQueryClient();
  return {
    goals: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goals-health'] });
    },
    tasks: (goalId?: string) => {
      // Always invalidate the all-tasks cache (used by GoalsDashboard)
      qc.invalidateQueries({ queryKey: ['tasks'] });
      // Also invalidate the goal-scoped cache when a specific goal is known
      if (goalId) qc.invalidateQueries({ queryKey: ['tasks', { goalId }] });
    },
    allTasks: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    notes: () => qc.invalidateQueries({ queryKey: ['notes'] }),
    taskNotes: (taskId?: string) => qc.invalidateQueries({ queryKey: ['task-notes', ...(taskId ? [taskId] : [])] }),
    noteFiles: (noteId?: string) => qc.invalidateQueries({ queryKey: ['note-files', ...(noteId ? [noteId] : [])] }),
    events: () => qc.invalidateQueries({ queryKey: ['events'] }),
    resources: () => qc.invalidateQueries({ queryKey: ['resources'] }),
    meetings: (goalId?: string) => qc.invalidateQueries({ queryKey: ['meetings', ...(goalId ? [goalId] : [])] }),
    deadlines: (goalId?: string) => qc.invalidateQueries({ queryKey: ['deadlines', ...(goalId ? [goalId] : [])] }),
    milestones: (goalId?: string) => qc.invalidateQueries({ queryKey: ['milestones', ...(goalId ? [goalId] : [])] }),
    schedulePrefs: () => qc.invalidateQueries({ queryKey: ['schedule-prefs'] }),
    workSessions: (taskId?: string) => qc.invalidateQueries({ queryKey: ['work-sessions', ...(taskId ? [taskId] : [])] }),
    journal: () => qc.invalidateQueries({ queryKey: ['journal'] }),
    aiProposals: () => qc.invalidateQueries({ queryKey: ['ai-proposals'] }),
    schedulePreview: () => qc.invalidateQueries({ queryKey: ['schedule-preview'] }),
    entityAliases: () => qc.invalidateQueries({ queryKey: ['entity-aliases'] }),
    eventTaskLinks: () => qc.invalidateQueries({ queryKey: ['event-task-links'] }),
    all: () => qc.invalidateQueries(),
  };
}
