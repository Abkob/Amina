import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage });

function resolveMime(name: string, fileMime: string): string {
  if (fileMime && fileMime !== 'application/octet-stream') return fileMime;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', txt: 'text/plain', md: 'text/markdown',
  };
  return map[ext] ?? 'application/octet-stream';
}

const router = Router();

// GET /api/task-note-files/:noteId  — list files for a note
router.get('/:noteId', (req, res) => {
  const rows = db.prepare('SELECT * FROM task_note_files WHERE note_id = ? ORDER BY created_at ASC').all(req.params.noteId);
  res.json(rows);
});

// POST /api/task-note-files/:noteId  — upload files
router.post('/:noteId', upload.array('files'), (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ error: 'No files' });
  const now = new Date().toISOString();
  const ids: string[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const mime_type = resolveMime(file.originalname, file.mimetype);
    db.prepare('INSERT INTO task_note_files (id, note_id, name, mime_type, size, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.params.noteId, file.originalname, mime_type, file.size, file.path, now);
    ids.push(id);
  }
  res.json({ ids });
});

// GET /api/task-note-files/data/:fileId  — stream the file
router.get('/data/:fileId', (req, res) => {
  const row = db.prepare('SELECT * FROM task_note_files WHERE id = ?').get(req.params.fileId) as
    { file_path: string; mime_type: string; name: string } | undefined;
  if (!row || !fs.existsSync(row.file_path)) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${row.name}"`);
  fs.createReadStream(row.file_path).pipe(res);
});

// DELETE /api/task-note-files/file/:fileId
router.delete('/file/:fileId', (req, res) => {
  const row = db.prepare('SELECT file_path FROM task_note_files WHERE id = ?').get(req.params.fileId) as { file_path: string } | undefined;
  if (row) { try { fs.unlinkSync(row.file_path); } catch {} }
  db.prepare('DELETE FROM task_note_files WHERE id = ?').run(req.params.fileId);
  res.json({ ok: true });
});

export { router as filesRouter };
