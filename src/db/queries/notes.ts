import type { DBNote, NoteType } from '../schema';

const API = '/api';

export async function getNotes(_type?: NoteType): Promise<DBNote[]> {
  return fetch(`${API}/notes`).then(r => r.json());
}

export async function getNoteById(noteId: string): Promise<DBNote | undefined> {
  const r = await fetch(`${API}/notes/${noteId}`);
  return r.status === 404 ? undefined : r.json();
}

export async function createNote(
  data: Omit<DBNote, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const r = await fetch(`${API}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const { id } = await r.json();
  return id;
}

export async function updateNoteContent(noteId: string, content: string): Promise<void> {
  await fetch(`${API}/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

export async function updateNote(
  noteId: string,
  updates: Partial<Omit<DBNote, 'id' | 'created_at'>>
): Promise<void> {
  await fetch(`${API}/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteNote(noteId: string): Promise<void> {
  await fetch(`${API}/notes/${noteId}`, { method: 'DELETE' });
}

export async function applyNoteSuggestedAction(noteId: string, _targetGoalId: string): Promise<void> {
  await updateNote(noteId, { suggested_action_applied: true });
}

export async function ignoreNoteSuggestedAction(noteId: string): Promise<void> {
  await updateNote(noteId, { suggested_action_ignored: true });
}

export async function linkNoteToGoal(noteId: string, goalId: string, confidence: number): Promise<void> {
  await fetch(`${API}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id: noteId, source_type: 'note',
      target_id: goalId, target_type: 'goal',
      relationship: 'mentioned_in',
      metadata: JSON.stringify({ confidence, via: 'OO_classification' }),
    }),
  });
}

export async function recordNoteTaskExtraction(noteId: string, taskId: string): Promise<void> {
  await fetch(`${API}/edges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_id: noteId, source_type: 'note',
      target_id: taskId, target_type: 'task',
      relationship: 'extracted_to',
      metadata: null,
    }),
  });
}
