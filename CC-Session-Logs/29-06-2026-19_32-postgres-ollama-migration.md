# Session Log: 29-06-2026 19:32 - postgres-ollama-migration

## Quick Reference (for AI scanning)
**Confidence keywords:** PostgreSQL, pgvector, pg, better-sqlite3-removed, Ollama, qwen2.5:72b, nomic-embed-text, async-routes, schema.sql, migrate.ts, journal-ingestion, embeddings, hybrid-architecture, vector-768, HNSW, ON-CONFLICT-DO-NOTHING, initSchema, buildUpdate, transaction-helper, seedIfEmpty-async
**Projects:** Amina OS (personal goal/task/project management app)
**Outcome:** Migrated entire backend from SQLite (better-sqlite3, synchronous) to PostgreSQL + pgvector. Replaced Gemini with Ollama (qwen2.5:72b for reasoning, nomic-embed-text for embeddings). Added 10 new DB tables including journal_entries with LLM ingestion pipeline and vector embeddings with HNSW search. All 14 routes rewritten async. Zero TypeScript errors.

---

## Architecture Decision (Final)

The system is now a **4-layer hybrid**:
```
1. PostgreSQL — structured truth (goals, tasks, milestones, meetings, events, resources, journal)
2. Graph edges table — explicit relationships (task blocks task, resource attached_to goal, etc.)
3. Vector embeddings (pgvector) — semantic memory (nomic-embed-text, 768-dim, HNSW cosine search)
4. Ollama LLM — reasoning/planning only, receives compressed context NOT raw DB dumps
```

**Key rule:**
- Dates, hours, status, progress → SQL
- Relationships → edges table
- Meaning, fuzzy search, memory → pgvector embeddings
- AI prompt → compressed structured summaries only

**Model choices:**
- Reasoning: `qwen2.5:72b` via Ollama (cloud GPU box — user confirmed 24GB+ VRAM available)
- Embeddings: `nomic-embed-text` via Ollama (768-dim, runs on CPU, private, local-first)
- NO OpenAI, NO Google Gemini — 100% offline/local

---

## What Was Built This Session

### Files CREATED (new):
- `server/schema.sql` — Clean PostgreSQL DDL, single source of truth, 22 tables, all indexes including `embeddings_hnsw_idx USING hnsw (embedding vector_cosine_ops)`
- `server/db.ts` — Rewritten: pg Pool, `query()` helper, `transaction()` helper, `buildUpdate()` for dynamic UPDATE, `sanitize()`. Exports `initSchema()` which runs schema.sql on startup.
- `server/ollama.ts` — `chat()`, `embed()`, `embedBatch()`, `parseJSON()`, `ollamaHealth()`. Reads `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL` from env.
- `server/migrate.ts` — One-time SQLite→PostgreSQL migration. Run with `npm run migrate`. Reads marina.db, inserts all rows via `ON CONFLICT DO NOTHING`. Safe to re-run.
- `server/routes/journal.ts` — Full journal system: CRUD + LLM ingestion pipeline. On POST, immediately saves entry then runs `ingestJournalEntry()` in background. Ingestion uses Ollama to extract: summary, mood, energy, tags, journal_links, extracted_facts, work_sessions, entity_aliases.
- `server/routes/embeddings.ts` — `POST /embed` (single entity on demand), `POST /search` (HNSW cosine similarity), `POST /process-jobs` (batch job processor), `GET /stats`. `embedEntity()` is exported for use by other routes.

### Files REWRITTEN (SQLite sync → PostgreSQL async):
- `server/routes/goals.ts` — `syncGoalMetrics()` is now async, exported
- `server/routes/tasks.ts` — Full rewrite, all cascade logic preserved
- `server/routes/resources.ts` — Full rewrite including graph + stats + references endpoints
- `server/routes/notes.ts` — Simple CRUD rewrite
- `server/routes/events.ts` — Simple CRUD rewrite
- `server/routes/edges.ts` — Simple CRUD + `ON CONFLICT DO NOTHING`
- `server/routes/meetings.ts` — Added `milestone_id`, `duration_minutes`, `summary` fields
- `server/routes/deadlines.ts` — Full rewrite
- `server/routes/milestones.ts` — Full rewrite
- `server/routes/schedule-prefs.ts` — Added `buffer_ratio` field
- `server/routes/work-sessions.ts` — Added `resource_id`, `goal_id` fields
- `server/routes/event-task-links.ts` — Added `planned_minutes` field
- `server/routes/files.ts` — Simple rewrite
- `server/routes/ai.ts` — **Major rewrite**: Gemini removed, Ollama `chat()` used, `getScheduleContext()` is now async, added `recent_journal` to context (last 7 days), added buffer_ratio to capacity math, added `GET /health` endpoint
- `server/seed.ts` — Full async rewrite using `pool.connect()` + `BEGIN/COMMIT`, `ON CONFLICT DO NOTHING`
- `server/index.ts` — Now calls `await initSchema()` + `await seedIfEmpty()` in async `start()` before `app.listen()`

### Files UPDATED:
- `package.json` — Added `pg ^8.22.0`, `ollama ^0.5.18`, `@types/pg`, `"migrate": "tsx server/migrate.ts"` script. Removed `@google/genai`. `better-sqlite3` kept for migrate.ts.
- `.env.example` — Replaced GEMINI_API_KEY with `DATABASE_URL`, `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_EMBED_MODEL`
- `src/db/schema.ts` — Added TypeScript interfaces for all new tables: `DBJournalEntry`, `DBJournalLink`, `DBExtractedFact`, `DBEntityAlias`, `DBEmbedding`, `DBEmbeddingJob`, `DBEntitySummary`, `DBAIActionProposal`, `DBResourceChunk`, `DBScheduleDayOverride`

---

## Full DB Schema (as of this session)

### Existing tables (migrated from SQLite, now clean PostgreSQL):
| Table | Notes |
|---|---|
| `goals` | BOOLEAN for overdue (was INTEGER) |
| `tasks` | BOOLEAN for completed, added `milestone_id`, `deadline_id`, `start_date` columns |
| `goal_deadlines` | FK ON DELETE CASCADE to goals |
| `goal_milestones` | FK ON DELETE CASCADE to goals |
| `meetings` | Added `milestone_id`, `duration_minutes`, `summary`, `updated_at` |
| `events` | Added `locked`, `source` columns |
| `event_task_links` | Added `planned_minutes`, UNIQUE(event_id, task_id) |
| `work_sessions` | Added `resource_id`, `goal_id` columns |
| `task_notes` | FK ON DELETE CASCADE to tasks |
| `task_note_files` | FK ON DELETE CASCADE to task_notes |
| `notes` | BOOLEAN for suggested_action_applied/ignored |
| `resources` | Added `description`, `estimated_minutes`, `actual_minutes`, `file_path`, `external_id`, `updated_at` |
| `resource_logs` | BOOLEAN for is_insight, FK ON DELETE CASCADE |
| `edges` | Added `strength`, `confidence`, `created_by`. UNIQUE constraint on (source_type, source_id, target_type, target_id, relationship) |
| `tags` | Same |
| `entity_tags` | UNIQUE(entity_type, entity_id, tag_id) |
| `daily_scores` | Same |
| `user_schedule_prefs` | Added `buffer_ratio` |

### NEW tables:
| Table | Purpose |
|---|---|
| `journal_entries` | Raw journal text + AI-extracted summary/mood/energy/tags. `ingestion_status`: pending→processed|failed |
| `journal_links` | journal_entry → any entity (goal/task/resource/milestone), with relationship type + confidence |
| `extracted_facts` | Structured facts parsed from journals/meetings/resources (risk, progress, blocker, decision, etc.) |
| `entity_aliases` | Informal names → entity IDs (e.g. "VNS paper" → resource_id). Used for journal entity matching. |
| `embeddings` | `vector(768)` per entity. UNIQUE on (entity_type, entity_id, embedding_scope, content_hash). HNSW index. |
| `embedding_jobs` | Queue for async embedding. status: pending→processing→done|failed |
| `entity_summaries` | Cached AI-readable summaries per entity (planning/semantic/graph/journal_digest types) |
| `ai_action_proposals` | AI-proposed actions before user confirmation (confidence, status: pending/accepted/rejected/applied) |
| `resource_chunks` | Chunked text from large PDFs for semantic search |
| `schedule_day_overrides` | Per-day capacity overrides (e.g. "July 1: only 3h available") |

---

## API Routes (complete list)

```
/api/goals             — CRUD + POST /:id/sync-metrics
/api/tasks             — CRUD + toggle, complete, touch, deactivate + task notes CRUD
/api/notes             — CRUD (brain dump)
/api/events            — CRUD
/api/resources         — CRUD + mentions, upload, serve, references, stats, graph, logs
/api/edges             — CRUD
/api/task-note-files   — upload, stream, delete
/api/meetings          — CRUD
/api/goal-deadlines    — CRUD + PATCH /assign
/api/milestones        — CRUD + PATCH /assign-task
/api/schedule-prefs    — GET/PUT
/api/work-sessions     — CRUD
/api/event-task-links  — CRUD
/api/journal           — CRUD + GET /:id/links + POST /:id/ingest
/api/embeddings        — POST /embed, POST /search, POST /process-jobs, GET /stats
/api/ai/chat           — Ollama qwen2.5:72b chat with full context
/api/ai/apply          — Apply confirmed AI action to DB
/api/ai/health         — Ollama health check
/api/reset             — Factory reset
```

---

## Key Technical Patterns

### Query helper (all routes use this)
```ts
import { query, buildUpdate } from '../db.js';

// SELECT
const { rows } = await query('SELECT * FROM goals WHERE id=$1', [id]);
const row = rows[0];

// Dynamic UPDATE
const updates = { ...req.body, updated_at: now };
const { sets, vals } = buildUpdate(updates);
await query(`UPDATE goals SET ${sets} WHERE id=$${vals.length + 1}`, [...vals, id]);

// INSERT with dedup
await query(`INSERT INTO edges (...) VALUES (...) ON CONFLICT DO NOTHING`, [...]);
```

### Ollama usage
```ts
import { chat, embed, parseJSON } from '../ollama.js';

// Reasoning
const raw = await chat([{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }]);
const parsed = parseJSON(raw); // strips ```json fences, falls back to regex extraction

// Embeddings (768-dim float array)
const vector = await embed('some text');
const vectorStr = `[${vector.join(',')}]`; // for pg vector cast: $1::vector
```

### Boolean handling
PostgreSQL returns real JS booleans from BOOLEAN columns. No more `Boolean(row.overdue)` needed. But it's kept in rowToGoal/rowToTask for safety (they're now no-ops).

---

## Env Vars Required
```
DATABASE_URL="postgresql://localhost:5432/amina"
OLLAMA_HOST="http://<cloud-gpu-ip>:11434"
OLLAMA_MODEL="qwen2.5:72b"
OLLAMA_EMBED_MODEL="nomic-embed-text"
```

---

## Setup (one-time, after this session)
```bash
createdb amina                    # create PostgreSQL database
cp .env.example .env              # fill in DATABASE_URL + OLLAMA_HOST
ollama pull qwen2.5:72b           # on cloud GPU box
ollama pull nomic-embed-text      # on cloud GPU box (or local)
npm install                       # install pg + ollama packages
npm run migrate                   # move marina.db data to PostgreSQL
npm run dev                       # start (applies schema on first boot)
```

---

## Pending Tasks / What Comes Next

### The user wants to do in a NEW chat:
**"Change the whole DB backend now"** — meaning they want to implement a NEW schema on top of this PostgreSQL foundation. The architecture design (from the big design doc earlier in the conversation) is the blueprint.

### High-priority items NOT yet implemented:
1. **Copilot Schedule View** — 3rd panel of CopilotView: day-by-day timeline, AI ghost chips, confirm/skip. Full PRD exists in session log `29-06-2026-18_08-marina-db-restructure-ai-arch.md`
2. **Milestone UI in GoalDetail** — table + API exist, no frontend UI yet
3. **Schedule Prefs UI in Settings** — route + DB exist, no Settings page UI
4. **Journal UI** — `journal_entries` table + `/api/journal` route exist, no frontend view yet
5. **Embedding worker** — `POST /api/embeddings/process-jobs` exists but nothing calls it on a schedule yet
6. **Entity aliases UI** — table exists, no way to view/manage aliases in the frontend
7. **AI Action Proposals UI** — table exists, no frontend for proposal review
8. **`entity_summaries` population** — table exists, nothing generates summaries yet
9. **`resource_chunks` population** — table exists, no chunking pipeline yet

### If the user says "implement my new schema":
- Ask them what the new schema is (they may have a design in mind)
- The migration path is: add new tables via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or new `CREATE TABLE IF NOT EXISTS` in schema.sql, never DROP existing tables
- Run `npm run migrate` only for SQLite→Postgres (already done after this session)
- For PostgreSQL schema changes: just update schema.sql and restart (initSchema is idempotent)

---

## Critical Notes for Next Chat
1. **NEVER delete or reset the PostgreSQL `amina` database** — user has live data (migrated from marina.db)
2. **Schema changes**: add to `schema.sql` using `IF NOT EXISTS` / `IF NOT EXISTS` patterns, then restart server
3. **All routes are async** — every handler is `async (req, res)` + `await query()`
4. **Better-sqlite3 is still in package.json** — only used by migrate.ts, can be removed after migration is confirmed working
5. **Frontend (React/Zustand/Dexie)** — NOT changed this session. Dexie.js is still in the frontend but the backend no longer uses it. The frontend talks to Express via `fetch` → `/api/...` endpoints.
6. **The `src/db/schema.ts` file** is the TypeScript type system for the DB — update it whenever a new table/column is added to schema.sql

---

## Quick Resume Context

Amina OS is a personal whole-life goal/task/project management app. This session completed a full backend migration: SQLite (better-sqlite3, sync) → PostgreSQL + pgvector (pg, async) + Ollama (qwen2.5:72b reasoning + nomic-embed-text embeddings, 100% offline/local). All 14 Express routes were rewritten async. 6 new files were created (schema.sql, db.ts, ollama.ts, migrate.ts, routes/journal.ts, routes/embeddings.ts). The DB now has 22 tables including a 768-dim vector embedding table with HNSW index, a journal ingestion pipeline that uses the local LLM to extract structured facts, and a complete entity alias system. TypeScript compiles clean. Next step: the user wants to implement a new schema design in a new chat — they should provide the schema and the new chat should use this log + the previous session log as context.
