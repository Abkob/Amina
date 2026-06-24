import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'marina.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Safe',
    progress REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    overdue INTEGER NOT NULL DEFAULT 0,
    activity_level INTEGER NOT NULL DEFAULT 1,
    archived_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    goal_id TEXT,
    parent_task_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    kind TEXT NOT NULL DEFAULT 'manual',
    critical_path_status TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    due_date TEXT,
    estimated_duration TEXT,
    estimated_minutes INTEGER,
    weight_percent REAL,
    completed INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_notes (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS task_note_files (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'capture',
    date_str TEXT NOT NULL DEFAULT '',
    suggested_action_text TEXT,
    suggested_action_applied INTEGER NOT NULL DEFAULT 0,
    suggested_action_ignored INTEGER NOT NULL DEFAULT 0,
    extracted_tasks_json TEXT NOT NULL DEFAULT '[]',
    relevant_docs_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    url TEXT,
    type TEXT NOT NULL DEFAULT 'link',
    info TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    day_index INTEGER NOT NULL,
    start_hour REAL NOT NULL,
    duration_hours REAL NOT NULL,
    time_str TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    week_start TEXT,
    connected_resource_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS daily_scores (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    score REAL NOT NULL DEFAULT 0,
    mood INTEGER NOT NULL DEFAULT 3,
    energy INTEGER NOT NULL DEFAULT 3,
    focus INTEGER NOT NULL DEFAULT 3,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    relationship TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6B7280'
  );

  CREATE TABLE IF NOT EXISTS entity_tags (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    tag_id TEXT NOT NULL
  );
`);

export function rowToGoal(row: Record<string, unknown>) {
  return { ...row, overdue: Boolean(row.overdue) };
}

export function rowToTask(row: Record<string, unknown>) {
  return { ...row, completed: Boolean(row.completed) };
}
