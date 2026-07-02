import { db } from '../db';
import type { DBDailyScore } from '../schema';

function id()  { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

function localYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  return localYMD(new Date()); // YYYY-MM-DD in local time, not UTC
}

export async function getTodayScore(): Promise<DBDailyScore | undefined> {
  return db.daily_scores.where('date').equals(todayKey()).first();
}

export async function upsertDailyScore(
  data: Omit<DBDailyScore, 'id' | 'created_at'>
): Promise<string> {
  const existing = await db.daily_scores.where('date').equals(data.date).first();
  if (existing) {
    await db.daily_scores.update(existing.id, data);
    return existing.id;
  }
  const record: DBDailyScore = { ...data, id: id(), created_at: now() };
  await db.daily_scores.add(record);
  return record.id;
}

export async function getScoreHistory(days = 30): Promise<DBDailyScore[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = localYMD(cutoff);

  const all = await db.daily_scores.orderBy('date').reverse().toArray();
  return all.filter(s => s.date >= cutoffStr);
}

export async function recordTasksCompleted(count: number): Promise<void> {
  const key = todayKey();
  const existing = await db.daily_scores.where('date').equals(key).first();
  if (existing) {
    await db.daily_scores.update(existing.id, { tasks_completed: existing.tasks_completed + count });
  } else {
    await upsertDailyScore({
      date: key,
      score: 0,
      mood: 3,
      energy: 3,
      focus: 3,
      tasks_completed: count,
      notes: '',
    });
  }
}
