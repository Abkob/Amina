import type { DBMeeting } from '../schema';
import { apiFetch } from '../../utils/apiFetch';

const API = '/api/meetings';

export async function getMeetingsByGoal(goalId: string): Promise<DBMeeting[]> {
  return apiFetch<DBMeeting[]>(`${API}?goal_id=${goalId}`);
}

export async function getAllMeetings(): Promise<DBMeeting[]> {
  return apiFetch<DBMeeting[]>(API);
}

type CreateMeetingInput = Pick<DBMeeting, 'title' | 'scheduled_at' | 'goal_id'> &
  Partial<Pick<DBMeeting, 'location' | 'notes' | 'duration_minutes' | 'milestone_id' | 'summary'>>;

export async function createMeeting(data: CreateMeetingInput): Promise<string> {
  const { id } = await apiFetch<{ id: string }>(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return id;
}

export async function updateMeeting(
  id: string,
  data: Partial<Pick<DBMeeting, 'title' | 'scheduled_at' | 'location' | 'notes' | 'duration_minutes' | 'milestone_id' | 'summary'>>,
): Promise<void> {
  await apiFetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteMeeting(id: string): Promise<void> {
  await apiFetch(`${API}/${id}`, { method: 'DELETE' });
}
