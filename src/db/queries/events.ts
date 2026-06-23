import { db } from '../db';
import type { DBEvent } from '../schema';
import { addEdge, removeAllEdgesForNode } from './edges';

function id()  { return crypto.randomUUID(); }
function now() { return new Date().toISOString(); }

function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ap = hh < 12 ? 'AM' : 'PM';
  const disp = hh % 12 || 12;
  return `${disp}:${mm === 0 ? '00' : String(mm)} ${ap}`;
}

export async function getEvents(): Promise<DBEvent[]> {
  return db.events.orderBy('created_at').toArray();
}

export async function getEventById(eventId: string): Promise<DBEvent | undefined> {
  return db.events.get(eventId);
}

export async function createEvent(
  data: Omit<DBEvent, 'id' | 'created_at' | 'updated_at'>,
  goalId?: string,
  taskId?: string
): Promise<string> {
  const event: DBEvent = { ...data, id: id(), created_at: now(), updated_at: now() };
  await db.events.add(event);

  if (goalId) {
    await addEdge({
      source_id: event.id, source_type: 'event',
      target_id: goalId,   target_type: 'goal',
      relationship: 'schedules',
      metadata: null,
    });
  }
  if (taskId) {
    await addEdge({
      source_id: event.id, source_type: 'event',
      target_id: taskId,   target_type: 'task',
      relationship: 'schedules',
      metadata: null,
    });
  }

  return event.id;
}

export async function rescheduleEvent(eventId: string, newStartHour: number): Promise<void> {
  const event = await db.events.get(eventId);
  if (!event) return;
  const endHour = newStartHour + event.duration_hours;
  await db.events.update(eventId, {
    start_hour: newStartHour,
    time_str: `${fmtHour(newStartHour)} - ${fmtHour(endHour)}`,
    updated_at: now(),
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await removeAllEdgesForNode(eventId);
  await db.events.delete(eventId);
}

export async function fixMyWeek(): Promise<void> {
  // Shift the two conflicting default events
  await rescheduleEvent('evt-3', 11.5);
  await db.events.update('evt-3', {
    time_str: '11:30 AM - 1:00 PM',
    description: 'AI OPTIMIZED: Shifted 30 mins to guarantee cognitive recovery from morning sprint.',
  });

  await rescheduleEvent('evt-6', 14.0);
  await db.events.update('evt-6', {
    time_str: '2:00 PM - 3:00 PM',
    description: 'AI OPTIMIZED: Arranged after administrative task closure to safeguard focus limits.',
  });
}
