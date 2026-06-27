import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from '../db.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dir, '..', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const _storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage: _storage, limits: { fileSize: 50 * 1024 * 1024 } });

function typeFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return 'document';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'document';
  if (ext === 'fig') return 'figma';
  return 'other';
}

const router = Router();

// ── Collection ────────────────────────────────────────────────────────────────

// GET /api/resources?goal_id=...  or  ?task_id=...  or bare (all)
router.get('/', (req, res) => {
  const { goal_id, task_id } = req.query;
  if (goal_id) {
    const rows = db.prepare(`
      SELECT r.* FROM resources r
      JOIN edges e ON e.source_id = r.id AND e.relationship = 'attached_to' AND e.target_id = ?
    `).all(goal_id as string);
    return res.json(rows);
  }
  if (task_id) {
    const rows = db.prepare(`
      SELECT r.* FROM resources r
      JOIN edges e ON e.source_id = r.id AND e.relationship = 'attached_to' AND e.target_id = ?
    `).all(task_id as string);
    return res.json(rows);
  }
  res.json(db.prepare('SELECT * FROM resources ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const r = { id, created_at: now, ...req.body };
  db.prepare('INSERT INTO resources (id,title,url,type,info,created_at) VALUES (@id,@title,@url,@type,@info,@created_at)').run(r);

  if (req.body.attach_to_id) {
    db.prepare('INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(crypto.randomUUID(), id, 'resource', req.body.attach_to_id, req.body.attach_to_type ?? 'goal', 'attached_to', null, now);
  }
  res.json({ id });
});

// ── @mention edges ────────────────────────────────────────────────────────────

// GET /api/resources/mentions?source_id=X&source_type=note
// GET /api/resources/mentions?resource_id=X  (backlinks list)
router.get('/mentions', (req, res) => {
  const { source_id, source_type, resource_id } = req.query as Record<string, string>;
  if (source_id && source_type) {
    const rows = db.prepare(`
      SELECT r.*, e.id as edge_id FROM resources r
      JOIN edges e ON e.target_id = r.id AND e.relationship = 'mentions'
      WHERE e.source_id = ? AND e.source_type = ?
      ORDER BY e.created_at ASC
    `).all(source_id, source_type);
    return res.json(rows);
  }
  if (resource_id) {
    const rows = db.prepare(`
      SELECT e.source_id, e.source_type, e.created_at, e.id as edge_id FROM edges e
      WHERE e.target_id = ? AND e.relationship = 'mentions'
      ORDER BY e.created_at DESC
    `).all(resource_id);
    return res.json(rows);
  }
  res.status(400).json({ error: 'provide source_id+source_type or resource_id' });
});

// POST /api/resources/mentions
router.post('/mentions', (req, res) => {
  const { source_id, source_type, resource_id } = req.body;
  if (!source_id || !source_type || !resource_id) return res.status(400).json({ error: 'missing fields' });
  const existing = (db.prepare(`
    SELECT id FROM edges WHERE source_id=? AND source_type=? AND target_id=? AND relationship='mentions'
  `).get(source_id, source_type, resource_id)) as { id: string } | undefined;
  if (existing) return res.json({ id: existing.id });
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at)
    VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, source_id, source_type, resource_id, 'resource', 'mentions', null, new Date().toISOString());
  res.json({ id });
});

// DELETE /api/resources/mentions/:edgeId
router.delete('/mentions/:edgeId', (req, res) => {
  db.prepare("DELETE FROM edges WHERE id = ? AND relationship = 'mentions'").run(req.params.edgeId);
  res.json({ ok: true });
});

// ── File upload ───────────────────────────────────────────────────────────────

// POST /api/resources/upload  — multipart/form-data with field "file"
router.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });
  const now  = new Date().toISOString();
  const id   = crypto.randomUUID();
  const base = path.basename(file.originalname, path.extname(file.originalname));
  const url  = `/api/resources/serve/${file.filename}`;
  const type = typeFromFilename(file.originalname);
  db.prepare('INSERT INTO resources (id,title,url,type,info,created_at) VALUES (?,?,?,?,?,?)')
    .run(id, base, url, type, `Uploaded ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`, now);
  res.json({ id });
});

// GET /api/resources/serve/:filename  — stream uploaded resource file
router.get('/serve/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

// ── Single resource ───────────────────────────────────────────────────────────

// GET /api/resources/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

// PATCH /api/resources/:id  — update any subset of fields
const VALID_READ_STATES = new Set(['Unread', 'Reading', 'Done', 'Shelved']);

router.patch('/:id', (req, res) => {
  const { title, type, url, info, read_state, next_action, tags_json } = req.body;

  // Validate read_state
  if (read_state !== undefined && !VALID_READ_STATES.has(read_state)) {
    return res.status(400).json({ error: `Invalid read_state. Must be one of: ${[...VALID_READ_STATES].join(', ')}` });
  }
  // Validate tags_json is parseable JSON array
  if (tags_json !== undefined) {
    try {
      const parsed = JSON.parse(tags_json);
      if (!Array.isArray(parsed)) throw new Error();
    } catch {
      return res.status(400).json({ error: 'tags_json must be a JSON array string' });
    }
  }

  const fields: string[] = [];
  const vals: unknown[] = [];
  if (title       !== undefined) { fields.push('title = ?');       vals.push(title);       }
  if (type        !== undefined) { fields.push('type = ?');         vals.push(type);        }
  if (url         !== undefined) { fields.push('url = ?');          vals.push(url);         }
  if (info        !== undefined) { fields.push('info = ?');         vals.push(info);        }
  if (read_state  !== undefined) { fields.push('read_state = ?');   vals.push(read_state);  }
  if (next_action !== undefined) { fields.push('next_action = ?');  vals.push(next_action); }
  if (tags_json   !== undefined) { fields.push('tags_json = ?');    vals.push(tags_json);   }

  if (!fields.length) return res.json({ ok: true });
  vals.push(req.params.id);
  db.prepare(`UPDATE resources SET ${fields.join(', ')} WHERE id = ?`).run(...vals as []);
  res.json({ ok: true });
});

// DELETE /api/resources/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM resource_logs WHERE resource_id = ?').run(req.params.id);
  db.prepare('DELETE FROM resources WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Resource profile: enriched references ─────────────────────────────────────

// GET /api/resources/:id/references
// Returns every mention edge enriched with source title + content snippet
router.get('/:id/references', (req, res) => {
  const raw = db.prepare(`
    SELECT e.id as edge_id, e.source_id, e.source_type, e.created_at
    FROM edges e
    WHERE e.target_id = ? AND e.relationship = 'mentions'
    ORDER BY e.created_at DESC
  `).all(req.params.id) as { edge_id: string; source_id: string; source_type: string; created_at: string }[];

  const enriched = raw.map(row => {
    let source_title: string | null = null;
    let source_content: string | null = null;
    let parent_title: string | null = null;

    if (row.source_type === 'note') {
      const note = db.prepare('SELECT content, task_id FROM task_notes WHERE id = ?').get(row.source_id) as
        { content: string; task_id: string } | undefined;
      if (note) {
        source_content = note.content.slice(0, 200);
        const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(note.task_id) as { title: string } | undefined;
        if (task) parent_title = task.title;
      }
      source_title = 'Journal entry';
    } else if (row.source_type === 'task') {
      const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(row.source_id) as { title: string } | undefined;
      source_title = task?.title ?? null;
    } else if (row.source_type === 'goal') {
      const goal = db.prepare('SELECT title FROM goals WHERE id = ?').get(row.source_id) as { title: string } | undefined;
      source_title = goal?.title ?? null;
    } else if (row.source_type === 'braindump') {
      const note = db.prepare('SELECT title FROM notes WHERE id = ?').get(row.source_id) as { title: string } | undefined;
      source_title = note?.title ?? 'Brain dump';
    }

    return { ...row, source_title, source_content, parent_title };
  });

  res.json(enriched);
});

// ── Resource stats rollup ────────────────────────────────────────────────────

// GET /api/resources/:id/stats
router.get('/:id/stats', (req, res) => {
  const resourceId = req.params.id;

  // All task IDs that directly or indirectly (via journal note) @mentioned this resource
  const directTaskMentions = db.prepare(`
    SELECT source_id as task_id FROM edges
    WHERE target_id = ? AND relationship = 'mentions' AND source_type = 'task'
  `).all(resourceId) as { task_id: string }[];

  const noteTaskMentions = db.prepare(`
    SELECT tn.task_id FROM edges e
    JOIN task_notes tn ON tn.id = e.source_id
    WHERE e.target_id = ? AND e.relationship = 'mentions' AND e.source_type = 'note'
  `).all(resourceId) as { task_id: string }[];

  // Deduplicate task ids so actual_minutes is not double-counted
  const taskIds = Array.from(new Set([
    ...directTaskMentions.map(r => r.task_id),
    ...noteTaskMentions.map(r => r.task_id),
  ]));

  let total_minutes = 0;
  const goalIds = new Set<string>();

  for (const taskId of taskIds) {
    const task = db.prepare('SELECT actual_minutes, goal_id FROM tasks WHERE id = ?')
      .get(taskId) as { actual_minutes: number | null; goal_id: string | null } | undefined;
    if (task) {
      total_minutes += task.actual_minutes ?? 0;
      if (task.goal_id) goalIds.add(task.goal_id);
    }
  }

  // Total @mention edges (all source types)
  const reference_count = (db.prepare(`
    SELECT COUNT(*) as n FROM edges WHERE target_id = ? AND relationship = 'mentions'
  `).get(resourceId) as { n: number }).n;

  // Most recent activity: last log or last mention edge, whichever is newer
  const lastLog = db.prepare(
    'SELECT created_at FROM resource_logs WHERE resource_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(resourceId) as { created_at: string } | undefined;
  const lastRef = db.prepare(`
    SELECT created_at FROM edges WHERE target_id = ? AND relationship = 'mentions'
    ORDER BY created_at DESC LIMIT 1
  `).get(resourceId) as { created_at: string } | undefined;

  const dates = [lastLog?.created_at, lastRef?.created_at].filter(Boolean) as string[];
  const last_engaged = dates.length ? dates.sort().reverse()[0] : null;

  res.json({
    total_minutes,
    reference_count,
    goals_count: goalIds.size,
    last_engaged,
  });
});

// ── Resource connection graph ─────────────────────────────────────────────────

// GET /api/resources/:id/graph
// Returns nodes + edges for a Graphology network centred on this resource
router.get('/:id/graph', (req, res) => {
  const resourceId = req.params.id;
  const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceId) as
    { id: string; title: string; type: string } | undefined;
  if (!resource) return res.status(404).end();

  type GNode = { id: string; label: string; nodeType: string; meta?: Record<string, unknown> };
  type GEdge = { source: string; target: string; rel: string };

  const nodes: GNode[]  = [];
  const edges: GEdge[]  = [];
  const seen = new Set<string>();

  const addNode = (n: GNode) => { if (!seen.has(n.id)) { nodes.push(n); seen.add(n.id); } };

  // Centre: the resource itself
  addNode({ id: resourceId, label: resource.title, nodeType: 'resource', meta: { subtype: resource.type } });

  // All mention edges → this resource
  const mentions = db.prepare(`
    SELECT source_id, source_type FROM edges WHERE target_id = ? AND relationship = 'mentions'
  `).all(resourceId) as { source_id: string; source_type: string }[];

  const taskIds = new Set<string>(); // tasks directly or via note → used to find goals + co-cites

  for (const m of mentions) {
    if (m.source_type === 'note') {
      const note = db.prepare('SELECT content, task_id FROM task_notes WHERE id = ?')
        .get(m.source_id) as { content: string; task_id: string } | undefined;
      if (!note) continue;

      const task = db.prepare('SELECT id, title, completed, status, goal_id FROM tasks WHERE id = ?')
        .get(note.task_id) as { id: string; title: string; completed: number; status: string; goal_id: string } | undefined;
      if (!task) continue;

      addNode({ id: task.id, label: task.title, nodeType: 'task',
        meta: { completed: !!task.completed, status: task.status, goal_id: task.goal_id } });
      edges.push({ source: task.id, target: resourceId, rel: 'mentions' });
      taskIds.add(task.id);

    } else if (m.source_type === 'task') {
      const task = db.prepare('SELECT id, title, completed, status, goal_id FROM tasks WHERE id = ?')
        .get(m.source_id) as { id: string; title: string; completed: number; status: string; goal_id: string } | undefined;
      if (!task) continue;
      addNode({ id: task.id, label: task.title, nodeType: 'task',
        meta: { completed: !!task.completed, status: task.status, goal_id: task.goal_id } });
      edges.push({ source: task.id, target: resourceId, rel: 'mentions' });
      taskIds.add(task.id);

    } else if (m.source_type === 'goal') {
      const goal = db.prepare('SELECT id, title FROM goals WHERE id = ?')
        .get(m.source_id) as { id: string; title: string } | undefined;
      if (!goal) continue;
      addNode({ id: goal.id, label: goal.title, nodeType: 'goal' });
      edges.push({ source: goal.id, target: resourceId, rel: 'mentions' });
    }
  }

  // For each task: attach its parent goal
  for (const taskId of taskIds) {
    const task = nodes.find(n => n.id === taskId);
    const goalId = task?.meta?.goal_id as string | undefined;
    if (!goalId) continue;
    const goal = db.prepare('SELECT id, title FROM goals WHERE id = ?')
      .get(goalId) as { id: string; title: string } | undefined;
    if (!goal) continue;
    addNode({ id: goal.id, label: goal.title, nodeType: 'goal' });
    if (!edges.find(e => e.source === goal.id && e.target === taskId))
      edges.push({ source: goal.id, target: taskId, rel: 'contains' });
  }

  // Co-cited resources: other resources also @mentioned in those same tasks/notes
  if (taskIds.size > 0) {
    const placeholders = Array.from(taskIds).map(() => '?').join(',');
    // Find note ids belonging to those tasks
    const noteIds = (db.prepare(`SELECT id FROM task_notes WHERE task_id IN (${placeholders})`)
      .all(...Array.from(taskIds)) as { id: string }[]).map(r => r.id);

    const allSourceIds = [...Array.from(taskIds), ...noteIds];
    if (allSourceIds.length > 0) {
      const ph2 = allSourceIds.map(() => '?').join(',');
      const coCites = db.prepare(`
        SELECT DISTINCT r.id, r.title, r.type FROM resources r
        JOIN edges e ON e.target_id = r.id AND e.relationship = 'mentions'
        WHERE e.source_id IN (${ph2}) AND r.id != ?
      `).all(...allSourceIds, resourceId) as { id: string; title: string; type: string }[];

      for (const co of coCites) {
        addNode({ id: co.id, label: co.title, nodeType: 'resource', meta: { subtype: co.type } });
        // Connect via shared tasks — find the overlap
        for (const taskId of taskIds) {
          const shares = db.prepare(`
            SELECT 1 FROM edges WHERE target_id = ? AND relationship = 'mentions'
            AND source_id IN (SELECT id FROM task_notes WHERE task_id = ? UNION SELECT ?)
          `).get(co.id, taskId, taskId);
          if (shares) {
            edges.push({ source: taskId, target: co.id, rel: 'co_cited' });
            break; // one edge per co-cited resource is enough
          }
        }
      }
    }
  }

  res.json({ nodes, edges });
});

// ── Resource log entries ──────────────────────────────────────────────────────

// GET /api/resources/:id/logs
router.get('/:id/logs', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM resource_logs WHERE resource_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(rows);
});

// POST /api/resources/:id/logs
router.post('/:id/logs', (req, res) => {
  const { content, is_insight } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'content required' });
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO resource_logs (id, resource_id, content, is_insight, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, content.trim(), is_insight ? 1 : 0, new Date().toISOString());
  res.json({ id });
});

// DELETE /api/resources/:id/logs/:logId
router.delete('/:id/logs/:logId', (req, res) => {
  db.prepare('DELETE FROM resource_logs WHERE id = ? AND resource_id = ?').run(req.params.logId, req.params.id);
  res.json({ ok: true });
});

export { router as resourcesRouter };
