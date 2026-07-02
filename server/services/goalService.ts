import { query, transaction } from '../db.js';
import { generateEntitySummary } from './summaryGenerator.js';
import { queueEmbeddingUpsert, markEmbeddingStale } from './embeddingLifecycle.js';
import { requireISODate } from '../utils/localDate.js';

export interface CreateGoalInput {
  title: string;
  description?: string;
  category?: string;
  status?: string;
  deadline?: string | null;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  category?: string;
  status?: string;
  progress?: number;
  deadline?: string | null;
  overdue?: boolean;
  activity_level?: number;
  archived_at?: string | null;
}

const GOAL_UPDATE_FIELDS = new Set([
  'title', 'description', 'category', 'status', 'progress',
  'deadline', 'overdue', 'activity_level', 'archived_at',
]);

export async function createGoal(input: CreateGoalInput): Promise<string> {
  if (!input.title?.trim()) throw Object.assign(new Error('title required'), { status: 400 });
  requireISODate(input.deadline, 'deadline');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO goals (id,title,description,category,status,progress,deadline,overdue,activity_level,archived_at,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      input.title.trim(),
      input.description ?? '',
      input.category ?? '',
      input.status ?? 'Safe',
      0,
      input.deadline ?? null,
      false,
      1,
      null,
      now,
      now,
    ],
  );
  generateEntitySummary('goal', id).catch(err => console.error('[summary] goal create:', err));
  queueEmbeddingUpsert('goal', id).catch(err => console.error('[embedding] goal create:', err));
  return id;
}

export async function updateGoal(id: string, input: UpdateGoalInput): Promise<void> {
  if ('deadline' in input) requireISODate(input.deadline, 'deadline');
  const { rows } = await query('SELECT id FROM goals WHERE id=$1', [id]);
  if (!rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at=$1'];
  const vals: unknown[] = [now];
  for (const [key, val] of Object.entries(input)) {
    if (GOAL_UPDATE_FIELDS.has(key) && val !== undefined) {
      sets.push(`${key}=$${vals.length + 1}`);
      vals.push(val);
    }
  }
  await query(`UPDATE goals SET ${sets.join(',')} WHERE id=$${vals.length + 1}`, [...vals, id]);
  generateEntitySummary('goal', id).catch(err => console.error('[summary] goal update:', err));
  markEmbeddingStale('goal', id).catch(() => {});
  queueEmbeddingUpsert('goal', id).catch(err => console.error('[embedding] goal update:', err));
}

export async function deleteGoal(goalId: string): Promise<void> {
  // Collect all task IDs (direct + all subtask descendants) before deleting anything
  const { rows: taskRows } = await query<{ id: string }>(
    `WITH RECURSIVE all_tasks AS (
       SELECT id FROM tasks WHERE goal_id = $1
       UNION ALL
       SELECT t.id FROM tasks t JOIN all_tasks a ON t.parent_task_id = a.id
     ) SELECT id FROM all_tasks`,
    [goalId],
  );
  const taskIds = taskRows.map(r => r.id);

  await transaction(async (client) => {
    // Delete resources exclusively attached to goal-level edges (not shared)
    await client.query(
      `DELETE FROM resources WHERE id IN (
         SELECT source_id FROM edges
         WHERE target_id = $1 AND relationship = 'attached_to' AND source_type = 'resource'
           AND source_id NOT IN (
             SELECT source_id FROM edges
             WHERE relationship = 'attached_to' AND source_type = 'resource'
               AND target_id != $1
           )
       )`,
      [goalId],
    );

    if (taskIds.length > 0) {
      // Delete resources exclusively attached to tasks being deleted (not attached to any non-deleted entity)
      await client.query(
        `DELETE FROM resources WHERE id IN (
           SELECT source_id FROM edges
           WHERE source_type = 'resource' AND relationship = 'attached_to'
             AND target_id = ANY($1::text[]) AND target_type = 'task'
             AND source_id NOT IN (
               SELECT source_id FROM edges
               WHERE source_type = 'resource' AND relationship = 'attached_to'
                 AND (target_id != ALL($1::text[]) OR target_type != 'task')
             )
         )`,
        [taskIds],
      );

      // Delete work sessions for tasks being deleted (task_id FK is SET NULL, so explicit delete)
      await client.query('DELETE FROM work_sessions WHERE task_id = ANY($1::text[])', [taskIds]);

      // Delete entity summaries and pending/failed embedding jobs for all tasks
      await client.query(
        "DELETE FROM entity_summaries WHERE entity_type='task' AND entity_id = ANY($1::text[])",
        [taskIds],
      );
      await client.query(
        "DELETE FROM embedding_jobs WHERE entity_type='task' AND entity_id = ANY($1::text[]) AND status IN ('pending','failed')",
        [taskIds],
      );

      // Delete orphan edges where source or target was one of the deleted tasks
      await client.query(
        `DELETE FROM edges WHERE (source_id = ANY($1::text[]) AND source_type = 'task')
                              OR (target_id = ANY($1::text[]) AND target_type = 'task')`,
        [taskIds],
      );

      // Clean derived evidence for deleted tasks
      await client.query(
        "DELETE FROM journal_links WHERE target_type='task' AND target_id = ANY($1::text[])",
        [taskIds],
      );
      await client.query(
        "DELETE FROM extracted_facts WHERE target_type='task' AND target_id = ANY($1::text[])",
        [taskIds],
      );
      await client.query(
        "DELETE FROM entity_aliases WHERE entity_type='task' AND entity_id = ANY($1::text[])",
        [taskIds],
      );
      await client.query(
        "DELETE FROM ai_action_proposals WHERE source_type='task' AND source_id = ANY($1::text[]) AND status='pending'",
        [taskIds],
      );

      // Delete tasks (cascades task_notes, task_note_files, event_task_links)
      await client.query('DELETE FROM tasks WHERE id = ANY($1::text[])', [taskIds]);
    }

    await client.query('DELETE FROM entity_summaries WHERE entity_type=$1 AND entity_id=$2', ['goal', goalId]);
    await client.query("DELETE FROM embedding_jobs WHERE entity_type='goal' AND entity_id=$1 AND status IN ('pending','failed')", [goalId]);
    // Clean derived evidence for the goal itself
    await client.query(
      "DELETE FROM journal_links WHERE target_type='goal' AND target_id=$1",
      [goalId],
    );
    await client.query(
      "DELETE FROM extracted_facts WHERE target_type='goal' AND target_id=$1",
      [goalId],
    );
    await client.query(
      "DELETE FROM entity_aliases WHERE entity_type='goal' AND entity_id=$1",
      [goalId],
    );
    await client.query(
      "DELETE FROM ai_action_proposals WHERE source_type='goal' AND source_id=$1 AND status='pending'",
      [goalId],
    );
    // Delete orphan goal-level edges
    await client.query(
      `DELETE FROM edges WHERE (source_id = $1 AND source_type = 'goal')
                            OR (target_id = $1 AND target_type = 'goal')`,
      [goalId],
    );
    // Delete the goal (cascades milestones, deadlines via ON DELETE CASCADE)
    await client.query('DELETE FROM goals WHERE id = $1', [goalId]);
  });

  // Async cleanup of stored embeddings (non-critical, best-effort)
  query(
    `DELETE FROM embeddings WHERE (entity_type='goal' AND entity_id=$1)
       OR (entity_type='task' AND entity_id = ANY($2::text[]))`,
    [goalId, taskIds.length > 0 ? taskIds : ['__none__']],
  ).catch(err => console.error('[cleanup] goal+task embeddings:', err));
}
