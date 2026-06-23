import { db } from '../db';
import type { DBTaskNoteFile } from '../schema';

function id()  { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

function resolveMime(name: string, fileMime: string): string {
  if (fileMime) return fileMime;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf:  'application/pdf',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    webp: 'image/webp',
    svg:  'image/svg+xml',
    txt:  'text/plain',
    md:   'text/markdown',
  };
  return map[ext] ?? 'application/octet-stream';
}

export async function addNoteFile(noteId: string, file: File): Promise<string> {
  const record: DBTaskNoteFile = {
    id:         id(),
    note_id:    noteId,
    name:       file.name,
    mime_type:  resolveMime(file.name, file.type),
    size:       file.size,
    blob:       file,
    created_at: now(),
  };
  await db.task_note_files.add(record);
  return record.id;
}

export async function getNoteFilesForNote(noteId: string): Promise<DBTaskNoteFile[]> {
  return db.task_note_files.where('note_id').equals(noteId).sortBy('created_at');
}

export async function deleteNoteFile(fileId: string): Promise<void> {
  await db.task_note_files.delete(fileId);
}

export async function deleteNoteFilesForNotes(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return;
  await db.task_note_files.where('note_id').anyOf(noteIds).delete();
}
