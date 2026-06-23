import { db } from '../db';
import type { DBNote, NoteType } from '../schema';
import { addEdge, removeAllEdgesForNode } from './edges';

function id()  { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

export async function getNotes(type?: NoteType): Promise<DBNote[]> {
  const base = type
    ? db.notes.where('type').equals(type)
    : db.notes.orderBy('created_at');
  return base.reverse().toArray();
}

export async function getNoteById(noteId: string): Promise<DBNote | undefined> {
  return db.notes.get(noteId);
}

export async function createNote(
  data: Omit<DBNote, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const note: DBNote = { ...data, id: id(), created_at: now(), updated_at: now() };
  await db.notes.add(note);
  return note.id;
}

export async function updateNoteContent(noteId: string, content: string): Promise<void> {
  await db.notes.update(noteId, { content, updated_at: now() });
}

export async function updateNote(
  noteId: string,
  updates: Partial<Omit<DBNote, 'id' | 'created_at'>>
): Promise<void> {
  await db.notes.update(noteId, { ...updates, updated_at: now() });
}

export async function deleteNote(noteId: string): Promise<void> {
  await removeAllEdgesForNode(noteId);
  await db.notes.delete(noteId);
}

// ── Suggested action ──────────────────────────────────────────────────────────

export async function applyNoteSuggestedAction(
  noteId: string,
  targetGoalId: string
): Promise<void> {
  await db.notes.update(noteId, {
    suggested_action_applied: true,
    updated_at: now(),
  });
  // record the edge: note → goal (mentioned_in)
  await addEdge({
    source_id: noteId,      source_type: 'note',
    target_id: targetGoalId, target_type: 'goal',
    relationship: 'mentioned_in',
    metadata: JSON.stringify({ via: 'suggested_action' }),
  });
}

export async function ignoreNoteSuggestedAction(noteId: string): Promise<void> {
  await db.notes.update(noteId, {
    suggested_action_ignored: true,
    updated_at: now(),
  });
}

// ── OO classification: link note to goal ─────────────────────────────────────

export async function linkNoteToGoal(
  noteId: string,
  goalId: string,
  confidence: number
): Promise<void> {
  await addEdge({
    source_id: noteId, source_type: 'note',
    target_id: goalId, target_type: 'goal',
    relationship: 'mentioned_in',
    metadata: JSON.stringify({ confidence, via: 'OO_classification' }),
  });
}

// ── Extract task from note (creates edge note → task) ─────────────────────────

export async function recordNoteTaskExtraction(
  noteId: string,
  taskId: string
): Promise<void> {
  await addEdge({
    source_id: noteId,  source_type: 'note',
    target_id: taskId,  target_type: 'task',
    relationship: 'extracted_to',
    metadata: null,
  });
}
