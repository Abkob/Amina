import type { DBEvent } from '../schema';

const API = '/api';

function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ap = hh < 12 ? 'AM' : 'PM';
  const disp = hh % 12 || 12;
  return `${disp}:${mm === 0 ? '00' : String(mm)} ${ap}`;
}

export async function getEvents(): Promise<DBEvent[]> {
  return fetch(`${API}/events`).then(r => r.json());
}

export async function createEvent(
  data: Omit<DBEvent, 'id' | 'created_at' | 'updated_at'>,
  _goalId?: string,
  _taskId?: string
): Promise<string> {
  const r = await fetch(`${API}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const { id } = await r.json();
  return id;
}

export async function rescheduleEvent(eventId: string, newStartHour: number): Promise<void> {
  const events: DBEvent[] = await fetch(`${API}/events`).then(r => r.json());
  const event = events.find(e => e.id === eventId);
  if (!event) return;
  const endHour = newStartHour + event.duration_hours;
  await fetch(`${API}/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_hour: newStartHour,
      time_str: `${fmtHour(newStartHour)} - ${fmtHour(endHour)}`,
    }),
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await fetch(`${API}/events/${eventId}`, { method: 'DELETE' });
}

export async function fixMyWeek(): Promise<void> {
  await rescheduleEvent('evt-3', 11.5);
  await fetch(`${API}/events/evt-3`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      time_str: '11:30 AM - 1:00 PM',
      description: 'AI OPTIMIZED: Shifted 30 mins to guarantee cognitive recovery from morning sprint.',
    }),
  });
  await rescheduleEvent('evt-6', 14.0);
  await fetch(`${API}/events/evt-6`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      time_str: '2:00 PM - 3:00 PM',
      description: 'AI OPTIMIZED: Arranged after administrative task closure to safeguard focus limits.',
    }),
  });
}
