import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, buildUpdate, transaction } from '../db.js';
import { generateEntitySummary } from '../services/summaryGenerator.js';
import { queueEmbeddingUpsert, markEmbeddingStale } from '../services/embeddingLifecycle.js';
import { processResourceChunks } from '../services/chunkPipeline.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dir, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  // SVG is intentionally excluded — it can embed scripts and execute in-origin
]);
const BLOCKED_EXTS = new Set([
  '.exe', '.sh', '.bash', '.zsh', '.fish',
  '.js', '.mjs', '.cjs', '.ts', '.py', '.rb', '.php',
  '.bat', '.cmd', '.ps1', '.psm1',
  '.svg', '.html', '.htm', '.xml', // active formats that execute in-browser
]);

const _storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  // UUID filename prevents path traversal and original-name collisions
  filename: (_, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});

const upload = multer({
  storage: _storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTS.has(ext)) {
      return cb(new Error(`File type '${ext}' is not allowed`));
    }
    if (!ALLOWED_MIMES.has(file.mimetype) && !file.mimetype.startsWith('text/')) {
      return cb(new Error(`MIME type '${file.mimetype}' is not allowed`));
    }
    cb(null, true);
  },
});

function typeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return 'document';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'document';
  if (ext === 'fig') return 'figma';
  return 'other';
}

const VALID_READ_STATES = new Set(['Unread', 'Reading', 'Done', 'Shelved']);

// ─── Magic-byte validation ─────────────────────────────────────────────────────
// Read the first 16 bytes of the uploaded file and confirm they match the
// declared MIME type. This blocks polyglots and wrong-extension attacks that
// sneak past the extension/MIME allowlists above.
type MagicEntry = { bytes: number[]; offset?: number }[];
const MAGIC_BYTES: Record<string, MagicEntry> = {
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }],        // %PDF
  'image/png':  [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }],
  'image/jpeg': [{ bytes: [0xFF, 0xD8, 0xFF] }],
  'image/gif':  [{ bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },  // GIF87a
                 { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }], // GIF89a
  'image/webp': [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },   // RIFF at 0
                 { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }],  // WEBP at 8
};

function validateMagicBytes(filePath: string, mimeType: string): boolean {
  const entries = MAGIC_BYTES[mimeType];
  if (!entries) return true; // text/* types have no magic bytes — rely on extension
  const header = Buffer.alloc(16);
  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const n = fs.readSync(fd, header, 0, 16, 0);
    const buf = header.subarray(0, n);
    // WebP: check both signatures (RIFF at 0 AND WEBP at 8)
    if (mimeType === 'image/webp') {
      const riff = MAGIC_BYTES['image/webp'][0].bytes;
      const webp = MAGIC_BYTES['image/webp'][1].bytes;
      return buf.subarray(0, 4).equals(Buffer.from(riff)) &&
             buf.subarray(8, 12).equals(Buffer.from(webp));
    }
    return entries.some(e => {
      const sig = Buffer.from(e.bytes);
      const off = e.offset ?? 0;
      return buf.length >= off + sig.length &&
             buf.subarray(off, off + sig.length).equals(sig);
    });
  } catch {
    return false; // unreadable file → reject
  } finally {
    if (fd !== null) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

const router = Router();

// GET /api/resources?goal_id=...  or  ?task_id=...  or  ?task_ids=id1,id2,...  or bare (all)
router.get('/', async (req, res) => {
  const { goal_id, task_id, task_ids } = req.query;
  if (goal_id) {
    const { rows } = await query(
      `SELECT r.* FROM resources r
       JOIN edges e ON e.source_id = r.id AND e.relationship = 'attached_to' AND e.target_id = $1`,
      [goal_id],
    );
    return res.json(rows);
  }
  if (task_id) {
    const { rows } = await query(
      `SELECT r.* FROM resources r
       JOIN edges e ON e.source_id = r.id AND e.relationship = 'attached_to' AND e.target_id = $1`,
      [task_id],
    );
    return res.json(rows);
  }
  // Batch lookup: returns { task_id, resource } rows so caller can group them
  if (task_ids && typeof task_ids === 'string') {
    const ids = task_ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
    if (ids.length === 0) return res.json([]);
    const { rows } = await query(
      `SELECT e.target_id AS task_id, r.*
       FROM resources r
       JOIN edges e ON e.source_id = r.id AND e.relationship = 'attached_to'
       WHERE e.target_id = ANY($1::text[])`,
      [ids],
    );
    return res.json(rows);
  }
  const limit  = Math.min(Math.max(1, Number(req.query.limit)  || 500), 500);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const { rows } = await query(
    'SELECT * FROM resources ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );
  res.json(rows);
});

// GET /api/resources/mentions
router.get('/mentions', async (req, res) => {
  const { source_id, source_type, resource_id } = req.query as Record<string, string>;
  if (source_id && source_type) {
    const { rows } = await query(
      `SELECT r.*, e.id as edge_id FROM resources r
       JOIN edges e ON e.target_id = r.id AND e.relationship = 'mentions'
       WHERE e.source_id = $1 AND e.source_type = $2
       ORDER BY e.created_at ASC`,
      [source_id, source_type],
    );
    return res.json(rows);
  }
  if (resource_id) {
    const { rows } = await query(
      `SELECT e.source_id, e.source_type, e.created_at, e.id as edge_id FROM edges e
       WHERE e.target_id = $1 AND e.relationship = 'mentions'
       ORDER BY e.created_at DESC`,
      [resource_id],
    );
    return res.json(rows);
  }
  res.status(400).json({ error: 'provide source_id+source_type or resource_id' });
});

// POST /api/resources/mentions
router.post('/mentions', async (req, res) => {
  const { source_id, source_type, resource_id } = req.body;
  if (!source_id || !source_type || !resource_id) return res.status(400).json({ error: 'missing fields' });
  const { rows: existing } = await query(
    `SELECT id FROM edges WHERE source_id=$1 AND source_type=$2 AND target_id=$3 AND relationship='mentions'`,
    [source_id, source_type, resource_id],
  );
  if (existing.length) return res.json({ id: (existing[0] as Record<string, unknown>).id });
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
    [id, source_id, source_type, resource_id, 'resource', 'mentions', null, new Date().toISOString()],
  );
  res.json({ id });
});

// DELETE /api/resources/mentions/:edgeId
router.delete('/mentions/:edgeId', async (req, res) => {
  await query("DELETE FROM edges WHERE id=$1 AND relationship='mentions'", [req.params.edgeId]);
  res.json({ ok: true });
});

// POST /api/resources/upload
router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large (50 MB limit)' });
    }
    if (err) return res.status(400).json({ error: (err as Error).message });
    next();
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  // Magic-byte check: file content must match its declared MIME type
  if (!validateMagicBytes(file.path, file.mimetype)) {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'File content does not match its declared type' });
  }
  const now  = new Date().toISOString();
  const id   = crypto.randomUUID();
  const base = path.basename(file.originalname, path.extname(file.originalname));
  const url  = `/api/resources/serve/${file.filename}`;
  const type = typeFromFilename(file.originalname);
  await query(
    'INSERT INTO resources (id,title,url,type,info,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, base, url, type, `Uploaded ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, now],
  );
  res.json({ id });
  generateEntitySummary('resource', id).catch(err => console.error('[summary] resource upload:', err));
  queueEmbeddingUpsert('resource', id).catch(err => console.error('[embedding] resource upload:', err));
  // Chunk text/PDF files for semantic search
  processResourceChunks(id, file.path, file.mimetype)
    .catch(err => console.error('[chunk-pipeline] upload:', err));
});

// GET /api/resources/serve/:filename
router.get('/serve/:filename', (req, res) => {
  // Only allow alphanumeric, hyphens, underscores, and a single dot for extension
  const safeName = req.params.filename.replace(/[^a-zA-Z0-9.\-_]/g, '');
  const resolved = path.resolve(path.join(UPLOADS_DIR, safeName));
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!fs.existsSync(resolved)) return res.status(404).json({ error: 'Not found' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  // Force download for types the viewer doesn't display inline to prevent
  // unexpected browser rendering (e.g. text/html if extension check was bypassed).
  const ext = path.extname(safeName).toLowerCase();
  const inlineExts = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.md', '.csv']);
  if (!inlineExts.has(ext)) {
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  }
  res.sendFile(resolved);
});

// GET /api/resources/:id
router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM resources WHERE id=$1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

// POST /api/resources
router.post('/', async (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const b = req.body;
  await query(
    `INSERT INTO resources (id,title,url,type,info,description,read_state,next_action,tags_json,estimated_minutes,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      b.title ?? '',
      b.url ?? null,
      b.type ?? 'link',
      b.info ?? '',
      b.description ?? null,
      b.read_state ?? 'Unread',
      b.next_action ?? '',
      b.tags_json ?? '[]',
      b.estimated_minutes ?? null,
      now,
      now,
    ],
  );
  if (b.attach_to_id) {
    await query(
      `INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
      [crypto.randomUUID(), id, 'resource', b.attach_to_id, b.attach_to_type ?? 'goal', 'attached_to', null, now],
    );
  }
  res.json({ id });
  generateEntitySummary('resource', id).catch(err => console.error('[summary] resource create:', err));
  queueEmbeddingUpsert('resource', id).catch(err => console.error('[embedding] resource create:', err));
});

// PATCH /api/resources/:id
router.patch('/:id', async (req, res) => {
  const { rows: existing } = await query('SELECT id FROM resources WHERE id=$1', [req.params.id]);
  if (!existing.length) return res.status(404).json({ error: 'Not found' });
  const { title, type, url, info, description, read_state, next_action, tags_json, estimated_minutes } = req.body;
  if (read_state !== undefined && !VALID_READ_STATES.has(read_state)) {
    return res.status(400).json({ error: `Invalid read_state. Must be one of: ${[...VALID_READ_STATES].join(', ')}` });
  }
  if (tags_json !== undefined) {
    try { if (!Array.isArray(JSON.parse(tags_json))) throw new Error(); }
    catch { return res.status(400).json({ error: 'tags_json must be a JSON array string' }); }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title             !== undefined) updates.title             = title;
  if (type              !== undefined) updates.type              = type;
  if (url               !== undefined) updates.url               = url;
  if (info              !== undefined) updates.info              = info;
  if (description       !== undefined) updates.description       = description;
  if (read_state        !== undefined) updates.read_state        = read_state;
  if (next_action       !== undefined) updates.next_action       = next_action;
  if (tags_json         !== undefined) updates.tags_json         = tags_json;
  if (estimated_minutes !== undefined) updates.estimated_minutes = estimated_minutes;

  const { sets, vals } = buildUpdate(updates);
  await query(`UPDATE resources SET ${sets} WHERE id=$${vals.length + 1}`, [...vals, req.params.id]);
  res.json({ ok: true });
  generateEntitySummary('resource', req.params.id).catch(err => console.error('[summary] resource update:', err));
  markEmbeddingStale('resource', req.params.id).catch(() => {});
  queueEmbeddingUpsert('resource', req.params.id).catch(err => console.error('[embedding] resource update:', err));
});

// DELETE /api/resources/:id
router.delete('/:id', async (req, res) => {
  const resourceId = req.params.id;
  // Read file_path before deletion so we can clean up after transaction
  const { rows: resourceRows } = await query('SELECT file_path FROM resources WHERE id=$1', [resourceId]);
  const filePath = resourceRows.length ? (resourceRows[0] as Record<string, unknown>).file_path as string | null : null;

  await transaction(async (client) => {
    // Use explicit type predicates to prevent cross-type ID collisions from deleting unrelated edges
    await client.query(
      `DELETE FROM edges WHERE (source_id=$1 AND source_type='resource')
                            OR (target_id=$1 AND target_type='resource')`,
      [resourceId],
    );
    await client.query('DELETE FROM entity_summaries WHERE entity_type=$1 AND entity_id=$2', ['resource', resourceId]);
    await client.query("DELETE FROM embedding_jobs WHERE entity_type='resource' AND entity_id=$1 AND status IN ('pending','failed')", [resourceId]);
    // Clean derived evidence (no FK cascade for these tables)
    await client.query("DELETE FROM journal_links WHERE target_type='resource' AND target_id=$1", [resourceId]);
    await client.query("DELETE FROM extracted_facts WHERE target_type='resource' AND target_id=$1", [resourceId]);
    await client.query("DELETE FROM entity_aliases WHERE entity_type='resource' AND entity_id=$1", [resourceId]);
    await client.query("DELETE FROM ai_action_proposals WHERE source_type='resource' AND source_id=$1 AND status='pending'", [resourceId]);
    // Null out resource_id on work_sessions (resource_id has no FK constraint in schema)
    await client.query("UPDATE work_sessions SET resource_id=NULL WHERE resource_id=$1", [resourceId]);
    await client.query('DELETE FROM resources WHERE id=$1', [resourceId]);
  });
  res.json({ ok: true });
  // Delete physical file after transaction commits (best-effort — DB is canonical)
  if (filePath) {
    try {
      const resolved = path.resolve(filePath);
      if (resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
        fs.unlink(resolved, err => { if (err && err.code !== 'ENOENT') console.warn('[cleanup] resource file delete:', err); });
      }
    } catch { /* ignore */ }
  }
  query("DELETE FROM embeddings WHERE entity_type='resource' AND entity_id=$1", [resourceId])
    .catch(err => console.error('[cleanup] resource embeddings:', err));
});

// GET /api/resources/:id/references
router.get('/:id/references', async (req, res) => {
  const { rows: raw } = await query(
    `SELECT e.id as edge_id, e.source_id, e.source_type, e.created_at
     FROM edges e WHERE e.target_id=$1 AND e.relationship='mentions'
     ORDER BY e.created_at DESC`,
    [req.params.id],
  ) as { rows: { edge_id: string; source_id: string; source_type: string; created_at: string }[] };

  const enriched = await Promise.all(
    raw.map(async row => {
      let source_title: string | null = null;
      let source_content: string | null = null;
      let parent_title: string | null = null;

      if (row.source_type === 'note') {
        const { rows: noteRows } = await query('SELECT content, task_id FROM task_notes WHERE id=$1', [row.source_id]);
        if (noteRows.length) {
          const note = noteRows[0] as Record<string, unknown>;
          source_content = (note.content as string).slice(0, 200);
          const { rows: taskRows } = await query('SELECT title FROM tasks WHERE id=$1', [note.task_id]);
          if (taskRows.length) parent_title = (taskRows[0] as Record<string, unknown>).title as string;
        }
        source_title = 'Journal entry';
      } else if (row.source_type === 'task') {
        const { rows: taskRows } = await query('SELECT title FROM tasks WHERE id=$1', [row.source_id]);
        if (taskRows.length) source_title = (taskRows[0] as Record<string, unknown>).title as string;
      } else if (row.source_type === 'goal') {
        const { rows: goalRows } = await query('SELECT title FROM goals WHERE id=$1', [row.source_id]);
        if (goalRows.length) source_title = (goalRows[0] as Record<string, unknown>).title as string;
      } else if (row.source_type === 'braindump') {
        const { rows: noteRows } = await query('SELECT title FROM notes WHERE id=$1', [row.source_id]);
        source_title = noteRows.length ? (noteRows[0] as Record<string, unknown>).title as string : 'Brain dump';
      }

      return { ...row, source_title, source_content, parent_title };
    }),
  );

  res.json(enriched);
});

// GET /api/resources/:id/stats
router.get('/:id/stats', async (req, res) => {
  const resourceId = req.params.id;

  const { rows: directTaskMentions } = await query(
    `SELECT source_id as task_id FROM edges WHERE target_id=$1 AND relationship='mentions' AND source_type='task'`,
    [resourceId],
  ) as { rows: { task_id: string }[] };

  const { rows: noteTaskMentions } = await query(
    `SELECT tn.task_id FROM edges e
     JOIN task_notes tn ON tn.id = e.source_id
     WHERE e.target_id=$1 AND e.relationship='mentions' AND e.source_type='note'`,
    [resourceId],
  ) as { rows: { task_id: string }[] };

  const taskIds = Array.from(new Set([
    ...directTaskMentions.map(r => r.task_id),
    ...noteTaskMentions.map(r => r.task_id),
  ]));

  let total_minutes = 0;
  const goalIds = new Set<string>();
  for (const taskId of taskIds) {
    const { rows: taskRows } = await query('SELECT actual_minutes, goal_id FROM tasks WHERE id=$1', [taskId]);
    if (taskRows.length) {
      const t = taskRows[0] as Record<string, unknown>;
      total_minutes += (t.actual_minutes as number) ?? 0;
      if (t.goal_id) goalIds.add(t.goal_id as string);
    }
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(*) as n FROM edges WHERE target_id=$1 AND relationship='mentions'`,
    [resourceId],
  );
  const reference_count = Number((countRows[0] as Record<string, unknown>).n ?? 0);

  const { rows: lastLogRows } = await query(
    'SELECT created_at FROM resource_logs WHERE resource_id=$1 ORDER BY created_at DESC LIMIT 1',
    [resourceId],
  );
  const { rows: lastRefRows } = await query(
    `SELECT created_at FROM edges WHERE target_id=$1 AND relationship='mentions' ORDER BY created_at DESC LIMIT 1`,
    [resourceId],
  );

  const dates = [
    lastLogRows[0] ? (lastLogRows[0] as Record<string, unknown>).created_at : null,
    lastRefRows[0] ? (lastRefRows[0] as Record<string, unknown>).created_at : null,
  ].filter(Boolean) as string[];
  const last_engaged = dates.length ? dates.sort().reverse()[0] : null;

  res.json({ total_minutes, reference_count, goals_count: goalIds.size, last_engaged });
});

// GET /api/resources/:id/graph
router.get('/:id/graph', async (req, res) => {
  const resourceId = req.params.id;
  const { rows: rRows } = await query('SELECT * FROM resources WHERE id=$1', [resourceId]);
  if (!rRows.length) return res.status(404).end();
  const resource = rRows[0] as Record<string, unknown>;

  type GNode = { id: string; label: string; nodeType: string; meta?: Record<string, unknown> };
  type GEdge = { source: string; target: string; rel: string };
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const addNode = (n: GNode) => { if (!seen.has(n.id)) { nodes.push(n); seen.add(n.id); } };

  addNode({ id: resourceId, label: resource.title as string, nodeType: 'resource', meta: { subtype: resource.type } });

  const { rows: mentions } = await query(
    `SELECT source_id, source_type FROM edges WHERE target_id=$1 AND relationship='mentions'`,
    [resourceId],
  ) as { rows: { source_id: string; source_type: string }[] };

  const taskIds = new Set<string>();

  for (const m of mentions) {
    if (m.source_type === 'note') {
      const { rows: noteRows } = await query('SELECT content, task_id FROM task_notes WHERE id=$1', [m.source_id]);
      if (!noteRows.length) continue;
      const note = noteRows[0] as Record<string, unknown>;
      const { rows: taskRows } = await query('SELECT id,title,completed,status,goal_id FROM tasks WHERE id=$1', [note.task_id]);
      if (!taskRows.length) continue;
      const task = taskRows[0] as Record<string, unknown>;
      addNode({ id: task.id as string, label: task.title as string, nodeType: 'task', meta: { completed: task.completed, status: task.status, goal_id: task.goal_id } });
      edges.push({ source: task.id as string, target: resourceId, rel: 'mentions' });
      taskIds.add(task.id as string);
    } else if (m.source_type === 'task') {
      const { rows: taskRows } = await query('SELECT id,title,completed,status,goal_id FROM tasks WHERE id=$1', [m.source_id]);
      if (!taskRows.length) continue;
      const task = taskRows[0] as Record<string, unknown>;
      addNode({ id: task.id as string, label: task.title as string, nodeType: 'task', meta: { completed: task.completed, status: task.status, goal_id: task.goal_id } });
      edges.push({ source: task.id as string, target: resourceId, rel: 'mentions' });
      taskIds.add(task.id as string);
    } else if (m.source_type === 'goal') {
      const { rows: goalRows } = await query('SELECT id,title FROM goals WHERE id=$1', [m.source_id]);
      if (!goalRows.length) continue;
      const goal = goalRows[0] as Record<string, unknown>;
      addNode({ id: goal.id as string, label: goal.title as string, nodeType: 'goal' });
      edges.push({ source: goal.id as string, target: resourceId, rel: 'mentions' });
    }
  }

  for (const taskId of taskIds) {
    const taskNode = nodes.find(n => n.id === taskId);
    const goalId = taskNode?.meta?.goal_id as string | undefined;
    if (!goalId) continue;
    const { rows: goalRows } = await query('SELECT id,title FROM goals WHERE id=$1', [goalId]);
    if (!goalRows.length) continue;
    const goal = goalRows[0] as Record<string, unknown>;
    addNode({ id: goal.id as string, label: goal.title as string, nodeType: 'goal' });
    if (!edges.find(e => e.source === goal.id && e.target === taskId))
      edges.push({ source: goal.id as string, target: taskId, rel: 'contains' });
  }

  res.json({ nodes, edges });
});

// GET /api/resources/:id/logs
router.get('/:id/logs', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM resource_logs WHERE resource_id=$1 ORDER BY created_at DESC',
    [req.params.id],
  );
  res.json(rows);
});

// POST /api/resources/:id/logs
router.post('/:id/logs', async (req, res) => {
  const { content, is_insight } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const id = crypto.randomUUID();
  await query(
    'INSERT INTO resource_logs (id,resource_id,content,is_insight,created_at) VALUES ($1,$2,$3,$4,$5)',
    [id, req.params.id, content.trim(), Boolean(is_insight), new Date().toISOString()],
  );
  res.json({ id });
});

// DELETE /api/resources/:id/logs/:logId
router.delete('/:id/logs/:logId', async (req, res) => {
  await query('DELETE FROM resource_logs WHERE id=$1 AND resource_id=$2', [req.params.logId, req.params.id]);
  res.json({ ok: true });
});

export { router as resourcesRouter };
