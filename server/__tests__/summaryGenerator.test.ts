import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, stopTestServer, baseUrl, SKIP_INTEGRATION } from './setup.js';

describe.skipIf(SKIP_INTEGRATION)('summaryGenerator — deterministic summaries (integration)', () => {
  let goalId: string;

  beforeAll(async () => {
    await startTestServer();
    // Create a test goal to generate summaries for
    const res = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '__test_summary_goal__',
        description: 'Integration test goal for summary generation',
        category: 'Test',
        status: 'Safe',
      }),
    });
    const body = await res.json() as { id: string };
    goalId = body.id;
  });

  afterAll(async () => {
    if (goalId) {
      await fetch(`${baseUrl}/api/goals/${goalId}`, { method: 'DELETE' });
    }
    await stopTestServer();
  });

  it('GET /api/goals/:id returns the created goal', async () => {
    const res = await fetch(`${baseUrl}/api/goals/${goalId}`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { id: string; title: string };
    expect(body.title).toBe('__test_summary_goal__');
  });

  it('summary trigger endpoint returns 200 (via goal update)', async () => {
    // Updating a goal title triggers summary regeneration on the server.
    // Production contract is PATCH (the frontend's updateGoal uses PATCH; PUT is not registered).
    const res = await fetch(`${baseUrl}/api/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__test_summary_goal_updated__', description: 'Updated for summary test' }),
    });
    expect(res.ok).toBe(true);
  });

  it('GET /api/goals/:id reflects updated title', async () => {
    const res = await fetch(`${baseUrl}/api/goals/${goalId}`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { title: string };
    expect(body.title).toBe('__test_summary_goal_updated__');
  });
});

describe.skipIf(SKIP_INTEGRATION)('summaryGenerator — journal digest (integration)', () => {
  beforeAll(startTestServer);
  afterAll(stopTestServer);

  it('journal endpoint returns array', async () => {
    const res = await fetch(`${baseUrl}/api/journal`);
    expect(res.ok).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it('creating journal entry returns id with pending status', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${baseUrl}/api/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: '__test_summary_digest__', entry_date: today }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { id: string; ingestion_status: string };
    expect(typeof body.id).toBe('string');
    expect(['pending', 'processing']).toContain(body.ingestion_status);

    // Clean up
    await fetch(`${baseUrl}/api/journal/${body.id}`, { method: 'DELETE' });
  });
});
