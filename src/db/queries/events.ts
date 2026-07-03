import type { DBEvent } from '../schema';
import { apiFetch, apiPost, apiPatch, apiDelete } from '../../utils/apiFetch';

const API = '/api';

function fmtHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ap = hh < 12 ? 'AM' : 'PM';
  const disp = hh % 12 || 12;
  return `${disp}:${mm === 0 ? '00' : String(mm)} ${ap}`;
}

export async function getEvents(): Promise<DBEvent[]> {
  return apiFetch<DBEvent[]>(`${API}/events`);
}

export async function createEvent(
  data: Omit<DBEvent, 'id' | 'created_at' | 'updated_at'>,
  _goalId?: string,
  _taskId?: string
): Promise<string> {
  const { id } = await apiPost<{ id: string }>(`${API}/events`, data);
  return id;
}

export async function rescheduleEvent(eventId: string, newStartHour: number): Promise<void> {
  const events = await getEvents();
  const event = events.find(e => e.id === eventId);
  if (!event) return;
  const endHour = newStartHour + event.duration_hours;
  await apiPatch(`${API}/events/${eventId}`, {
    start_hour: newStartHour,
    time_str: `${fmtHour(newStartHour)} - ${fmtHour(endHour)}`,
  });
}

export async function deleteEvent(eventId: string): Promise<void> {
  await apiDelete(`${API}/events/${eventId}`);
}
