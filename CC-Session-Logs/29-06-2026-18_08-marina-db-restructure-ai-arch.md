# Session Log: 29-06-2026 18:08 - marina-db-restructure-ai-arch

## Quick Reference (for AI scanning)
**Confidence keywords:** marina-os, SQLite, better-sqlite3, schema-migration, milestones, schedule-prefs, work-sessions, event-task-links, vector-embeddings, RAG, gemini-2.5-flash, copilot, 4-layer-architecture, goal-milestones, safe-migration, task-dependencies, edges-table, feasibility-scheduling
**Projects:** Marina OS (personal goal/task/project management app)
**Outcome:** Audited the existing DB schema, identified structural gaps (missing milestones, time prefs, event-task links, work log history), designed a clean 4-layer architecture (structured DB + graph edges + vector embeddings + AI planner), added 4 new tables + 4 new API routes + TypeScript types + frontend hooks + enriched AI context.

---

## Key Learnings & Decisions

### Architecture Decision: 4-Layer Model
Do NOT store everything as RAG chunks. Use:
1. **Structured DB tables** — truth (goals, tasks, milestones, meetings, deadlines, events, resources)
2. **Graph edges** — relationships (task blocks task, resource supports goal, event schedules task)
3. **Vector embeddings** — semantic search over descriptions, notes, resource text (DEFERRED — not needed at current data scale)
4. **AI Chatbot/Planner** — reads structured data + graph + retrieved context, proposes schedule changes

### Why NOT pure RAG
- Vector search can find semantically related things but cannot do exact scheduling math
- "Can I finish this goal before July 20 if I have meetings Monday/Wednesday?" requires exact `estimated_minutes`, `due_date`, `meeting.scheduled_at`, `daily_capacity` — not embeddings
- RAG is the AI layer, NOT the storage layer

### Clusters = Dynamic Context Bundles, Not Static Folders
When AI needs to reason about a goal, the system builds a **goal bundle** dynamically:
- goal info + active milestones + upcoming deadlines + unfinished tasks + subtasks + meetings + scheduled events + linked resources + recent notes + time preferences
This is superior to pre-grouping items into static "cluster folders"

### Current DB Reality vs What User Thought They Had
**Thought they had:** Goal → Milestone → Task → Subtask (real hierarchy)
**Actually had:** Goal (with one `deadline` field) → Task (via `parent_task_id` for unlimited depth) — no real milestone entity existed

**Other gaps found:**
- No time preferences table (AI was assuming 8h/day hardcoded)
- No event↔task links (calendar blocks floated disconnected from tasks)
- `actual_minutes` was a single int overwritten each time — no time log history
- `edges` table existed but NOTHING queried it for scheduling
- Resources had no FK to goals — linked via edges only, never used

### Decision: Defer Vector Embeddings
Not added yet because:
- AI already gets full DB context injected as structured JSON (works fine under ~300–500 items)
- `sqlite-vec` requires native binary compilation (risky on Windows)
- Real bottleneck was missing schedule prefs + Copilot UI, not retrieval speed
- Add when: context overflows, or user wants semantic search bar, or notes/resources section gets large

### Decision: Use `edges` Table for Task Dependencies
Existing `edges` table has `relationship = 'blocks'` for task→task. The AI context now queries this. No separate `task_dependencies` table needed.

### Safe Migration Pattern (CRITICAL — never break existing marina.db)
```typescript
// Safe table addition
db.exec(`CREATE TABLE IF NOT EXISTS new_table (...)`);
// Safe column addition
try { db.exec('ALTER TABLE tasks ADD COLUMN new_col TEXT DEFAULT NULL'); } catch {}
```
**Never** `DROP TABLE`, `DELETE FROM`, or reset the database. User has sensitive live data in marina.db.

### Gemini API Notes
- Model: `gemini-2.5-flash` (works, free tier)
- `gemini-2.0-flash` has quota=0 on this project's billing account — DO NOT use
- API key is stored in `.env` as `GEMINI_API_KEY`
- `.env` is in `.gitignore`
- Response parsing: strip ` ```json ` fences with `/^```(?:json)?\s*/i` then fallback to `raw.match(/\{[\s\S]*\}/)`

---

## Files Modified

### New files created:
- `server/routes/milestones.ts` — CRUD for `goal_milestones` table + `PATCH /assign-task`
- `server/routes/schedule-prefs.ts` — GET/PUT for `user_schedule_prefs` (single row, auto-creates default)
- `server/routes/work-sessions.ts` — CRUD for `work_sessions`, auto-recalculates `tasks.actual_minutes` on write
- `server/routes/event-task-links.ts` — CRUD linking `events` ↔ `tasks`, deduplicates on POST

### Modified files:
- `server/db.ts` — Added 4 new tables via safe `CREATE TABLE IF NOT EXISTS` + `try/catch ALTER TABLE tasks ADD COLUMN milestone_id`
- `server/index.ts` — Registered 4 new routers: milestonesRouter, schedulePrefsRouter, workSessionsRouter, eventTaskLinksRouter
- `server/routes/ai.ts` — Enriched `getScheduleContext()` with: schedule_prefs, milestones per goal, work session totals per task, task dependencies from edges; added `create_milestone` action type to system prompt and `/apply` handler; updated scheduling rules to use `daily_capacity_minutes` from prefs
- `src/db/schema.ts` — Added `milestone_id?: string | null` to `DBTask`; added interfaces: `DBMilestone`, `DBSchedulePrefs`, `DBEventTaskLink`, `DBWorkSession`
- `src/api/hooks.ts` — Added imports for new types; added hooks: `useGoalMilestones`, `useSchedulePrefs`, `useTaskWorkSessions`; added invalidation helpers: `milestones`, `schedulePrefs`, `workSessions`

### Files from PREVIOUS session (context summary):
- `server/routes/ai.ts` — Created (Gemini 2.5 Flash chat + apply endpoints)
- `server/routes/meetings.ts` — Created (CRUD meetings)
- `server/routes/deadlines.ts` — Created (CRUD goal_deadlines + PATCH /assign)
- `src/views/CopilotView.tsx` — Created then fully rewritten (3-panel layout: goal health + chat + [schedule panel TBD])
- `src/views/GoalDetail.tsx` — Added DeadlineModal, DeadlineCard, MeetingModal sections
- `src/views/GanttView.tsx` — Added MeetingFlagsRow, meeting chips in CalendarView
- `src/components/Sidebar.tsx` — Added Copilot nav item with Zap icon + "AI" badge
- `src/components/MobileNav.tsx` — Added Copilot tab
- `src/App.tsx` — Added CopilotView routing
- `src/store/useAppStore.ts` — Added `'Copilot'` to Tab type
- `src/db/queries/deadlines.ts` — Created (client-side query helpers)
- `src/db/queries/meetings.ts` — Created (client-side query helpers)
- `.env` — Created with `GEMINI_API_KEY`
- `.gitignore` — Added `.env` entry

---

## Pending Tasks

### High Priority — Next Session
1. **Copilot Schedule View (Live Preview Panel)** — The 3rd panel of the Copilot page. Full PRD was written:
   - Right panel shows day-by-day list of next 5 weeks with all tasks that have due dates
   - AI-proposed actions appear as **ghost/pending chips** on the schedule (dashed border, amber, pulsing)
   - Confirming an action: ghost becomes real, briefly flashes green
   - Skipping an action: ghost disappears
   - Days with deadline badges (`◆ DEADLINE`), meeting flags (`⚑`)
   - Controls: Previous/Next week nav, Today button, goal filter dropdown
   - Legend: Existing | AI Preview | Deadline
   - Layout: `[Goal Health 200px] | [Chat 420px] | [Schedule flex-1]`

2. **Milestone UI in GoalDetail** — The `goal_milestones` table and API exist but no UI yet. Need to add milestone cards to GoalDetail.tsx (between goal header and task list), similar to DeadlineCard but as collapsible sections that tasks can be assigned to.

3. **Schedule Prefs UI in Settings** — User needs a UI to set their work hours, daily capacity, deep work window. Route and DB exist, no Settings page UI yet.

### Medium Priority — Later
4. **Vector Embeddings** — Deferred. Add when data scale demands it or user wants semantic search. Plan: `sqlite-vec` + Gemini `text-embedding-004` + `embeddings` table + middleware auto-re-embed on write.
5. **Event↔Task Links UI** — The `event_task_links` table and API exist but no UI in GanttView to link a time block to a task.
6. **Work Sessions UI** — `work_sessions` table and API exist but no UI in TaskDetail to log sessions.
7. **Make edges table actually power scheduling** — Dependency chains from `edges` are now included in AI context; the schedule view should visually show blocked tasks.

---

## Errors & Workarounds

### From this session
- **Edit tool failing "file not read yet"** — After context compaction, the Read tool result from the summarized context is not counted. Must Re-Read files before editing even if they were read before compaction.

### From previous session (in context summary)
- **Smart quote parse error** — `What's` in STARTER_PROMPTS had a smart apostrophe. Fix: use double-quoted string.
- **`gemini-2.0-flash` quota 429** — This key's Google Cloud project has billing enabled, quota=0 for 2.0-flash. Fix: use `gemini-2.5-flash`.
- **Raw JSON shown in chat** — Gemini wraps response in ` ```json\n\n{ ` (extra newlines). Fix: `replace(/^```(?:json)?\s*/i, '')` + fallback `raw.match(/\{[\s\S]*\}/)`.
- **CopilotView height cutoff** — Used `h-screen` which doesn't account for 76px fixed header. Fix: `h-[calc(100vh-112px)] md:h-[calc(100vh-76px)]`.
- **Broken health check fetch** — GoalHealthPanel was calling `/api/ai/chat` with a dummy message just to check API health. Fix: removed entirely, fetch `/api/goals` and `/api/tasks` directly instead.

---

## Quick Resume Context

Marina OS is a personal goal/project management app (React 19 + Vite 6 + TypeScript frontend, Express.js port 3001 backend, better-sqlite3 SQLite). This session audited the DB schema, identified structural gaps, and added 4 new tables (goal_milestones, user_schedule_prefs, event_task_links, work_sessions) plus full API routes, TypeScript types, and frontend hooks. The critical next step is building the Copilot live schedule preview panel — the 3rd panel in CopilotView that shows AI-proposed task changes as ghost chips on a day-by-day timeline, updating in real time as the user confirms or skips AI actions. The architecture decision was: structured DB = truth, graph edges = relationships, vector embeddings = deferred (not needed at current scale), AI chatbot = planner that reads structured context and proposes confirmable actions. **NEVER delete or reset marina.db — user has sensitive live data.**

---

## DB Schema — Current State (as of this session)

### Tables
| Table | Purpose |
|---|---|
| `goals` | Goal containers with single deadline, status, progress |
| `tasks` | Unified task/subtask table via `parent_task_id` (unlimited depth); has `milestone_id`, `deadline_id`, `start_date`, `due_date`, `estimated_minutes`, `actual_minutes` |
| `goal_milestones` | NEW — first-class checkpoint nodes between Goal and Task |
| `goal_deadlines` | Named external deadline buckets per goal (multiple per goal) |
| `meetings` | Meetings attached to goals |
| `events` | Calendar time blocks (Focus/Buffer/Review/Admin) by day_index + start_hour + week_start |
| `event_task_links` | NEW — connects events to tasks |
| `work_sessions` | NEW — per-task time log history with minutes, source, notes |
| `user_schedule_prefs` | NEW — single row (id='default'): work days/hours, daily capacity, deep work window |
| `notes` | Brain dump / journal entries |
| `task_notes` | Inline comments/thread on tasks |
| `resources` | Links, papers, documents, people |
| `resource_logs` | Progress notes and insights on resources |
| `edges` | Graph relationships between any entities (used for task dependencies: relationship='blocks') |
| `tags` / `entity_tags` | Tagging system |
| `daily_scores` | Mood/energy/focus per day |

### Hierarchy
```
Goal
  ├── Goal Deadlines (named external date buckets)
  ├── Goal Milestones (internal pacing checkpoints) ← NEW
  │     └── Tasks (milestone_id FK) ← NEW column
  │           └── Subtasks (parent_task_id, unlimited depth)
  ├── Meetings
  └── Resources (via edges)

Calendar
  └── Events (time blocks)
        └── event_task_links → Tasks ← NEW

User
  └── schedule_prefs (work hours, capacity, deep work) ← NEW
```

### API Routes
```
/api/goals             — CRUD goals
/api/tasks             — CRUD tasks (supports ?goal_id, ?parent_task_id)
/api/milestones        — CRUD goal_milestones + PATCH /assign-task  ← NEW
/api/goal-deadlines    — CRUD goal_deadlines + PATCH /assign
/api/meetings          — CRUD meetings
/api/events            — CRUD calendar events
/api/event-task-links  — Link/unlink events to tasks               ← NEW
/api/work-sessions     — CRUD work sessions per task               ← NEW
/api/schedule-prefs    — GET/PUT user schedule preferences         ← NEW
/api/resources         — CRUD resources
/api/notes             — CRUD brain dump notes
/api/edges             — Graph edge CRUD
/api/ai/chat           — Gemini 2.5 Flash chat with full context
/api/ai/apply          — Apply confirmed AI action to DB
```
