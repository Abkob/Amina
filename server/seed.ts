import { db } from './db.js';
import { INITIAL_GOALS, INITIAL_EVENTS, INITIAL_NOTES } from '../src/data.js';

function now() { return new Date().toISOString(); }

export function seedIfEmpty() {
  const count = (db.prepare('SELECT COUNT(*) as n FROM goals').get() as { n: number }).n;
  if (count > 0) return;
  runSeed();
}

export function resetAndSeed() {
  db.prepare('DELETE FROM task_note_files').run();
  db.prepare('DELETE FROM task_notes').run();
  db.prepare('DELETE FROM tasks').run();
  db.prepare('DELETE FROM edges').run();
  db.prepare('DELETE FROM resources').run();
  db.prepare('DELETE FROM goals').run();
  db.prepare('DELETE FROM notes').run();
  db.prepare('DELETE FROM events').run();
  db.prepare('DELETE FROM daily_scores').run();
  db.prepare('DELETE FROM tags').run();
  db.prepare('DELETE FROM entity_tags').run();
  runSeed();
}

function runSeed() {
  const ts = now();
  const insertGoal = db.prepare(`INSERT OR IGNORE INTO goals (id,title,description,category,status,progress,deadline,overdue,activity_level,archived_at,created_at,updated_at)
    VALUES (@id,@title,@description,@category,@status,@progress,@deadline,@overdue,@activity_level,@archived_at,@created_at,@updated_at)`);
  const insertTask = db.prepare(`INSERT OR IGNORE INTO tasks (id,goal_id,parent_task_id,title,description,status,priority,kind,critical_path_status,tags_json,due_date,estimated_duration,completed,position,created_at,updated_at)
    VALUES (@id,@goal_id,@parent_task_id,@title,@description,@status,@priority,@kind,@critical_path_status,@tags_json,@due_date,@estimated_duration,@completed,@position,@created_at,@updated_at)`);
  const insertEdge = db.prepare(`INSERT OR IGNORE INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at)
    VALUES (@id,@source_id,@source_type,@target_id,@target_type,@relationship,@metadata,@created_at)`);
  const insertResource = db.prepare(`INSERT OR IGNORE INTO resources (id,title,url,type,info,created_at) VALUES (@id,@title,@url,@type,@info,@created_at)`);
  const insertNote = db.prepare(`INSERT OR IGNORE INTO notes (id,title,content,type,date_str,suggested_action_text,suggested_action_applied,suggested_action_ignored,extracted_tasks_json,relevant_docs_json,created_at,updated_at)
    VALUES (@id,@title,@content,@type,@date_str,@suggested_action_text,@suggested_action_applied,@suggested_action_ignored,@extracted_tasks_json,@relevant_docs_json,@created_at,@updated_at)`);
  const insertEvent = db.prepare(`INSERT OR IGNORE INTO events (id,title,type,day_index,start_hour,duration_hours,time_str,description,week_start,connected_resource_json,created_at,updated_at)
    VALUES (@id,@title,@type,@day_index,@start_hour,@duration_hours,@time_str,@description,@week_start,@connected_resource_json,@created_at,@updated_at)`);

  const seedAll = db.transaction(() => {
    for (const g of INITIAL_GOALS) {
      insertGoal.run({ id: g.id, title: g.title, description: g.description, category: g.category,
        status: g.status, progress: g.progress, deadline: g.targetQuarter, overdue: g.overdue ? 1 : 0,
        activity_level: g.activityLevel, archived_at: null, created_at: ts, updated_at: ts });

      for (let i = 0; i < g.criticalPath.length; i++) {
        const cp = g.criticalPath[i];
        const status = cp.status === 'Completed' ? 'done' : cp.status === 'In Progress' ? 'in_progress' : 'todo';
        insertTask.run({ id: cp.id, goal_id: g.id, parent_task_id: null, title: cp.title,
          description: cp.description, status, priority: 'medium', kind: 'critical_path',
          critical_path_status: cp.status, tags_json: JSON.stringify(cp.tags ?? []),
          due_date: null, estimated_duration: null, completed: cp.status === 'Completed' ? 1 : 0, position: i, created_at: ts, updated_at: ts });
        insertEdge.run({ id: crypto.randomUUID(), source_id: g.id, source_type: 'goal', target_id: cp.id,
          target_type: 'task', relationship: 'contains', metadata: JSON.stringify({ kind: 'critical_path' }), created_at: ts });
      }

      for (let i = 0; i < g.aiTasks.length; i++) {
        const at = g.aiTasks[i];
        insertTask.run({ id: at.id, goal_id: g.id, parent_task_id: null, title: at.title,
          description: '', status: at.completed ? 'done' : 'todo', priority: 'medium', kind: 'ai_generated',
          critical_path_status: null, tags_json: '[]', due_date: null, estimated_duration: at.duration,
          completed: at.completed ? 1 : 0, position: i, created_at: ts, updated_at: ts });
        insertEdge.run({ id: crypto.randomUUID(), source_id: g.id, source_type: 'goal', target_id: at.id,
          target_type: 'task', relationship: 'contains', metadata: JSON.stringify({ kind: 'ai_generated' }), created_at: ts });
      }

      const na = g.nextAction;
      insertTask.run({ id: na.id, goal_id: g.id, parent_task_id: null, title: na.text,
        description: '', status: na.completed ? 'done' : 'todo', priority: 'high', kind: 'next_action',
        critical_path_status: null, tags_json: '[]', due_date: null, estimated_duration: null,
        completed: na.completed ? 1 : 0, position: -1, created_at: ts, updated_at: ts });
      insertEdge.run({ id: crypto.randomUUID(), source_id: g.id, source_type: 'goal', target_id: na.id,
        target_type: 'task', relationship: 'contains', metadata: JSON.stringify({ kind: 'next_action' }), created_at: ts });

      for (const r of g.resources) {
        insertResource.run({ id: r.id, title: r.title, url: null,
          type: r.type === 'other' ? 'link' : r.type, info: r.info, created_at: ts });
        insertEdge.run({ id: crypto.randomUUID(), source_id: r.id, source_type: 'resource',
          target_id: g.id, target_type: 'goal', relationship: 'attached_to', metadata: null, created_at: ts });
      }
    }

    for (const e of INITIAL_EVENTS) {
      insertEvent.run({ id: e.id, title: e.title, type: e.type, day_index: e.dayIndex,
        start_hour: e.startHour, duration_hours: e.durationHours, time_str: e.timeStr,
        description: e.description, week_start: null,
        connected_resource_json: e.connectedResource ? JSON.stringify(e.connectedResource) : null,
        created_at: ts, updated_at: ts });
    }

    for (const n of INITIAL_NOTES) {
      insertNote.run({ id: n.id, title: n.title, content: n.content, type: 'capture',
        date_str: n.dateStr, suggested_action_text: n.suggestedAction?.text ?? null,
        suggested_action_applied: n.suggestedAction?.applied ? 1 : 0,
        suggested_action_ignored: n.suggestedAction?.ignored ? 1 : 0,
        extracted_tasks_json: JSON.stringify(n.extractedTasks),
        relevant_docs_json: JSON.stringify(n.relevantDocs), created_at: ts, updated_at: ts });
    }
  });

  seedAll();
  console.log('[seed] Database seeded with initial data');
}
