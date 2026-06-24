import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DBGoal, DBTask, DBTaskNote, DBTaskNoteFile, DBNote, DBEvent, DBResource } from '../db/schema';

const POLL = 800; // ms — near-real-time without hammering

// ── Goals ─────────────────────────────────────────────────────────────────────

export function useGoals() {
  return useQuery<DBGoal[]>({
    queryKey: ['goals'],
    queryFn: () => fetch('/api/goals').then(r => r.json()),
    refetchInterval: POLL,
    initialData: [],
  });
}

export function useGoal(goalId: string | null) {
  return useQuery<DBGoal | null>({
    queryKey: ['goals', goalId],
    queryFn: async () => {
      if (!goalId) return null;
      const r = await fetch(`/api/goals/${goalId}`);
      return r.status === 404 ? null : r.json();
    },
    enabled: Boolean(goalId),
    refetchInterval: POLL,
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export function useGoalTasks(goalId: string | null) {
  return useQuery<DBTask[]>({
    queryKey: ['tasks', { goalId }],
    queryFn: () => fetch(`/api/tasks?goal_id=${goalId}`).then(r => r.json()),
    enabled: Boolean(goalId),
    refetchInterval: POLL,
    initialData: [],
  });
}

export function useTask(taskId: string | null) {
  return useQuery<DBTask | null>({
    queryKey: ['tasks', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const r = await fetch(`/api/tasks/${taskId}`);
      return r.status === 404 ? null : r.json();
    },
    enabled: Boolean(taskId),
    refetchInterval: POLL,
  });
}

// ── Task notes ────────────────────────────────────────────────────────────────

export function useTaskNotes(taskId: string | null) {
  return useQuery<DBTaskNote[]>({
    queryKey: ['task-notes', taskId],
    queryFn: () => fetch(`/api/tasks/${taskId}/notes`).then(r => r.json()),
    enabled: Boolean(taskId),
    refetchInterval: POLL,
    initialData: [],
  });
}

// ── Note files ────────────────────────────────────────────────────────────────

export function useNoteFiles(noteId: string | null) {
  return useQuery<DBTaskNoteFile[]>({
    queryKey: ['note-files', noteId],
    queryFn: async () => {
      const rows = await fetch(`/api/task-note-files/${noteId}`).then(r => r.json()) as Array<Omit<DBTaskNoteFile, 'blob'>>;
      return rows.map(row => ({
        ...row,
        blob: null as unknown as Blob,
        file_url: `/api/task-note-files/data/${row.id}`,
      }));
    },
    enabled: Boolean(noteId),
    refetchInterval: POLL,
    initialData: [],
  });
}

// ── Brain dump notes ──────────────────────────────────────────────────────────

export function useNotes() {
  return useQuery<DBNote[]>({
    queryKey: ['notes'],
    queryFn: () => fetch('/api/notes').then(r => r.json()),
    refetchInterval: POLL,
    initialData: [],
  });
}

// ── Events ────────────────────────────────────────────────────────────────────

export function useEvents() {
  return useQuery<DBEvent[]>({
    queryKey: ['events'],
    queryFn: () => fetch('/api/events').then(r => r.json()),
    refetchInterval: POLL,
    initialData: [],
  });
}

// ── Resources ────────────────────────────────────────────────────────────────

export function useGoalResources(goalId: string | null) {
  return useQuery<DBResource[]>({
    queryKey: ['resources', { goalId }],
    queryFn: () => fetch(`/api/resources?goal_id=${goalId}`).then(r => r.json()),
    enabled: Boolean(goalId),
    refetchInterval: POLL,
    initialData: [],
  });
}

export function useTaskResources(taskId: string | null) {
  return useQuery<DBResource[]>({
    queryKey: ['resources', { taskId }],
    queryFn: () => fetch(`/api/resources?task_id=${taskId}`).then(r => r.json()),
    enabled: Boolean(taskId),
    refetchInterval: POLL,
    initialData: [],
  });
}

// ── Invalidation helpers (call after mutations) ───────────────────────────────

export function useInvalidate() {
  const qc = useQueryClient();
  return {
    goals: () => qc.invalidateQueries({ queryKey: ['goals'] }),
    tasks: (goalId?: string) => qc.invalidateQueries({ queryKey: ['tasks', ...(goalId ? [{ goalId }] : [])] }),
    allTasks: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
    notes: () => qc.invalidateQueries({ queryKey: ['notes'] }),
    taskNotes: (taskId?: string) => qc.invalidateQueries({ queryKey: ['task-notes', ...(taskId ? [taskId] : [])] }),
    noteFiles: (noteId?: string) => qc.invalidateQueries({ queryKey: ['note-files', ...(noteId ? [noteId] : [])] }),
    events: () => qc.invalidateQueries({ queryKey: ['events'] }),
    resources: () => qc.invalidateQueries({ queryKey: ['resources'] }),
    all: () => qc.invalidateQueries(),
  };
}
