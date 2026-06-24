# Marina OS — To-Do Checklist

> Add items here. I'll pick them up, implement them, and cascade each into sub-tasks + unit tests automatically.

---

## Done ✅

- [x] **Fix white-screen on load** — `main.tsx` seeding used `.then()` instead of `.catch().finally()`, so any DB error silently blocked React from mounting
  - [x] Unit: n/a (startup bootstrap, no pure function to test)

- [x] **Hardcoded week dates in ScheduleView** — days, today index, week label, and time indicator were all static strings
  - [x] Unit: n/a (pure DOM/date rendering)

- [x] **Hardcoded `goal-1` target in BrainDumpView** — `handleApply` always linked extracted tasks to `goal-1`; now queries first active goal dynamically
  - [x] Unit: n/a (DB-side logic)

- [x] **Atomic goal navigation after creation** — `setCurrentTab` + `setSelectedGoalId` were two separate Zustand calls, leaving a window where localStorage had `selectedGoalId: null`; replaced with `navigateToGoal(goalId)` single-set action
  - [x] Unit: n/a (Zustand store, tested via integration)

- [x] **Section Journal — document / PDF attachment**
  - [x] `DBTaskNoteFile` schema + DB v4 migration (`task_note_files` table)
  - [x] `src/db/queries/noteFiles.ts` — `addNoteFile`, `getNoteFilesForNote`, `deleteNoteFile`, cascade `deleteNoteFilesForNotes`
  - [x] Cascade deletions wired into `deleteTaskNote` and `deleteTask`
  - [x] `NoteArticle` component — per-entry attach button (hover-revealed), multi-file upload, live file chips
  - [x] `NoteFileChip` component — filename, size, **View** button for PDF/images, hover-delete
  - [x] `FileViewerModal` component — full-screen modal with dark toolbar, Escape key, Download button; `<iframe>` for PDFs, `<img>` for images, fallback download for other types; blob URLs cleaned up on unmount

- [x] **Time rollup: sub-subtask hours bubble up through the tree**
  - [x] `getRolledUpTime(task, allTasks)` in `taskTime.ts` — recursive, children's sum beats parent's own estimate, exposes `isRollup` + `conflict` + `childrenSum`
  - [x] Bug fix: `parseTaskTimeInput` regex used `\b` word boundary which blocked `1h30m` (no-space format) — changed to `(?![a-zA-Z])` lookahead
  - [x] `TimePill` updated — shows Σ prefix when rolled up, ⚠ amber badge when parent's own estimate conflicts with children's sum, tooltip explains source
  - [x] Unit tests: `src/utils/__tests__/taskTime.test.ts` (50 tests — all green)
  - [x] Unit tests: `src/utils/__tests__/goalTaskMetrics.test.ts` (19 tests — all green)

- [x] **Deadline + dynamic time estimates throughout the task tree**
  - [x] `DeadlinePill` component — rounded-full chip; red + proximity badge ("today", "tmrw", "3d", "2d ago") when near/overdue; amber ≤3 days; dashed empty state; editable via `<input type="date">`
  - [x] `InlineTimePill` component — shows `remaining / total` when in progress (amber); green "Done ✓" at 100%; Σ prefix for rollup; ⚠ conflict badge hidden when done
  - [x] `getTaskLeafProgress(task, allTasks)` utility — recursively computes 0–1 ratio from leaf-task completion; instant 1 if task itself is done
  - [x] `GoalDetail` header — editable `DeadlinePill` for `goal.deadline` (saves via `updateGoal`)
  - [x] `TaskTreeRow` — deadline + time chips visible at all times when set; appear on hover when empty
  - [x] `MilestoneCard` header — deadline + rolled-up time always visible in header row
  - [x] `goalFinishEstimate.ts` fix — formats ISO deadline string (e.g. "2025-12-31") → "Dec 31" instead of raw string
  - [x] Unit tests: 7 new tests for `getTaskLeafProgress` in `taskTime.test.ts`

- [x] **SQLite migration — replace Dexie/IndexedDB with persistent file-based storage**
  - [x] `server/db.ts` — `better-sqlite3` connection to `amina.db` in project root; WAL mode + foreign keys; all `CREATE TABLE IF NOT EXISTS` statements; `rowToGoal()` + `rowToTask()` boolean converters
  - [x] `server/seed.ts` — `seedIfEmpty()` on startup; `resetAndSeed()` on `POST /api/reset`; seeds from `src/data.js`
  - [x] `server/index.ts` — Express app on port 3001; CORS for localhost:3000; all routers mounted
  - [x] `server/routes/goals.ts` — full CRUD + cascade delete + `syncGoalMetrics`
  - [x] `server/routes/tasks.ts` — full CRUD + toggle + task notes CRUD + `deleteTaskCascade()`
  - [x] `server/routes/files.ts` — multer upload to `server/uploads/`; file streaming; delete
  - [x] `server/routes/notes.ts` — brain dump notes CRUD
  - [x] `server/routes/events.ts` — events CRUD
  - [x] `server/routes/resources.ts` — resources with `?goal_id` / `?task_id` filter + edge-based linking
  - [x] `server/routes/edges.ts` — edges CRUD with `?source_id` / `?target_id` filters
  - [x] `src/api/hooks.ts` — React Query hooks replacing all `useLiveQuery` calls; `refetchInterval: 800ms`; hooks: `useGoals`, `useGoal`, `useGoalTasks`, `useTask`, `useTaskNotes`, `useNoteFiles`, `useNotes`, `useEvents`, `useGoalResources`, `useTaskResources`
  - [x] `src/db/queries/goals.ts` — all functions replaced with `fetch('/api/goals/...')` calls
  - [x] `src/db/queries/tasks.ts` — all functions replaced with API fetch calls
  - [x] `src/db/queries/notes.ts` — all functions replaced with API fetch calls
  - [x] `src/db/queries/events.ts` — all functions replaced with API fetch calls
  - [x] `src/db/queries/resources.ts` — all functions replaced with API fetch calls
  - [x] `src/db/queries/edges.ts` — all functions replaced with API fetch calls
  - [x] `src/db/queries/noteFiles.ts` — uploads via `FormData`; files streamed from `/api/task-note-files/data/:id`
  - [x] All views migrated off `useLiveQuery`: `GoalsDashboard`, `GoalDetail`, `ScheduleView`, `BrainDumpView`, `TaskFocusView`, `ResourcesView`, `SettingsView`
  - [x] `ClassificationPopup` migrated to `useGoals()` hook
  - [x] `Sidebar` + `SettingsView` reset calls updated to `POST /api/reset`
  - [x] `main.tsx` — removed Dexie `seedIfEmpty()` call; server seeds on startup
  - [x] `vite.config.ts` — proxy `/api` → `http://localhost:3001`
  - [x] `package.json` — `dev` script uses `concurrently` to run Vite + Express together; new deps: `better-sqlite3`, `multer`, `@tanstack/react-query`, `cors`, `concurrently`
  - [x] TypeScript check: 0 errors post-migration

- [x] **Dynamic goal health status — auto-computed from deadlines and task hours**
  - [x] `computeGoalStatus(goal, tasks, now?)` added to `goalTaskMetrics.ts`
    - [x] Parses ISO deadline; ignores non-parseable strings (e.g. "Q3 2024") gracefully
    - [x] **Risky**: overdue, or <3 days left, or <7 days + <50% done, or hours remaining exceed 1.5× available capacity (4 hrs/day)
    - [x] **Watch**: >20% behind pace, or <14 days + <30% done, or hours pressure >75%
    - [x] **Safe**: on or ahead of schedule pace
    - [x] No deadline fallback: Safe if >60% done, Watch otherwise
  - [x] `GoalsDashboard` — `GoalCard` computes status dynamically via `computeGoalStatus(goal, tasks)`; status badge, top bar color, activity bar color, and summary counters (On Track / Needs Attention / At Risk) all use computed value
  - [x] `GoalDetail` — `dynStatus` replaces `goal.status` for the ring color, status dot, and status label
  - [x] `NewGoalModal` — removed "Health Status" dropdown; always seeds `'Safe'` (display-time computed)
  - [x] `NewGoalWizard` — removed "Initial Health" button group from Step 0 UI and review summary badge; seeds `'Safe'`

---

## Backlog 📋

- [ ] **Real AI subtask suggestions** — `subtaskSuggestions.ts` is local heuristics; hook into Gemini API (key already in `.env`)
  - [ ] Unit: test the heuristic fallback path independently of the API call

- [ ] **Brain Dump NLP** — ContextRail "Parsed Tasks" and "Suggested Action" use hardcoded DB JSON; extract real tasks from note text
  - [ ] Unit: tokenizer / task-extraction pure function

- [ ] **OO Classification Popup** — `ClassificationPopup.tsx` partially implemented; finish the classification-to-action flow

- [ ] **Schedule week navigation** — prev/next week buttons currently just show toasts; wire to real date offsets + filter events by `week_start`

- [ ] **Graph view** — schema has full edges/nodes; build a visualization (e.g., react-flow or D3 canvas)

- [ ] **Daily Score tracking** — `daily_scores` table exists but nothing writes to it; add end-of-day score entry UI

- [ ] **Goal `overdue` flag** — `overdue` field exists in schema; nothing computes or persists it; derive from deadline at query time on the server or remove the column

- [ ] **Settings — Copilot Metadata & Diagnose Engine** — currently all fake; define what real output looks like

---

## How to add a new item

1. Add a `- [ ]` bullet here under **Backlog**
2. In your next message, tell me what you need — I'll implement it and move the item to **Done** with sub-task checkboxes + unit tests
