# Amina / Marina Database Audit

**Snapshot date:** 2026-07-04 (Asia/Beirut)  
**Scope:** Current PostgreSQL database, recoverable `marina.db` legacy SQLite database, WAL-only `amina.db` legacy SQLite database, migration code, and PostgreSQL backup chain  
**Method:** Read-only SQL/SQLite inspection, schema introspection, integrity checks, relationship checks, JSON/date validation, attachment verification, WAL reconstruction in a temporary file, and ID-level comparison between database generations

## 1. Executive findings

1. There are **three distinct database generations**, not one:

   - `amina.db-wal`: an older demo/seed SQLite database. Its main file is missing, but the WAL contains a complete, valid 11-table database.
   - `marina.db` + WAL: the later personal legacy SQLite database, containing the ECG/EEG, coursework, and research records.
   - PostgreSQL database `marina`: the live/current database, containing the old demo dataset plus newer Smart Liner and AI-memory records.

2. The live PostgreSQL database does **not** contain the personal `marina.db` goals, tasks, resources, task notes, or attachments:

   - Legacy `marina.db` goal-ID overlap with PostgreSQL: **0 of 7**
   - Task-ID overlap: **0 of 33**
   - Resource-ID overlap: **0 of 2**
   - Task-note-ID overlap: **0 of 4**
   - Attachment-ID overlap: **0 of 6**
   - Only the six demo calendar event IDs overlap.

3. The live PostgreSQL database is descended from the older **demo** Amina dataset:

   - All 4 demo goal IDs remain in PostgreSQL.
   - All 25 demo task IDs remain.
   - All 6 demo event IDs remain.
   - The four demo goals are now archived, while 21 of their tasks remain open.

4. The recoverable personal legacy database is internally healthy:

   - SQLite `PRAGMA quick_check`: **ok**
   - Foreign-key check: no violations
   - Application-level relationship checks: no orphans
   - All JSON fields parse successfully
   - All six attachment files exist and match their recorded byte sizes

5. The current PostgreSQL schema is substantially richer—35 tables, 89 indexes, 24 foreign keys, pgvector, journals, chat, topics, summaries, and proposals—but the live data has several consistency problems:

   - 5 stale goal embeddings
   - 2 orphaned resource-chunk embeddings
   - 1 orphaned resource summary
   - Historical embedding jobs reference many deleted entities
   - 29 of 29 tasks lack `estimated_minutes`
   - 29 of 29 tasks lack every structured task date
   - One task has 45 actual minutes but no work-session record
   - Two AI task proposals are still pending
   - Five foreign-key constraints are present but marked `NOT VALID`

6. The requested Arabic names are **not present** in any inspected source:

   - `بنك عام`
   - `بنك سعيد`
   - `دولار لبناني`
   - `صندوق عام`
   - The typed variant `صندوك عام`

   Searches covered individual Arabic tokens and complete phrases in PostgreSQL, `marina.db`, the reconstructed `amina.db-wal`, and all seven PostgreSQL dumps. There are also no banking, cashbox, ledger, currency, or transaction tables. These names therefore cannot be reported as existing database entities without another source file or clarification.

## 2. Physical sources and recoverability

| Source | State | Size | Tables | Rows | Integrity |
|---|---:|---:|---:|---:|---|
| PostgreSQL `marina` | Live/current | 12,220,095 bytes | 35 | 387 | Connected successfully; relational checks completed |
| `marina.db` | Main SQLite file | 159,744 bytes | 14 | 114 | `quick_check=ok` |
| `marina.db-wal` | Active SQLite WAL | 4,120,032 bytes | Part of `marina.db` state | — | Required when preserving the latest legacy state |
| `amina.db-wal` | WAL only; main missing | 218,392 bytes | 11 reconstructed | 70 | Reconstructed to 29 pages / 118,784 bytes; `quick_check=ok` |
| `amina.db-shm` | WAL shared-memory sidecar | 32,768 bytes | — | — | Not a standalone database |
| PostgreSQL dumps | 7 custom-format backups | 567,856–627,828 bytes | Backup snapshots | — | Readable by `pg_restore`; full restore was not performed |

Important: copying `marina.db` without its WAL can omit committed data still resident in the WAL. A safe preservation operation should stop the SQLite writer and use SQLite's backup/checkpoint mechanism, or copy the main, WAL, and SHM files as one consistent set.

### File fingerprints

- `marina.db` SHA-256: `F90874565AA40A3FF530C9B18D199A196E0D6AEB4CE14DE14ACBD09BB8FBDAC4`
- `marina.db-wal` SHA-256: `AA2AA6794EE5CD4D382C0365AE28F406D4EA11F715AD6AE5030AC7A5C92CD79D`
- `amina.db-wal` SHA-256: `3825047FD87030ACBFE94C36356CCBB2C7EA0DD87814FFAB5D6926B95FC82630`

## 3. Database lineage

### Generation A: WAL-only Amina demo database

The `amina.db-wal` transactions begin on 2026-06-23. The WAL contains page 1 and every page needed for its last committed 29-page state. It reconstructs a valid database consisting of four sample goals, 25 sample tasks, four sample resources, two sample notes, 29 graph edges, and six sample calendar events.

### Generation B: personal Marina legacy database

The `marina.db` dataset begins on 2026-06-24 and contains personal ECG/EEG research work, course repair tasks, Linear Algebra, INDE 301, Leetcode, and FYP syllabus work. It adds task notes, image attachments, goal deadlines, meetings, resource logs, and several task timing columns.

This is not a continuation of the demo goal/task IDs. The six sample events were retained, but the goal/task data was replaced with personal records.

### Generation C: PostgreSQL

PostgreSQL was introduced on 2026-06-29. The migration log claims that the whole SQLite database was migrated. The live evidence does not support that claim:

- PostgreSQL contains the Generation A demo IDs.
- It does not contain Generation B personal IDs.
- Four demo goals were later archived.
- New ECG literature-review and Smart Liner goals were added.
- AI/journal/chat data was added on July 2–3.

The exact destructive event cannot be proven from current artifacts. The most plausible explanations are:

1. PostgreSQL was reset and reseeded after a personal-data migration.
2. The migration was executed against a different database URL.
3. The session log reported intent/success but the target later changed.

The code contains a `resetAndSeed()` path that deletes core tables and restores demo data. The migration script also reports each attempted row as “inserted” without checking PostgreSQL's returned `rowCount`, so its progress output is not reliable evidence of actual insertion.

## 4. Requested Arabic entities

### Search result

| Requested name | PostgreSQL | `marina.db` | Recovered `amina.db-wal` | 7 PG backups |
|---|---:|---:|---:|---:|
| `بنك عام` | 0 | 0 | 0 | 0 |
| `بنك سعيد` | 0 | 0 | 0 | 0 |
| `دولار لبناني` | 0 | 0 | 0 | 0 |
| `صندوق عام` | 0 | 0 | 0 | 0 |
| `صندوك عام` | 0 | 0 | 0 | 0 |

The broader tokens `بنك`, `عام`, `سعيد`, `دولار`, `لبناني`, `صندوق`, and `صندوك` also returned no rows. No Arabic text exists in the inspected application tables.

### Technical implication

PostgreSQL is UTF-8 and can store Arabic, but its database collation is `English_United States.1252`. Arabic equality and substring searches work, but Arabic-aware linguistic sorting is not configured. If this application is expected to hold Arabic financial accounts, a dedicated account/ledger schema and an Arabic-capable ICU collation should be designed rather than forcing those concepts into goals or generic edges.

## 5. Current PostgreSQL database

### 5.1 Platform

- Database: `marina`
- Server: PostgreSQL 18.4, 64-bit Windows
- Role used by the app: `postgres`
- Encoding: UTF-8
- Collation / character classification: `English_United States.1252`
- Extensions:
  - `plpgsql` 1.0
  - `pgcrypto` 1.4
  - `vector` 0.8.3
- Public tables: 35
- Public indexes: 89
- Foreign keys: 24
- Check constraints: 17
- Unique constraints: 13
- Total live rows: 387
- Non-empty tables: 16
- Empty tables: 19

The application connects as the PostgreSQL superuser. This is convenient locally but gives the application far more privilege than it needs.

### 5.2 Complete table inventory

| Table | Rows | Columns | Indexes | FKs | Current role/state |
|---|---:|---:|---:|---:|---|
| `ai_action_proposals` | 5 | 11 | 3 | 0 | Confirmable AI mutations; 2 pending |
| `chat_messages` | 18 | 6 | 2 | 1 | 9 user + 9 assistant messages |
| `chat_sessions` | 6 | 6 | 1 | 0 | 3 archived + 3 active |
| `daily_scores` | 0 | 9 | 2 | 0 | Daily mood/energy/focus tracker, unused |
| `edges` | 30 | 11 | 5 | 0 | Generic graph: 29 goal→task, 1 task→task |
| `embedding_jobs` | 168 | 13 | 4 | 0 | Historical embedding queue; all done |
| `embeddings` | 38 | 14 | 5 | 0 | 3072-dimensional semantic vectors |
| `entity_aliases` | 0 | 6 | 3 | 0 | Alternate entity names, unused |
| `entity_summaries` | 46 | 11 | 3 | 0 | Planning/semantic summaries |
| `entity_tags` | 0 | 4 | 3 | 1 | Polymorphic entity/tag join, unused |
| `event_task_links` | 0 | 5 | 2 | 2 | Calendar/task bridge, unused |
| `events` | 6 | 14 | 2 | 0 | Demo weekly schedule blocks |
| `extracted_facts` | 2 | 12 | 3 | 0 | Two active task candidates |
| `goal_deadlines` | 0 | 6 | 2 | 1 | Named goal deadlines, unused |
| `goal_milestones` | 0 | 14 | 2 | 1 | Goal checkpoints, unused |
| `goals` | 6 | 20 | 1 | 0 | 4 archived demo goals + 2 active goals |
| `journal_entries` | 1 | 15 | 4 | 0 | One processed Smart Liner entry |
| `journal_links` | 0 | 8 | 4 | 1 | Journal/entity links, unused |
| `meetings` | 0 | 11 | 2 | 1 | Goal meetings, unused |
| `notes` | 1 | 12 | 1 | 0 | Source capture for Smart Liner journal |
| `resource_chunks` | 0 | 11 | 2 | 1 | Resource chunk store, currently empty |
| `resource_logs` | 0 | 5 | 2 | 1 | Resource annotations, unused |
| `resources` | 0 | 15 | 1 | 0 | Resource registry, currently empty |
| `schedule_day_overrides` | 0 | 6 | 2 | 0 | Per-day availability overrides, unused |
| `schema_migrations` | 23 | 2 | 1 | 0 | M-001 through M-021 history |
| `suggestion_runs` | 7 | 10 | 1 | 0 | Completed topic-clustering runs |
| `tags` | 0 | 3 | 2 | 0 | Tag vocabulary, unused |
| `task_note_files` | 0 | 7 | 2 | 1 | Task-note attachments, empty |
| `task_notes` | 0 | 4 | 2 | 1 | Task note thread, empty |
| `tasks` | 29 | 32 | 8 | 4 | 25 demo tasks + 4 Smart Liner tasks |
| `topic_aliases` | 0 | 5 | 2 | 1 | Topic aliases, unused |
| `topic_memberships` | 0 | 15 | 4 | 2 | Topic/entity assignments, unused |
| `topics` | 0 | 9 | 2 | 1 | Semantic topic registry, unused |
| `user_schedule_prefs` | 1 | 10 | 1 | 0 | Default Asia/Beirut schedule |
| `work_sessions` | 0 | 11 | 3 | 4 | Time-log history, empty |

### 5.3 Detailed current data dictionary

#### Goals, planning, and time

**`goals`**  
Exact columns: `id`, `title`, `description`, `category`, `status`, `progress`, `deadline`, `overdue`, `activity_level`, `archived_at`, `created_at`, `updated_at`, `start_date`, `target_date`, `hard_deadline`, `deadline_type`, `deadline_confidence`, `scheduling_enabled`, `estimated_minutes`, `plan_status`.

The six goals are:

| Goal | Category | Progress | State | Task count |
|---|---|---:|---|---:|
| Launch v2.0 Design System | Work | 0% | Archived | 7 |
| Complete Spanish A2 Certification | Learning | 40% | Archived | 6 |
| Migrate Personal Data to NAS | Home | 20% | Archived | 6 |
| Run Half Marathon | Health | 60% | Archived | 6 |
| Literature Review: ECG Seizure Detection Algorithm for Apple Watch | Learning | 0% | Active | 0 |
| Smart Liner for Prosthetics | AUB_Research | 0% | Active | 4 |

Only the ECG literature-review goal has a structured target date (`2026-08-01`). The four demo goals retain vague legacy deadline strings such as `Q3 2024`, `Aug 30`, and `Nov 12`.

**`tasks`**  
Exact columns: `id`, `goal_id`, `parent_task_id`, `milestone_id`, `deadline_id`, `title`, `description`, `status`, `priority`, `kind`, `critical_path_status`, `tags_json`, `due_date`, `start_date`, `estimated_duration`, `estimated_minutes`, `actual_minutes`, `weight_percent`, `completed`, `position`, `last_activity_at`, `completion_note`, `created_at`, `updated_at`, `target_date`, `hard_deadline`, `deadline_type`, `deadline_confidence`, `scheduling_enabled`, `flexibility`, `can_split`, `min_session_minutes`.

Distribution:

- Status: 20 `todo`, 5 `in_progress`, 4 `done`
- Completion flag: 25 false, 4 true
- Priority: 7 high, 22 medium
- Kind: 15 critical-path, 9 AI-generated, 4 next-action, 1 manual
- Status and `completed` agree for every row
- 21 open tasks belong to archived goals
- 4 open tasks belong to active goals
- Every task lacks `estimated_minutes`
- Every task lacks `due_date`, `target_date`, and `hard_deadline`
- One task has `actual_minutes=45` without a corresponding work session

The only current subtask is `p1`, under the Smart Liner task `BioPrinting`.

**`goal_deadlines`**  
Columns: `id`, `goal_id`, `title`, `date`, `color`, `created_at`. Empty. `goal_id` cascades on goal deletion.

**`goal_milestones`**  
Columns: `id`, `goal_id`, `title`, `description`, `due_date`, `color`, `position`, `completed`, `created_at`, `updated_at`, `start_date`, `hard_deadline`, `scheduling_enabled`, `plan_status`. Empty.

**`events`**  
Columns: `id`, `title`, `type`, `day_index`, `start_hour`, `duration_hours`, `time_str`, `description`, `week_start`, `connected_resource_json`, `locked`, `source`, `created_at`, `updated_at`.

The six rows are the original demo calendar: 3 Focus, 1 Buffer, 1 Review, and 1 Admin block. They are weekday-index templates rather than dated appointments because `week_start` is null in all six rows.

**`event_task_links`**  
Columns: `id`, `event_id`, `task_id`, `planned_minutes`, `created_at`. Empty. Both foreign keys cascade. A unique constraint prevents duplicate event/task pairs.

**`meetings`**  
Columns: `id`, `goal_id`, `milestone_id`, `title`, `scheduled_at`, `duration_minutes`, `location`, `notes`, `summary`, `created_at`, `updated_at`. Empty. `goal_id` is enforced, but `milestone_id` has no foreign key.

**`user_schedule_prefs`**  
Columns: `id`, `work_days`, `work_start`, `work_end`, `daily_capacity_minutes`, `deep_work_start`, `deep_work_end`, `buffer_ratio`, `updated_at`, `timezone`.

The single row specifies Monday–Friday, 09:00–18:00, 480 minutes/day, deep work 09:00–12:00, 15% buffer, and `Asia/Beirut`. `work_days` is valid JSON but stored as text.

**`schedule_day_overrides`**  
Columns: `id`, `date`, `available_minutes`, `unavailable_blocks`, `note`, `created_at`. Empty. `date` is unique; `unavailable_blocks` is JSON text.

**`work_sessions`**  
Columns: `id`, `task_id`, `resource_id`, `goal_id`, `started_at`, `ended_at`, `minutes`, `notes`, `source`, `created_at`, `journal_entry_id`. Empty.

#### Notes, journal, resources, and files

**`notes`**  
Columns: `id`, `title`, `content`, `type`, `date_str`, `suggested_action_text`, `suggested_action_applied`, `suggested_action_ignored`, `extracted_tasks_json`, `relevant_docs_json`, `created_at`, `updated_at`.

One Smart Liner capture exists. Its content was copied into the journal pipeline. The structured extraction arrays remain empty.

**`journal_entries`**  
Columns: `id`, `entry_date`, `raw_text`, `summary`, `mood`, `energy_level`, `tags_json`, `ingestion_status`, `content_hash`, `created_at`, `updated_at`, `ingestion_attempts`, `ai_tags_json`, `source_note_id`, `source`.

The single row was processed successfully in one attempt, has neutral mood, energy 5, AI tags `work` and `report`, and points back to the source note.

**`journal_links`**  
Columns: `id`, `journal_entry_id`, `target_type`, `target_id`, `relationship`, `confidence`, `created_by`, `created_at`. Empty. Only the journal-entry side is protected by a foreign key; the polymorphic target is not.

**`extracted_facts`**  
Columns: `id`, `source_type`, `source_id`, `fact_type`, `fact_text`, `target_type`, `target_id`, `confidence`, `status`, `created_at`, `updated_at`, `needs_review`.

Two active, 0.9-confidence task candidates were extracted from the journal: finish the Smart Liner report and send it to colleagues. Neither has a target entity.

**`resources`**  
Columns: `id`, `title`, `url`, `type`, `info`, `description`, `read_state`, `next_action`, `tags_json`, `estimated_minutes`, `actual_minutes`, `file_path`, `external_id`, `created_at`, `updated_at`. Empty.

**`resource_chunks`**  
Columns: `id`, `resource_id`, `chunk_index`, `heading`, `content`, `page_start`, `page_end`, `token_count`, `content_hash`, `created_at`, `chunk_metadata`. Empty, despite two embeddings that still identify themselves as resource-chunk embeddings.

**`resource_logs`**  
Columns: `id`, `resource_id`, `content`, `is_insight`, `created_at`. Empty.

**`task_notes`**  
Columns: `id`, `task_id`, `content`, `created_at`. Empty.

**`task_note_files`**  
Columns: `id`, `note_id`, `name`, `mime_type`, `size`, `file_path`, `created_at`. Empty.

#### Graph, tags, and topics

**`edges`**  
Columns: `id`, `source_id`, `source_type`, `target_id`, `target_type`, `relationship`, `strength`, `confidence`, `metadata`, `created_by`, `created_at`.

There are 29 goal→task `contains` edges and one task→task `subtask_of` edge. Strength and confidence average 1.0. A composite unique constraint prevents exact duplicate edges, but no foreign keys protect either endpoint because endpoints are polymorphic.

**`tags`**  
Columns: `id`, `name`, `color`. Empty. Tag names are unique.

**`entity_tags`**  
Columns: `id`, `entity_id`, `entity_type`, `tag_id`. Empty. `tag_id` is enforced; the entity side is not.

**`topics`**  
Columns: `id`, `name`, `description`, `color`, `status`, `merged_into_id`, `created_by`, `created_at`, `updated_at`. Empty. Active topic names are case-insensitively unique.

**`topic_aliases`**  
Columns: `id`, `topic_id`, `alias`, `created_by`, `created_at`. Empty.

**`topic_memberships`**  
Columns: `id`, `topic_id`, `entity_type`, `entity_id`, `source`, `status`, `confidence`, `evidence_json`, `reason_codes`, `suggestion_run_id`, `decided_at`, `decided_by`, `row_version`, `created_at`, `updated_at`. Empty.

**`suggestion_runs`**  
Columns: `id`, `kind`, `model`, `embedding_model`, `params_json`, `stats_json`, `status`, `error`, `started_at`, `finished_at`.

All seven runs are completed `cluster_candidates` runs. They produced no persisted topics or memberships.

#### AI, chat, summaries, and embeddings

**`chat_sessions`**  
Columns: `id`, `title`, `model`, `created_at`, `updated_at`, `archived`.

Six sessions exist: three archived verification sessions and three active schedule conversations. Session titles show schedule questions for the half-marathon, Spanish, and ECG literature-review goals.

**`chat_messages`**  
Columns: `id`, `session_id`, `role`, `content`, `created_at`, `metadata_json`.

There are 18 rows: 9 user and 9 assistant. Roles are constrained to user/assistant/system. Deleting a session deletes its messages.

**`ai_action_proposals`**  
Columns: `id`, `text`, `source_type`, `source_id`, `action_type`, `action_payload`, `confidence`, `status`, `explanation`, `created_at`, `applied_at`, `idempotency_key`.

State:

- 1 applied `create_goal`
- 1 applied `create_task`
- 1 rejected `update_goal`
- 2 pending `create_task` proposals

The two pending proposals duplicate the two extracted Smart Liner task candidates. Their shared source journal entry still exists.

**`entity_summaries`**  
Columns: `id`, `entity_type`, `entity_id`, `summary_type`, `summary_text`, `source_hash`, `created_at`, `updated_at`, `summary_model`, `summary_version`, `needs_review`.

There are 46 rows:

- 12 goal summaries: 6 planning + 6 semantic
- 33 task summaries: 29 planning + 4 semantic
- 1 semantic resource summary whose resource no longer exists

No summary is marked for review.

**`entity_aliases`**  
Columns: `id`, `entity_type`, `entity_id`, `alias`, `created_by`, `created_at`. Empty.

**`embedding_jobs`**  
Columns: `id`, `entity_type`, `entity_id`, `chunk_id`, `action`, `priority`, `status`, `attempts`, `error`, `created_at`, `processed_at`, `next_attempt_at`, `lease_expires_at`.

All 168 jobs are completed upserts. One completed goal job retains an error after succeeding on a later attempt. Historical jobs refer to deleted objects: 6 tasks, 18 resources, 8 notes, 6 journal entries, and 2 resource chunks. Keeping job history is legitimate, but the table currently does not distinguish audit history from live queue references.

**`embeddings`**  
Columns: `id`, `entity_type`, `entity_id`, `chunk_id`, `embedding_scope`, `embedding_text`, `embedding`, `embedding_model`, `content_hash`, `is_stale`, `created_at`, `updated_at`, `embedding_dimension`, `embedding_3072`.

All 38 rows use `gemini-embedding-2` and have a populated 3072-dimensional vector. The older 768-dimensional `embedding` column is null in all rows. Five of six goal embeddings are stale. Two resource-chunk embeddings are orphaned because `resource_chunks` is empty.

#### Operational metadata

**`schema_migrations`**  
Columns: `name`, `applied_at`. Contains 23 entries from M-001 through M-021. Migrations 1–16 were recorded together on 2026-07-02; later migrations added journal tags, semantic topics, chat metadata, note/journal linkage, and real-date planning.

**`daily_scores`**  
Columns: `id`, `date`, `score`, `mood`, `energy`, `focus`, `tasks_completed`, `notes`, `created_at`. Empty. `date` is unique.

### 5.4 PostgreSQL integrity findings

Good:

- No current task has an orphaned `goal_id` or `parent_task_id`.
- `status='done'` and `completed=true` agree for all tasks.
- All inspected JSON-text fields parse correctly.
- All 168 embedding jobs are in `done`, with no failed or pending jobs.
- Current graph endpoints resolve.
- Validated relational foreign keys have no violations.

Problems:

1. **Five foreign keys are not validated**

   - `tasks.deadline_id`
   - `tasks.milestone_id`
   - `work_sessions.goal_id`
   - `work_sessions.resource_id`
   - `work_sessions.journal_entry_id`

   The affected referencing tables are currently empty/null in those fields, so validation should be straightforward.

2. **Polymorphic orphan records**

   - 2 `embeddings` rows for deleted resource chunks
   - 1 `entity_summaries` row for a deleted resource
   - Multiple historical `embedding_jobs` rows point to deleted entities

3. **Planning data is structurally present but operationally empty**

   Milestones, named deadlines, event-task links, work sessions, day overrides, meetings, and scheduling estimates are unused. The schedule engine cannot make defensible duration-based plans for the current tasks.

4. **Archived/open-state mismatch**

   Twenty-one incomplete tasks sit beneath archived goals. If normal queries do not explicitly filter archived parents, these tasks can leak into search, schedule, summaries, and AI context.

5. **Dates and JSON are stored as text**

   Many timestamps, dates, JSON arrays, and JSON objects are plain `TEXT`. This permits invalid values, prevents native date arithmetic/index semantics, and requires application-side parsing.

6. **Mixed IDs**

   IDs are text and mix UUIDs with seed identifiers such as `goal-1`, `cp-1`, and `evt-1`. This is supported, but prevents database-level UUID validation and complicates external integrations.

7. **Current app role is overprivileged**

   The app connects as `postgres`. A least-privilege application role should own or receive only the CRUD permissions it needs.

## 6. Personal legacy database: `marina.db`

### 6.1 Storage and schema

- SQLite version used for inspection: 3.53.2
- Page size: 4096
- Page count: 39
- Freelist pages: 0
- Journal mode: WAL
- Encoding: UTF-8
- Foreign-key enforcement: on
- User version: 0
- Application ID: 0
- Tables: 14
- Rows: 114
- Explicit secondary indexes: none; only automatic primary-key/unique indexes

### 6.2 Complete table inventory

| Table | Rows | Purpose and notable columns |
|---|---:|---|
| `daily_scores` | 0 | `id`, unique `date`, score, mood, energy, focus, completed count, notes |
| `edges` | 55 | Polymorphic source/target graph, relationship, JSON metadata |
| `entity_tags` | 0 | Polymorphic entity/tag join; no declared FKs |
| `events` | 6 | Demo weekly time blocks; same six event IDs as PostgreSQL |
| `goal_deadlines` | 0 | Named dates with cascade FK to goals |
| `goals` | 7 | Title, category, status, progress, free-text deadline, archived timestamp |
| `meetings` | 0 | Goal meeting records; cascade FK to goals |
| `notes` | 1 | Brain-dump capture with JSON task/document suggestions |
| `resource_logs` | 0 | Resource annotations and insight flag |
| `resources` | 2 | Two PDF resources with read-state/action/tag fields |
| `tags` | 0 | Unique tag names |
| `task_note_files` | 6 | Image attachment metadata and absolute paths |
| `task_notes` | 4 | Notes attached to three ECG/EEG tasks |
| `tasks` | 33 | Goal/task hierarchy, scheduling, estimates, actual time, completion |

### 6.3 Personal goal inventory

| Goal | Tasks | Completed | Estimated minutes | Actual minutes | Archived |
|---|---:|---:|---:|---:|---|
| ECG&EEG | 19 | 8 | 3,560 | 2,940 | No |
| Fix Courses | 8 | 0 | 560 | 0 | No |
| Linear Algebra | 2 | 0 | 16,200 | 0 | No |
| Physics 210 | 1 | 0 | 0 | 0 | Yes |
| INDE 301 final | 1 | 0 | 30 | 0 | No |
| Leetcode | 1 | 0 | 0 | 0 | Yes |
| Syllabus FYP | 1 | 0 | 1,920 | 0 | No |

Task distribution:

- 16 todo
- 9 in progress
- 8 done
- 13 critical-path tasks
- 20 manual tasks
- 12 high-priority tasks
- 21 medium-priority tasks

### 6.4 ECG/EEG hierarchy

The ECG&EEG goal is the dominant legacy project:

- `FYP Literature Review Report`
  - `Section 2`
    - ECG-based supervised machine-learning seizure-detection paper
      - Computational ECG diagnostic-techniques paper
    - SeizeIT2 wearable ECG seizure-detection paper
    - Epilepsy-related ECG-change paper
    - Cardiac-instability/Holter paper
    - Postictal ECG-change paper
  - `Section 3`
  - `Sections 5 & 8`
- `Literature Reviews`
  - `Meeting Reviews`
    - Review meeting dated 2026-06-26
      - Six morphology, conduction, artifact, AUH ECG/EEG, and annotation-benchmark subtasks

The project contains two PDF resources, connected to tasks by `attached_to` edges. Four task notes and six screenshots/images document work on slides, ECG morphology, k-fold validation, and one wearable-study task.

### 6.5 Graph

The 55 graph edges are:

- 33 goal→task `contains`
- 20 task→task `subtask_of`
- 2 resource→task `attached_to`

There are no duplicate edge tuples and no unresolved graph endpoints.

The graph duplicates relationships already present in `tasks.goal_id` and `tasks.parent_task_id`. This provides flexible traversal but creates two representations that can diverge unless writes are transactional.

### 6.6 Attachments

All six `task_note_files` rows point to real PNG files under `server/uploads`. Every recorded size exactly matches the filesystem size:

- 66,502 bytes
- 131,965 bytes
- 184,949 bytes
- 99,472 bytes
- 41,469 bytes
- 135,795 bytes

The paths are absolute Windows paths. They work on this machine but will break if the workspace is moved, restored under another user, or deployed to Linux. Paths should be stored relative to a configured upload root.

### 6.7 Legacy integrity and design findings

Good:

- `quick_check=ok`
- No declared FK violations
- No application-level orphans among tasks, task notes, files, resources, and graph edges
- No invalid JSON in task tags, resource tags, event resources, note arrays, or edge metadata
- All tested ISO date/time strings parse
- Task `status` and integer `completed` are consistent

Risks:

- Almost every query relies on table scans because there are no indexes on `goal_id`, `parent_task_id`, `due_date`, edge endpoints, note IDs, or resource IDs.
- Dates are stored as text.
- JSON is stored as text.
- Boolean values are integer flags without `CHECK (value IN (0,1))`.
- `task_notes`, `task_note_files`, `resource_logs`, `entity_tags`, and graph endpoints lack declared FKs.
- `tasks.deadline_id` was added later but has no FK.
- The database has no schema-version marker despite incremental `ALTER TABLE` changes.
- Linear Algebra estimates total 270 hours; the parent is 180 hours and its subtask 90 hours. This may be intentional, but it is an outlier worth verifying.
- Goal progress is stored separately from task completion and may not be reproducible from the current rows.

## 7. WAL-only legacy database: `amina.db-wal`

### 7.1 Recovery result

The main `amina.db` file is absent. The WAL contains:

- SQLite WAL magic: valid
- Page size: 4096
- Frames: 53
- Last committed frame: 53
- Committed database size: 29 pages
- Reconstructed size: 118,784 bytes
- Reconstructed `quick_check`: ok

The temporary reconstruction was deleted after inspection; the original WAL and SHM were not modified.

### 7.2 Complete table inventory

| Table | Rows | Notes |
|---|---:|---|
| `daily_scores` | 0 | Same daily tracker |
| `edges` | 29 | 25 goal/task containment + 4 resource/goal attachments |
| `entity_tags` | 0 | Empty |
| `events` | 6 | Demo schedule rows |
| `goals` | 4 | Design system, Spanish, NAS, half marathon |
| `notes` | 2 | Two demo captures |
| `resources` | 4 | Figma, Spanish plan, NAS sheet, Garmin workspace |
| `tags` | 0 | Empty |
| `task_note_files` | 0 | Empty |
| `task_notes` | 0 | Empty |
| `tasks` | 25 | Demo goal tasks |

This schema predates goal deadlines, meetings, resource logs, task timing columns, and the personal research dataset. It is a seed/demo database, not the missing personal database.

## 8. Cross-generation reconciliation

| Shared table | Amina WAL | Marina SQLite | PostgreSQL | Marina→PG ID overlap |
|---|---:|---:|---:|---:|
| `daily_scores` | 0 | 0 | 0 | 0 |
| `edges` | 29 | 55 | 30 | 0 edge IDs |
| `entity_tags` | 0 | 0 | 0 | 0 |
| `events` | 6 | 6 | 6 | 6 |
| `goals` | 4 | 7 | 6 | 0 |
| `notes` | 2 | 1 | 1 | 0 |
| `resources` | 4 | 2 | 0 | 0 |
| `tags` | 0 | 0 | 0 | 0 |
| `task_note_files` | 0 | 6 | 0 | 0 |
| `task_notes` | 0 | 4 | 0 | 0 |
| `tasks` | 25 | 33 | 29 | 0 |

Interpretation:

- Amina WAL → PostgreSQL lineage is strong: the four demo goals, 25 demo tasks, and six events match by ID.
- Marina SQLite → PostgreSQL lineage is absent for personal entities.
- The six events are common because both SQLite generations inherited the same demo schedule.
- The PostgreSQL database should not be described as a complete migration of `marina.db`.

## 9. Backup chain

Seven PostgreSQL custom-format dumps exist:

1. `marina_2026-07-02_09-29-41.dump`
2. `marina_2026-07-03-16-16-37_manual.dump`
3. `marina_2026-07-03-16-31-15_auto.dump`
4. `marina_2026-07-03-16-59-00_auto.dump`
5. `marina_2026-07-03-17-03-47_auto.dump`
6. `marina_2026-07-03-17-09-56_auto.dump`
7. `marina_2026-07-03-20-41-49_auto.dump`

They are readable enough for `pg_restore` to emit their data sections, and none contains the requested Arabic names. This audit did not restore them into temporary databases, so referential integrity and exact row counts inside each snapshot remain unverified.

The backup chain begins after the PostgreSQL database was already on the demo/current lineage. It should not be assumed to contain the personal `marina.db` dataset.

## 10. Recommended action plan

### P0 — preserve and prevent loss

1. Preserve `marina.db`, `marina.db-wal`, and `marina.db-shm` as a consistent set before any migration attempt.
2. Make a PostgreSQL dump immediately before reconciliation.
3. Do not run `resetAndSeed()` or any `/api/reset` route.
4. Do not run the existing migration directly against production until it is fixed and tested in a staging database.
5. Preserve the six upload PNGs together with the database.

### P0 — reconcile the missing personal data

1. Restore a PostgreSQL dump to a staging database.
2. Run a corrected migration from a consistent SQLite backup.
3. Produce a per-table manifest containing attempted, inserted, conflicted, rejected, and post-check counts.
4. Confirm the seven personal goals, 33 tasks, two resources, four task notes, and six attachments in staging.
5. Decide whether the four demo goals should remain archived, be removed, or be kept separately.
6. Merge staging into production only after an ID and relationship audit.

### P1 — repair current consistency

1. Validate the five `NOT VALID` foreign keys.
2. Delete or rebuild the two orphaned resource-chunk embeddings.
3. Delete or explicitly archive the orphaned resource summary.
4. Re-embed the five stale goal embeddings.
5. Either retain embedding jobs as immutable audit history with a documented policy or prune jobs whose entities were deleted.
6. Resolve or reject the two pending Smart Liner task proposals.
7. Decide whether open tasks under archived goals should also be archived or excluded everywhere.
8. Backfill task estimates and structured dates for active goals.
9. Convert the 45-minute task aggregate into a work-session row if it represents real work.

### P1 — fix migration observability

The migration script should:

- increment “inserted” only when `result.rowCount === 1`
- count conflicts separately
- fail when a source table unexpectedly disappears
- record source database hash and destination database name
- execute pre/post row-count and ID-overlap checks
- write a durable migration-run record
- verify attachment existence and path portability

### P2 — improve the schema

1. Convert real timestamps to `TIMESTAMPTZ` and calendar dates to `DATE`.
2. Convert JSON text to `JSONB` with shape checks where practical.
3. Add checks for task status, priority, kind, progress ranges, confidence ranges, and non-negative time values.
4. Replace absolute attachment paths with storage-relative keys.
5. Create a least-privilege PostgreSQL application role.
6. Decide whether polymorphic records should reference a central entity registry so the database can enforce endpoint existence.
7. Add automated backup-restore tests, not only backup creation.
8. If Arabic financial data is planned, add first-class `accounts`, `currencies`, `transactions`, and `ledger_entries` tables plus an Arabic-capable collation. Do not model banks and cashboxes as goals or tags.

## 11. Final assessment

The personal legacy SQLite database is healthy and recoverable, but it is not represented in the live PostgreSQL database. The live database is structurally advanced but is rooted in the older demo seed, carries unused subsystems, and contains several AI-memory consistency issues. The highest-value next operation is a controlled staging reconciliation of `marina.db` into PostgreSQL, with backups and explicit row/ID manifests.

The requested Arabic bank/currency/cashbox names do not exist in any available database generation or backup. A separate source is required before a factual report about those entities can be produced.
