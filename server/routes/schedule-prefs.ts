import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { localDateStr, localDateOffset } from '../utils/localDate.js';

const router = Router();

const DEFAULTS = {
  work_days: '[1,2,3,4,5]',
  work_start: 9.0,
  work_end: 18.0,
  daily_capacity_minutes: 480,
  deep_work_start: 9.0,
  deep_work_end: 12.0,
  buffer_ratio: 0.15,
  timezone: 'Asia/Beirut',
};

/** Called once at startup to guarantee the default row exists. Read-only path must not write. */
export async function ensureDefaultSchedulePrefs(): Promise<void> {
  await query(
    `INSERT INTO user_schedule_prefs (id,work_days,work_start,work_end,daily_capacity_minutes,deep_work_start,deep_work_end,buffer_ratio,timezone,updated_at)
     VALUES ('default',$1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
    [
      DEFAULTS.work_days,
      DEFAULTS.work_start,
      DEFAULTS.work_end,
      DEFAULTS.daily_capacity_minutes,
      DEFAULTS.deep_work_start,
      DEFAULTS.deep_work_end,
      DEFAULTS.buffer_ratio,
      DEFAULTS.timezone,
      new Date().toISOString(),
    ],
  );
}

// GET /api/schedule-prefs — read-only
router.get('/', async (_req, res) => {
  const { rows } = await query("SELECT * FROM user_schedule_prefs WHERE id='default'");
  if (!rows[0]) {
    // Row doesn't exist yet (startup ensureRow not called or migration pending) — return defaults
    return res.json({ id: 'default', ...DEFAULTS, updated_at: null });
  }
  res.json(rows[0]);
});

// PUT /api/schedule-prefs — merges provided fields with existing row; unspecified fields are preserved
router.put('/', async (req, res) => {
  const now = new Date().toISOString();
  const body = req.body as Record<string, unknown>;

  // Validate IANA timezone if provided
  if (body.timezone !== undefined) {
    try { Intl.DateTimeFormat(undefined, { timeZone: String(body.timezone) }); }
    catch { return res.status(400).json({ error: 'Invalid IANA timezone name' }); }
  }

  // Validate work_days: must be an array of unique integers 1–7
  if (body.work_days !== undefined) {
    let days: unknown;
    try { days = typeof body.work_days === 'string' ? JSON.parse(body.work_days) : body.work_days; }
    catch { return res.status(400).json({ error: 'work_days must be a JSON array of integers 1–7' }); }
    if (!Array.isArray(days) || days.some(d => !Number.isInteger(d) || d < 1 || d > 7)) {
      return res.status(400).json({ error: 'work_days must contain integers between 1 (Mon) and 7 (Sun)' });
    }
    if (new Set(days).size !== (days as number[]).length) {
      return res.status(400).json({ error: 'work_days must not contain duplicate values' });
    }
  }

  // Validate work/deep-work bounds: start < end, both 0–24.
  // Read current row first so cross-field constraints work when only one side is specified.
  const { rows: currentRows } = await query("SELECT * FROM user_schedule_prefs WHERE id='default'");
  const cur = (currentRows[0] ?? {}) as Record<string, unknown>;

  const ws = body.work_start !== undefined ? Number(body.work_start) : undefined;
  const we = body.work_end !== undefined ? Number(body.work_end) : undefined;
  const ds = body.deep_work_start !== undefined ? Number(body.deep_work_start) : undefined;
  const de = body.deep_work_end !== undefined ? Number(body.deep_work_end) : undefined;
  if (ws !== undefined && (isNaN(ws) || ws < 0 || ws >= 24)) return res.status(400).json({ error: 'work_start must be 0–24' });
  if (we !== undefined && (isNaN(we) || we <= 0 || we > 24)) return res.status(400).json({ error: 'work_end must be 0–24' });
  // Cross-field: compare against the stored value when only one side is provided
  const effectiveWs = ws ?? Number(cur.work_start ?? DEFAULTS.work_start);
  const effectiveWe = we ?? Number(cur.work_end ?? DEFAULTS.work_end);
  if (effectiveWs >= effectiveWe) return res.status(400).json({ error: 'work_start must be before work_end' });
  if (ds !== undefined && (isNaN(ds) || ds < 0 || ds >= 24)) return res.status(400).json({ error: 'deep_work_start must be 0–24' });
  if (de !== undefined && (isNaN(de) || de <= 0 || de > 24)) return res.status(400).json({ error: 'deep_work_end must be 0–24' });
  const effectiveDs = ds ?? Number(cur.deep_work_start ?? DEFAULTS.deep_work_start);
  const effectiveDe = de ?? Number(cur.deep_work_end ?? DEFAULTS.deep_work_end);
  if (effectiveDs >= effectiveDe) return res.status(400).json({ error: 'deep_work_start must be before deep_work_end' });

  // Validate buffer_ratio: 0–0.9
  if (body.buffer_ratio !== undefined) {
    const br = Number(body.buffer_ratio);
    if (isNaN(br) || br < 0 || br > 0.9) return res.status(400).json({ error: 'buffer_ratio must be between 0 and 0.9' });
  }

  // Validate daily_capacity_minutes: positive integer ≤ 1440
  if (body.daily_capacity_minutes !== undefined) {
    const cap = Number(body.daily_capacity_minutes);
    if (!Number.isInteger(cap) || cap <= 0 || cap > 1440) {
      return res.status(400).json({ error: 'daily_capacity_minutes must be a positive integer ≤ 1440' });
    }
  }

  // Use the current row we already fetched for validation
  const current = cur;

  const merged = {
    work_days:              body.work_days              ?? current.work_days              ?? DEFAULTS.work_days,
    work_start:             body.work_start             ?? current.work_start             ?? DEFAULTS.work_start,
    work_end:               body.work_end               ?? current.work_end               ?? DEFAULTS.work_end,
    daily_capacity_minutes: body.daily_capacity_minutes ?? current.daily_capacity_minutes ?? DEFAULTS.daily_capacity_minutes,
    deep_work_start:        body.deep_work_start        ?? current.deep_work_start        ?? DEFAULTS.deep_work_start,
    deep_work_end:          body.deep_work_end          ?? current.deep_work_end          ?? DEFAULTS.deep_work_end,
    buffer_ratio:           body.buffer_ratio           ?? current.buffer_ratio           ?? DEFAULTS.buffer_ratio,
    timezone:               body.timezone               ?? current.timezone               ?? DEFAULTS.timezone,
  };

  await query(
    `INSERT INTO user_schedule_prefs (id,work_days,work_start,work_end,daily_capacity_minutes,deep_work_start,deep_work_end,buffer_ratio,timezone,updated_at)
     VALUES ('default',$1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       work_days=$1, work_start=$2, work_end=$3,
       daily_capacity_minutes=$4, deep_work_start=$5, deep_work_end=$6,
       buffer_ratio=$7, timezone=$8, updated_at=$9`,
    [
      merged.work_days, merged.work_start, merged.work_end,
      merged.daily_capacity_minutes, merged.deep_work_start, merged.deep_work_end,
      merged.buffer_ratio, merged.timezone, now,
    ],
  );
  res.json({ ok: true });
});

// ── Schedule day overrides ────────────────────────────────────────────────────

// GET /api/schedule-prefs/overrides?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/overrides', async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  if (from && to) {
    const { rows } = await query(
      `SELECT * FROM schedule_day_overrides WHERE date BETWEEN $1 AND $2 ORDER BY date ASC`,
      [from, to],
    );
    return res.json(rows);
  }
  // Default: next 60 days (use stored timezone so "today" matches the user's wall clock)
  const { rows: prefRows } = await query("SELECT timezone FROM user_schedule_prefs WHERE id='default'");
  const tz = (prefRows[0] as Record<string, unknown>)?.timezone as string | undefined;
  const today = localDateStr(tz);
  const later = localDateOffset(60, tz);
  const { rows } = await query(
    `SELECT * FROM schedule_day_overrides WHERE date BETWEEN $1 AND $2 ORDER BY date ASC`,
    [today, later],
  );
  res.json(rows);
});

// PUT /api/schedule-prefs/overrides/:date — upsert an override for a specific date
router.put('/overrides/:date', async (req, res) => {
  const { date } = req.params;
  // Validate ISO date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  }
  const { available_minutes, note, unavailable_blocks } = req.body as Record<string, unknown>;

  if (available_minutes !== undefined && available_minutes !== null) {
    const m = Number(available_minutes);
    if (!Number.isInteger(m) || m < 0 || m > 1440) {
      return res.status(400).json({ error: 'available_minutes must be an integer 0-1440' });
    }
  }

  if (unavailable_blocks !== undefined) {
    if (!Array.isArray(unavailable_blocks)) {
      return res.status(400).json({ error: 'unavailable_blocks must be an array' });
    }
  }

  const now = new Date().toISOString();
  await query(
    `INSERT INTO schedule_day_overrides (id, date, available_minutes, unavailable_blocks, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (date) DO UPDATE SET
       available_minutes = EXCLUDED.available_minutes,
       unavailable_blocks = EXCLUDED.unavailable_blocks,
       note = EXCLUDED.note`,
    [
      crypto.randomUUID(),
      date,
      available_minutes ?? null,
      JSON.stringify(unavailable_blocks ?? []),
      (note as string | undefined) ?? null,
      now,
    ],
  );
  res.json({ ok: true, date });
});

// DELETE /api/schedule-prefs/overrides/:date — remove an override
router.delete('/overrides/:date', async (req, res) => {
  const { date } = req.params;
  await query('DELETE FROM schedule_day_overrides WHERE date=$1', [date]);
  res.json({ ok: true });
});

export { router as schedulePrefsRouter };
