import { pool } from './db.js';
import { INITIAL_GOALS, INITIAL_EVENTS, INITIAL_NOTES } from '../src/data.js';
import type pg from 'pg';

function now() { return new Date().toISOString(); }

export async function seedIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*) as n FROM goals');
  const count = Number((rows[0] as Record<string, unknown>).n ?? 0);
  if (count > 0) return;
  await runSeed();
}

export async function resetAndSeed() {
  await pool.query('DELETE FROM task_note_files');
  await pool.query('DELETE FROM task_notes');
  await pool.query('DELETE FROM tasks');
  await pool.query('DELETE FROM edges');
  await pool.query('DELETE FROM resources');
  await pool.query('DELETE FROM goals');
  await pool.query('DELETE FROM notes');
  await pool.query('DELETE FROM events');
  await pool.query('DELETE FROM daily_scores');
  await pool.query('DELETE FROM tags');
  await pool.query('DELETE FROM entity_tags');
  await runSeed();
}

async function runSeed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ts = now();

    for (const g of INITIAL_GOALS) {
      await client.query(
        `INSERT INTO goals (id,title,description,category,status,progress,deadline,overdue,activity_level,archived_at,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [g.id, g.title, g.description, g.category, g.status, g.progress, g.targetQuarter ?? null, Boolean(g.overdue), g.activityLevel, null, ts, ts],
      );

      for (let i = 0; i < g.criticalPath.length; i++) {
        const cp = g.criticalPath[i];
        const status = cp.status === 'Completed' ? 'done' : cp.status === 'In Progress' ? 'in_progress' : 'todo';
        await insertTask(client, {
          id: cp.id, goal_id: g.id, parent_task_id: null, title: cp.title,
          description: cp.description, status, priority: 'medium', kind: 'critical_path',
          critical_path_status: cp.status, tags_json: JSON.stringify(cp.tags ?? []),
          due_date: null, estimated_duration: null, completed: cp.status === 'Completed', position: i, ts,
        });
        await insertEdge(client, g.id, 'goal', cp.id, 'task', 'contains', { kind: 'critical_path' }, ts);
      }

      for (let i = 0; i < g.aiTasks.length; i++) {
        const at = g.aiTasks[i];
        await insertTask(client, {
          id: at.id, goal_id: g.id, parent_task_id: null, title: at.title,
          description: '', status: at.completed ? 'done' : 'todo', priority: 'medium', kind: 'ai_generated',
          critical_path_status: null, tags_json: '[]',
          due_date: null, estimated_duration: at.duration, completed: at.completed, position: i, ts,
        });
        await insertEdge(client, g.id, 'goal', at.id, 'task', 'contains', { kind: 'ai_generated' }, ts);
      }

      const na = g.nextAction;
      await insertTask(client, {
        id: na.id, goal_id: g.id, parent_task_id: null, title: na.text,
        description: '', status: na.completed ? 'done' : 'todo', priority: 'high', kind: 'next_action',
        critical_path_status: null, tags_json: '[]',
        due_date: null, estimated_duration: null, completed: na.completed, position: -1, ts,
      });
      await insertEdge(client, g.id, 'goal', na.id, 'task', 'contains', { kind: 'next_action' }, ts);

      for (const r of g.resources) {
        await client.query(
          `INSERT INTO resources (id,title,url,type,info,created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [r.id, r.title, null, r.type === 'other' ? 'link' : r.type, r.info, ts],
        );
        await insertEdge(client, r.id, 'resource', g.id, 'goal', 'attached_to', null, ts);
      }
    }

    for (const e of INITIAL_EVENTS) {
      await client.query(
        `INSERT INTO events (id,title,type,day_index,start_hour,duration_hours,time_str,description,week_start,connected_resource_json,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [e.id, e.title, e.type, e.dayIndex, e.startHour, e.durationHours, e.timeStr, e.description, null,
          e.connectedResource ? JSON.stringify(e.connectedResource) : null, ts, ts],
      );
    }

    for (const n of INITIAL_NOTES) {
      await client.query(
        `INSERT INTO notes (id,title,content,type,date_str,suggested_action_text,suggested_action_applied,suggested_action_ignored,extracted_tasks_json,relevant_docs_json,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [n.id, n.title, n.content, 'capture', n.dateStr,
          n.suggestedAction?.text ?? null,
          Boolean(n.suggestedAction?.applied),
          Boolean(n.suggestedAction?.ignored),
          JSON.stringify(n.extractedTasks),
          JSON.stringify(n.relevantDocs), ts, ts],
      );
    }

    await client.query('COMMIT');
    console.log('[seed] Database seeded with initial data');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] Seed failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function insertTask(client: pg.PoolClient, p: {
  id: string; goal_id: string; parent_task_id: string | null; title: string; description: string;
  status: string; priority: string; kind: string; critical_path_status: string | null;
  tags_json: string; due_date: string | null; estimated_duration: string | null;
  completed: boolean; position: number; ts: string;
}) {
  await client.query(
    `INSERT INTO tasks (id,goal_id,parent_task_id,title,description,status,priority,kind,critical_path_status,tags_json,due_date,estimated_duration,completed,position,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT DO NOTHING`,
    [p.id, p.goal_id, p.parent_task_id, p.title, p.description, p.status, p.priority, p.kind,
      p.critical_path_status, p.tags_json, p.due_date, p.estimated_duration, p.completed, p.position, p.ts, p.ts],
  );
}

async function insertEdge(client: pg.PoolClient, sourceId: string, sourceType: string, targetId: string, targetType: string, relationship: string, metadata: unknown, ts: string) {
  await client.query(
    `INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
    [crypto.randomUUID(), sourceId, sourceType, targetId, targetType, relationship, metadata ? JSON.stringify(metadata) : null, ts],
  );
}
