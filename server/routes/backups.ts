import { Router } from 'express';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { canUseLocalPersistence } from '../runtime.js';

const execFileAsync = promisify(execFile);
const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Project-root /backups — the same directory manual pg_dump backups live in.
export const BACKUPS_DIR = path.resolve(__dirname, '..', '..', 'backups');
const KEEP_LAST = Number(process.env.AMINA_BACKUP_KEEP ?? 14);

// pg_dump discovery: explicit env override, then known install paths (verified
// on disk), then bare 'pg_dump' only as a last resort (PATH may not have it).
function findPgDump(): string | null {
  if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) return process.env.PG_DUMP_PATH;
  for (const v of ['18', '17', '16', '15']) {
    const p = `C:\\Program Files\\PostgreSQL\\${v}\\bin\\pg_dump.exe`;
    if (fs.existsSync(p)) return p;
  }
  try {
    // Verify bare pg_dump actually resolves before trusting it
    execFileSync('pg_dump', ['--version'], { timeout: 5000, stdio: 'ignore' });
    return 'pg_dump';
  } catch {
    return null;
  }
}

function dbUrl(): string {
  return process.env.DATABASE_URL ?? 'postgresql://postgres:pgadmin@localhost:5433/marina';
}

const SAFE_NAME = /^[a-zA-Z0-9._-]+\.dump$/;

export async function createBackup(reason: string): Promise<{ file: string; bytes: number }> {
  if (!canUseLocalPersistence()) throw Object.assign(new Error('Local pg_dump backups are unavailable on Vercel; use managed database backups.'), { status: 409 });
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const pgDump = findPgDump();
  if (!pgDump) throw new Error('pg_dump not found — set PG_DUMP_PATH in .env');
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const file = `marina_${stamp}_${reason}.dump`;
  const full = path.join(BACKUPS_DIR, file);
  await execFileAsync(pgDump, ['-d', dbUrl(), '-F', 'c', '-f', full], { timeout: 120_000 });
  const bytes = fs.statSync(full).size;
  if (bytes < 1024) {
    fs.unlinkSync(full);
    throw new Error('Backup produced an implausibly small file — aborted and removed.');
  }
  return { file, bytes };
}

export function rotateBackups(): number {
  if (!canUseLocalPersistence()) return 0;
  if (!fs.existsSync(BACKUPS_DIR)) return 0;
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => SAFE_NAME.test(f))
    .map(f => ({ f, t: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  let removed = 0;
  for (const { f } of files.slice(KEEP_LAST)) {
    try { fs.unlinkSync(path.join(BACKUPS_DIR, f)); removed++; } catch { /* ignore */ }
  }
  return removed;
}

// GET /api/backups — list with sizes and dates, newest first
router.get('/', async (_req, res) => {
  if (!canUseLocalPersistence()) {
    return res.json({ available: false, reason: 'Use managed PostgreSQL backups on Vercel', backups: [] });
  }
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => SAFE_NAME.test(f))
    .map(f => {
      const st = fs.statSync(path.join(BACKUPS_DIR, f));
      return { name: f, bytes: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  res.json({
    dir: BACKUPS_DIR,
    keep_last: KEEP_LAST,
    pg_dump_available: Boolean(findPgDump()),
    backups: files,
  });
});

// POST /api/backups — create one now
router.post('/', async (_req, res) => {
  const result = await createBackup('manual');
  const rotated = rotateBackups();
  res.json({ ok: true, ...result, rotated });
});

// DELETE /api/backups/:name
router.delete('/:name', async (req, res) => {
  if (!canUseLocalPersistence()) return res.status(409).json({ error: 'Local backups are unavailable on Vercel' });
  const name = req.params.name;
  if (!SAFE_NAME.test(name)) return res.status(400).json({ error: 'invalid backup name' });
  const full = path.join(BACKUPS_DIR, name);
  if (!path.resolve(full).startsWith(BACKUPS_DIR)) return res.status(400).json({ error: 'invalid path' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'not found' });
  fs.unlinkSync(full);
  res.json({ ok: true });
});

// GET /api/backups/:name/download — stream the dump file
router.get('/:name/download', (req, res) => {
  if (!canUseLocalPersistence()) return res.status(409).json({ error: 'Local backups are unavailable on Vercel' });
  const name = req.params.name;
  if (!SAFE_NAME.test(name)) return res.status(400).json({ error: 'invalid backup name' });
  const full = path.join(BACKUPS_DIR, name);
  if (!path.resolve(full).startsWith(BACKUPS_DIR) || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'not found' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(full).pipe(res);
});

export { router as backupsRouter };
