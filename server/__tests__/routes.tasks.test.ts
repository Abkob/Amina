import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, stopTestServer, baseUrl, SKIP_INTEGRATION } from './setup.js';

describe.skipIf(SKIP_INTEGRATION)('GET /api/tasks (integration)', () => {
  beforeAll(startTestServer);
  afterAll(stopTestServer);

  it('returns an array', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`);
    expect(res.ok).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('respects limit param (max 500)', async () => {
    const res = await fetch(`${baseUrl}/api/tasks?limit=3`);
    expect(res.ok).toBe(true);
    const body = await res.json() as unknown[];
    expect(body.length).toBeLessThanOrEqual(3);
  });

  it('returns 404 for unknown task id', async () => {
    const res = await fetch(`${baseUrl}/api/tasks/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });
});

describe.skipIf(SKIP_INTEGRATION)('POST /api/tasks (integration)', () => {
  let createdGoalId: string;
  let createdTaskId: string;

  beforeAll(async () => {
    await startTestServer();
    const r = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__test_goal_for_task__', description: '', category: 'Test', status: 'Safe' }),
    });
    createdGoalId = ((await r.json()) as { id: string }).id;
  });

  afterAll(async () => {
    if (createdTaskId) await fetch(`${baseUrl}/api/tasks/${createdTaskId}`, { method: 'DELETE' });
    if (createdGoalId) await fetch(`${baseUrl}/api/goals/${createdGoalId}`, { method: 'DELETE' });
    await stopTestServer();
  });

  it('creates a task under a goal', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_id: createdGoalId, title: '__test_task__', status: 'todo', priority: 'low' }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { id: string };
    expect(typeof body.id).toBe('string');
    createdTaskId = body.id;
  });

  it('returns the task with goal filter', async () => {
    const res = await fetch(`${baseUrl}/api/tasks?goal_id=${createdGoalId}`);
    expect(res.ok).toBe(true);
    const tasks = await res.json() as { id: string }[];
    expect(tasks.some(t => t.id === createdTaskId)).toBe(true);
  });
});
