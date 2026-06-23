# Updates

This file summarizes the goal system changes added during this round of work.

## Main Fixes

- Fixed the app wiring so the goal creation flow opens the actual new goal wizard.
- Fixed refresh behavior by keeping goal data, options, archive state, tasks, resources, and progress in IndexedDB instead of relying on temporary mock state.
- Added visible "Needs implementation" labels anywhere the UI is still mock-based or AI-placeholder-based, so unfinished features are easier to spot.
- Reworked goal categories into user-defined "Goal Umbrellas" managed from Settings instead of relying on random hardcoded categories.
- Made the goal target deadline optional. Goals can now estimate finish timing from task due dates, task counts, and time estimates.
- Fixed goal progress so it reflects actual completed task state instead of static or mock percentages.
- Fixed activity level so it is based on real recent task updates, completed tasks, and active in-progress work.

## Goal And Task Features Added

- Added archived goals. Archived goals keep their tasks, resources, and progress, but they are hidden from the main active/completed views.
- Added expandable subtasks, including nested child tasks.
- Added a dedicated focus page for any task or section.
- Replaced the single section notes editor with a daily section journal.
- Section journal entries are stored as separate task notes, so each task can have multiple dated entries.
- New journal entries append under the current date instead of replacing previous notes.
- Added resources on task focus pages.
- Added file upload from the file explorer. The app stores file names and sizes as resources.
- Added goal-level file upload from the file explorer.
- Added inline title editing for goals, milestones, and subtasks.
- Added manual child task creation from both the goal detail page and the focus page.

## Progress And Estimate Logic

- Added `goalTaskMetrics` so progress is calculated from countable leaf tasks.
- Parent wrapper tasks no longer incorrectly inflate progress. A parent with child tasks lets the child tasks count.
- Added optional task progress weight with `weight_percent`.
- If no weights are set, each countable task shares progress equally.
- If some weights are set, unweighted tasks share the remaining percent.
- Added normalized time needed with `estimated_minutes`.
- Time input accepts values like `45m`, `1.5h`, and `1h 30m`.
- Old duration strings like `Est. 1 hr` are still understood as fallback data.
- Finish estimates now use explicit task time when available, then fall back to default task time.

## Card Widget Behavior

- The progress and time planning card widgets now only appear for the currently open section on that section's dedicated focus page.
- The goal detail page stays cleaner and only shows the goal structure, completion controls, section titles, resources, and the button to open a focus page.
- Parent focus pages show child sections as navigation rows only. To edit a child section's progress weight or time needed, open that child section's own focus page.
- To edit a section's progress weight or time needed, open that section with the focus page button, then use the `Progress` and `Time Needed` cards near the top of the page.

## Files Added Or Heavily Updated

- `src/components/NeedsImplementationBadge.tsx`
- `src/utils/goalTaskMetrics.ts`
- `src/utils/goalFinishEstimate.ts`
- `src/utils/taskTime.ts`
- `src/views/TaskFocusView.tsx`
- `src/views/GoalDetail.tsx`
- `src/views/GoalsDashboard.tsx`
- `src/views/SettingsView.tsx`
- `src/db/schema.ts`
- `src/db/queries/tasks.ts`
- `src/db/queries/goals.ts`
- `src/store/useAppStore.ts`

## Verification

- TypeScript check passes with `npm run lint`.
- Production build passes with `npm run build`.
- Browser verification was done on `http://localhost:3000/`.
- The existing Vite large chunk warning still appears during build.
