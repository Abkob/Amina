/**
 * migrate.ts — One-time migration from marina.db (SQLite) to PostgreSQL
 *
 * Usage:
 *   npx tsx server/migrate.ts
 *
 * Prerequisites:
 *   1. PostgreSQL running with DATABASE_URL set in .env
 *   2. marina.db present in the project root
 *   3. Schema already applied: npx tsx server/schema-init.ts
 *      (or the server started once so initSchema() ran)
 */

import 'dotenv/config';
import SQLite from 'better-sqlite3';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.join(__dirname, '..', 'marina.db');
if (!fs.existsSync(DB_PATH)) {
  console.error(`[migrate] marina.db not found at ${DB_PATH}`);
  process.exit(1);
}

const sqlite = new SQLite(DB_PATH, { readonly: true });
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:pgadmin@localhost:5433/marina',
});

// Converts SQLite INTEGER 0/1 → PostgreSQL boolean
function bool(v: unknown): boolean {
  return Boolean(v);
}

// Each table: read all rows from SQLite and upsert into PostgreSQL
// ON CONFLICT DO NOTHING means this is safe to re-run

const tables: {
  name: string;
  columns: string[];
  transform?: (row: Record<string, unknown>) => Record<string, unknown>;
}[] = [
  {
    name: 'goals',
    columns: ['id','title','description','category','status','progress','deadline','overdue','activity_level','archived_at','created_at','updated_at'],
    transform: r => ({ ...r, overdue: bool(r.overdue) }),
  },
  {
    name: 'tasks',
    columns: ['id','goal_id','parent_task_id','milestone_id','deadline_id','title','description','status','priority','kind','critical_path_status','tags_json','due_date','start_date','estimated_duration','estimated_minutes','actual_minutes','weight_percent','completed','position','last_activity_at','completion_note','created_at','updated_at'],
    transform: r => ({ ...r, completed: bool(r.completed), completion_note: r.completion_note ?? '' }),
  },
  {
    name: 'goal_deadlines',
    columns: ['id','goal_id','title','date','color','created_at'],
  },
  {
    name: 'goal_milestones',
    columns: ['id','goal_id','title','description','due_date','color','position','completed','created_at','updated_at'],
    transform: r => ({ ...r, completed: bool(r.completed) }),
  },
  {
    name: 'meetings',
    columns: ['id','goal_id','title','scheduled_at','location','notes','created_at'],
    transform: r => ({ ...r, updated_at: r.created_at }),
  },
  {
    name: 'events',
    columns: ['id','title','type','day_index','start_hour','duration_hours','time_str','description','week_start','connected_resource_json','created_at','updated_at'],
  },
  {
    name: 'event_task_links',
    columns: ['id','event_id','task_id','created_at'],
  },
  {
    name: 'work_sessions',
    columns: ['id','task_id','started_at','ended_at','minutes','notes','source','created_at'],
  },
  {
    name: 'task_notes',
    columns: ['id','task_id','content','created_at'],
  },
  {
    name: 'task_note_files',
    columns: ['id','note_id','name','mime_type','size','file_path','created_at'],
  },
  {
    name: 'notes',
    columns: ['id','title','content','type','date_str','suggested_action_text','suggested_action_applied','suggested_action_ignored','extracted_tasks_json','relevant_docs_json','created_at','updated_at'],
    transform: r => ({
      ...r,
      suggested_action_applied: bool(r.suggested_action_applied),
      suggested_action_ignored: bool(r.suggested_action_ignored),
    }),
  },
  {
    name: 'resources',
    columns: ['id','title','url','type','info','read_state','next_action','tags_json','created_at'],
    transform: r => ({
      ...r,
      read_state:  r.read_state  ?? 'Unread',
      next_action: r.next_action ?? '',
      tags_json:   r.tags_json   ?? '[]',
      updated_at:  r.created_at,
    }),
  },
  {
    name: 'resource_logs',
    columns: ['id','resource_id','content','is_insight','created_at'],
    transform: r => ({ ...r, is_insight: bool(r.is_insight) }),
  },
  {
    name: 'edges',
    columns: ['id','source_id','source_type','target_id','target_type','relationship','metadata','created_at'],
    transform: r => ({ ...r, created_by: 'manual' }),
  },
  {
    name: 'tags',
    columns: ['id','name','color'],
  },
  {
    name: 'entity_tags',
    columns: ['id','entity_id','entity_type','tag_id'],
  },
  {
    name: 'daily_scores',
    columns: ['id','date','score','mood','energy','focus','tasks_completed','notes','created_at'],
  },
  {
    name: 'user_schedule_prefs',
    columns: ['id','work_days','work_start','work_end','daily_capacity_minutes','deep_work_start','deep_work_end','updated_at'],
  },
];

async function migrateTable(
  client: pg.PoolClient,
  def: (typeof tables)[number],
) {
  let sqliteRows: Record<string, unknown>[];
  try {
    sqliteRows = sqlite.prepare(`SELECT * FROM ${def.name}`).all() as Record<string, unknown>[];
  } catch {
    console.log(`  [skip] ${def.name} — not found in SQLite`);
    return 0;
  }

  if (!sqliteRows.length) {
    console.log(`  [skip] ${def.name} — empty`);
    return 0;
  }

  let inserted = 0;
  for (const raw of sqliteRows) {
    const row = def.transform ? def.transform(raw) : raw;

    // Build INSERT ... ON CONFLICT DO NOTHING using the table's defined columns
    const cols = def.columns.filter(c => row[c] !== undefined || c === 'updated_at');
    const values = cols.map(c => row[c] ?? null);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

    await client.query(
      `INSERT INTO ${def.name} (${cols.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
      values,
    );
    inserted++;
  }

  console.log(`  [ok]   ${def.name} — ${inserted}/${sqliteRows.length} rows`);
  return inserted;
}

async function main() {
  console.log('[migrate] Connecting to PostgreSQL...');
  const client = await pgPool.connect();

  try {
    await client.query('BEGIN');
    console.log('[migrate] Starting migration from marina.db → PostgreSQL\n');

    for (const def of tables) {
      await migrateTable(client, def);
    }

    await client.query('COMMIT');
    console.log('\n[migrate] Done. All data migrated successfully.');
    console.log('[migrate] You can now start the server: npm run dev');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[migrate] Error — rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
    sqlite.close();
  }
}

main();
