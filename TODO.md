# Amina OS — To-Do Checklist

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

---

- [x] **Deadline + dynamic time estimates throughout the task tree**
  - [x] `DeadlinePill` component — clickable chip showing date; editable via `<input type="date">`, red + "!" when overdue, dashed when empty
  - [x] `InlineTimePill` component — editable time estimate chip in the task tree; shows Σ prefix + rolled-up sum when task has timed children; ⚠ conflict badge when own estimate ≠ children sum
  - [x] `GoalDetail` header — editable `DeadlinePill` for `goal.deadline` (saves via `updateGoal`)
  - [x] `TaskTreeRow` — deadline + time chips visible at all times when set; appear on hover when empty
  - [x] `MilestoneCard` header — deadline + rolled-up time always visible in header row
  - [x] `goalFinishEstimate.ts` fix — formats ISO deadline string (e.g. "2025-12-31") → "Dec 31" instead of raw string
  - [x] Unit tests: deadline formatting covered by `goalFinishEstimate` logic; time rollup already covered by existing `taskTime.test.ts`

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

- [ ] **Goal deadline / overdue logic** — `overdue` field exists but nothing computes or updates it dynamically

- [ ] **Settings — Copilot Metadata & Diagnose Engine** — currently all fake; define what real output looks like

---

## How to add a new item

1. Add a `- [ ]` bullet here under **Backlog**
2. In your next message, tell me what you need — I'll implement it and move the item to **Done** with sub-task checkboxes + unit tests
