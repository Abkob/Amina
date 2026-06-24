import type { DBTaskNoteFile } from '../schema';

const API = '/api/task-note-files';

export async function addNoteFile(noteId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('files', file);
  const r = await fetch(`${API}/${noteId}`, { method: 'POST', body: form });
  const { ids } = await r.json();
  return ids[0];
}

export async function getNoteFilesForNote(noteId: string): Promise<DBTaskNoteFile[]> {
  const r = await fetch(`${API}/${noteId}`);
  const rows = await r.json() as Array<Omit<DBTaskNoteFile, 'blob'> & { file_path?: string }>;
  // Return with a synthetic blob placeholder — actual data streamed via file_url
  return rows.map(row => ({
    ...row,
    blob: null as unknown as Blob,
    file_url: `/api/task-note-files/data/${row.id}`,
  }));
}

export async function deleteNoteFile(fileId: string): Promise<void> {
  await fetch(`${API}/file/${fileId}`, { method: 'DELETE' });
}

export async function deleteNoteFilesForNotes(_noteIds: string[]): Promise<void> {
  // Server handles cascade deletion
}
