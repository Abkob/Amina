import { db } from './db';
import { INITIAL_GOALS, INITIAL_EVENTS, INITIAL_NOTES } from '../data';
import type { DBGoal, DBTask, DBNote, DBResource, DBEvent } from './schema';
import { addEdge } from './queries/edges';

const now = new Date().toISOString();

export async function seedIfEmpty(): Promise<void> {
  const goalCount = await db.goals.count();
  if (goalCount > 0) return;
  await runSeed();
}

export async function resetAndSeed(): Promise<void> {
  await db.transaction('rw', [
    db.goals, db.tasks, db.task_notes, db.notes,
    db.resources, db.events, db.daily_scores, db.edges,
    db.tags, db.entity_tags,
  ], async () => {
    await Promise.all([
      db.goals.clear(), db.tasks.clear(), db.task_notes.clear(),
      db.notes.clear(), db.resources.clear(), db.events.clear(),
      db.daily_scores.clear(), db.edges.clear(),
      db.tags.clear(), db.entity_tags.clear(),
    ]);
  });
  await runSeed();
}

async function runSeed(): Promise<void> {
  await db.transaction(
    'rw',
    [db.goals, db.tasks, db.task_notes, db.notes, db.resources, db.events, db.edges],
    async () => {
      // ── Goals + their tasks + resources ─────────────────────────────────
      for (const g of INITIAL_GOALS) {
        const goal: DBGoal = {
          id: g.id,
          title: g.title,
          description: g.description,
          category: g.category,
          status: g.status,
          progress: g.progress,
          deadline: g.targetQuarter,
          overdue: g.overdue,
          activity_level: g.activityLevel,
          archived_at: null,
          created_at: now,
          updated_at: now,
        };
        await db.goals.add(goal);

        // Critical path items
        for (let i = 0; i < g.criticalPath.length; i++) {
          const cp = g.criticalPath[i];
          const task: DBTask = {
            id: cp.id,
            goal_id: g.id,
            parent_task_id: null,
            title: cp.title,
            description: cp.description,
            status: cp.status === 'Completed' ? 'done' : cp.status === 'In Progress' ? 'in_progress' : 'todo',
            priority: 'medium',
            kind: 'critical_path',
            critical_path_status: cp.status,
            tags_json: JSON.stringify(cp.tags ?? []),
            due_date: null,
            estimated_duration: null,
            completed: cp.status === 'Completed',
            position: i,
            created_at: now,
            updated_at: now,
          };
          await db.tasks.add(task);
          await addEdge({ source_id: g.id, source_type: 'goal', target_id: task.id, target_type: 'task', relationship: 'contains', metadata: JSON.stringify({ kind: 'critical_path' }) });
        }

        // AI-generated tasks
        for (let i = 0; i < g.aiTasks.length; i++) {
          const at = g.aiTasks[i];
          const task: DBTask = {
            id: at.id,
            goal_id: g.id,
            parent_task_id: null,
            title: at.title,
            description: '',
            status: at.completed ? 'done' : 'todo',
            priority: 'medium',
            kind: 'ai_generated',
            critical_path_status: null,
            tags_json: '[]',
            due_date: null,
            estimated_duration: at.duration,
            completed: at.completed,
            position: i,
            created_at: now,
            updated_at: now,
          };
          await db.tasks.add(task);
          await addEdge({ source_id: g.id, source_type: 'goal', target_id: task.id, target_type: 'task', relationship: 'contains', metadata: JSON.stringify({ kind: 'ai_generated' }) });
        }

        // Next action (pinned task)
        const naTask: DBTask = {
          id: g.nextAction.id,
          goal_id: g.id,
          parent_task_id: null,
          title: g.nextAction.text,
          description: '',
          status: g.nextAction.completed ? 'done' : 'todo',
          priority: 'high',
          kind: 'next_action',
          critical_path_status: null,
          tags_json: '[]',
          due_date: null,
          estimated_duration: null,
          completed: g.nextAction.completed,
          position: -1,
          created_at: now,
          updated_at: now,
        };
        await db.tasks.add(naTask);
        await addEdge({ source_id: g.id, source_type: 'goal', target_id: naTask.id, target_type: 'task', relationship: 'contains', metadata: JSON.stringify({ kind: 'next_action' }) });

        // Resources
        for (const r of g.resources) {
          const resource: DBResource = {
            id: r.id,
            title: r.title,
            url: null,
            type: r.type === 'other' ? 'link' : r.type,
            info: r.info,
            read_state: 'Unread',
            next_action: '',
            tags_json: '[]',
            created_at: now,
          };
          await db.resources.add(resource);
          await addEdge({ source_id: r.id, source_type: 'resource', target_id: g.id, target_type: 'goal', relationship: 'attached_to', metadata: null });
        }
      }

      // ── Events ────────────────────────────────────────────────────────────
      for (const e of INITIAL_EVENTS) {
        const event: DBEvent = {
          id: e.id,
          title: e.title,
          type: e.type,
          day_index: e.dayIndex,
          start_hour: e.startHour,
          duration_hours: e.durationHours,
          time_str: e.timeStr,
          description: e.description,
          week_start: null,
          connected_resource_json: e.connectedResource ? JSON.stringify(e.connectedResource) : null,
          created_at: now,
          updated_at: now,
        };
        await db.events.add(event);
        if (e.parentGoalId) {
          await addEdge({ source_id: e.id, source_type: 'event', target_id: e.parentGoalId, target_type: 'goal', relationship: 'schedules', metadata: null });
        }
      }

      // ── Notes ─────────────────────────────────────────────────────────────
      for (const n of INITIAL_NOTES) {
        const note: DBNote = {
          id: n.id,
          title: n.title,
          content: n.content,
          type: 'capture',
          date_str: n.dateStr,
          suggested_action_text:    n.suggestedAction?.text ?? null,
          suggested_action_applied: n.suggestedAction?.applied ?? false,
          suggested_action_ignored: n.suggestedAction?.ignored ?? false,
          extracted_tasks_json: JSON.stringify(n.extractedTasks),
          relevant_docs_json:   JSON.stringify(n.relevantDocs),
          created_at: now,
          updated_at: now,
        };
        await db.notes.add(note);
      }
    }
  );
}
