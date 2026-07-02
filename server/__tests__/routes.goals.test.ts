import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, stopTestServer, baseUrl, SKIP_INTEGRATION } from './setup.js';

describe.skipIf(SKIP_INTEGRATION)('GET /api/goals (integration)', () => {
  beforeAll(startTestServer);
  afterAll(stopTestServer);

  it('returns an array', async () => {
    const res = await fetch(`${baseUrl}/api/goals`);
    expect(res.ok).toBe(true);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('respects limit param (max 200)', async () => {
    const res = await fetch(`${baseUrl}/api/goals?limit=2`);
    expect(res.ok).toBe(true);
    const body = await res.json() as unknown[];
    expect(body.length).toBeLessThanOrEqual(2);
  });

  it('returns 404 for unknown goal id', async () => {
    const res = await fetch(`${baseUrl}/api/goals/00000000-0000-0000-0000-000000000000`);
    expect(res.status).toBe(404);
  });

  it('health endpoint returns per-goal task array', async () => {
    const res = await fetch(`${baseUrl}/api/goals/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});

describe.skipIf(SKIP_INTEGRATION)('POST /api/goals (integration)', () => {
  beforeAll(startTestServer);
  afterAll(stopTestServer);

  it('creates a goal and returns its id', async () => {
    const res = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__test_goal__', description: '', category: 'Test', status: 'Safe' }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { id: string };
    expect(typeof body.id).toBe('string');

    // Clean up
    await fetch(`${baseUrl}/api/goals/${body.id}`, { method: 'DELETE' });
  });

  it('rejects goal creation with missing title', async () => {
    const res = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'no title' }),
    });
    expect(res.ok).toBe(false);
  });
});
