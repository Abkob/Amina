import Dexie, { type EntityTable } from 'dexie';
import type {
  DBGoal, DBTask, DBTaskNote, DBNote, DBResource,
  DBEvent, DBDailyScore, DBEdge, DBTag, DBEntityTag,
} from './schema';

export class AminaDB extends Dexie {
  goals!:       EntityTable<DBGoal,       'id'>;
  tasks!:       EntityTable<DBTask,       'id'>;
  task_notes!:  EntityTable<DBTaskNote,   'id'>;
  notes!:       EntityTable<DBNote,       'id'>;
  resources!:   EntityTable<DBResource,   'id'>;
  events!:      EntityTable<DBEvent,      'id'>;
  daily_scores!:EntityTable<DBDailyScore, 'id'>;
  edges!:       EntityTable<DBEdge,       'id'>;
  tags!:        EntityTable<DBTag,        'id'>;
  entity_tags!: EntityTable<DBEntityTag,  'id'>;

  constructor() {
    super('amina-os-v3');

    this.version(1).stores({
      // Primary key first, then all indexed columns
      goals:
        'id, status, category, deadline, overdue, created_at',
      tasks:
        'id, goal_id, parent_task_id, status, kind, priority, due_date, completed, created_at',
      task_notes:
        'id, task_id, created_at',
      notes:
        'id, type, suggested_action_applied, created_at',
      resources:
        'id, type, created_at',
      events:
        'id, type, day_index, week_start, created_at',
      daily_scores:
        'id, &date',                // & = unique constraint on date
      edges:
        'id, source_id, target_id, source_type, target_type, relationship, [source_id+target_id]',
      tags:
        'id, &name',
      entity_tags:
        'id, entity_id, tag_id, [entity_id+entity_type]',
    });
  }
}

export const db = new AminaDB();
