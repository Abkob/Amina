import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
]);
const BLOCKED_EXTS = new Set(['.exe', '.sh', '.bat', '.cmd', '.ps1', '.js', '.mjs', '.ts', '.py', '.rb', '.php', '.html', '.htm', '.svg', '.xml']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTS.has(ext)) return cb(new Error(`File type '${ext}' is not allowed`));
    if (!ALLOWED_MIMES.has(file.mimetype) && !file.mimetype.startsWith('image/')) {
      return cb(new Error(`MIME type '${file.mimetype}' is not allowed`));
    }
    cb(null, true);
  },
});

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

// IMPORTANT: Specific routes (/data/:fileId, /file/:fileId) must be registered
// BEFORE the wildcard route (/:noteId) or Express will match the wildcard first.

// GET /api/task-note-files/data/:fileId — stream file content
router.get('/data/:fileId', async (req, res) => {
  const { rows } = await query('SELECT * FROM task_note_files WHERE id=$1', [req.params.fileId]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const row = rows[0] as { file_path: string; mime_type: string; name: string };

  // Path containment check — the stored path must remain inside the managed uploads directory
  const resolved = path.resolve(row.file_path);
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  if (!resolved.startsWith(uploadsRoot + path.sep) && resolved !== uploadsRoot) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Not found' });
  const safeName = path.basename(row.name).replace(/[^\w.\- ]/g, '_');
  const isInline = row.mime_type.startsWith('image/') || row.mime_type === 'application/pdf';
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${safeName}"`);
  fs.createReadStream(resolved).pipe(res);
});

// DELETE /api/task-note-files/file/:fileId
router.delete('/file/:fileId', async (req, res) => {
  const { rows } = await query('SELECT file_path FROM task_note_files WHERE id=$1', [req.params.fileId]);
  if (rows.length) {
    const row = rows[0] as { file_path: string };
    try { fs.unlinkSync(row.file_path); } catch {}
  }
  await query('DELETE FROM task_note_files WHERE id=$1', [req.params.fileId]);
  res.json({ ok: true });
});

// GET /api/task-note-files/:noteId — list files for a note
router.get('/:noteId', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM task_note_files WHERE note_id=$1 ORDER BY created_at ASC',
    [req.params.noteId],
  );
  res.json(rows);
});

// POST /api/task-note-files/:noteId — upload files
router.post('/:noteId', upload.array('files'), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) return res.status(400).json({ error: 'No files' });
  const now = new Date().toISOString();
  const ids: string[] = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const mime_type = resolveMime(file.originalname, file.mimetype);
    await query(
      'INSERT INTO task_note_files (id,note_id,name,mime_type,size,file_path,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id, req.params.noteId, file.originalname, mime_type, file.size, file.path, now],
    );
    ids.push(id);
  }
  res.json({ ids });
});

export { router as filesRouter };
