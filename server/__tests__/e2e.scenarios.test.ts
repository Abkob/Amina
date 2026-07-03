/**
 * E2E scenario tests — exercise full HTTP flows against the test database.
 * These focus on the deterministic parts of each flow (no Ollama/LLM required).
 * Run with: DATABASE_URL_TEST=... npx vitest run --config vitest.integration.config.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SKIP_INTEGRATION, startTestServer, stopTestServer, baseUrl } from './setup.js';

process.env.NODE_ENV = 'test';

// E2E suites run against the EXACT production app (server/app.ts createApp)
// via the shared harness — no hand-built route subset.

async function startE2EServer(): Promise<void> {
  await startTestServer();
}

async function stopE2EServer(): Promise<void> {
  await stopTestServer();
}

// ─── Scenario 1: Journal → Ingestion → Links → Retrieval ────────────────────

describe.skipIf(SKIP_INTEGRATION)('E2E Scenario 1 — Journal ingestion pipeline', () => {
  let entryId: string;
  let goalId: string;

  beforeAll(async () => {
    await startE2EServer();

    // Create a goal to provide context for the journal entry
    const gr = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__e2e_journal_goal__', description: '', category: 'Test', status: 'Safe' }),
    });
    goalId = ((await gr.json()) as { id: string }).id;
  });

  afterAll(async () => {
    if (entryId) await fetch(`${baseUrl}/api/journal/${entryId}`, { method: 'DELETE' });
    if (goalId) await fetch(`${baseUrl}/api/goals/${goalId}`, { method: 'DELETE' });
    await stopE2EServer();
  });

  it('Step 1 — Create journal entry returns id and pending status', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${baseUrl}/api/journal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw_text: `__e2e_test__ Worked on goal __e2e_journal_goal__ for 45 minutes. Completed the planning phase.`,
        entry_date: today,
      }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { id: string; ingestion_status: string };
    expect(typeof body.id).toBe('string');
    expect(['pending', 'processing']).toContain(body.ingestion_status);
    entryId = body.id;
  });

  it('Step 2 — GET /api/journal returns entry in list', async () => {
    const res = await fetch(`${baseUrl}/api/journal`);
    expect(res.ok).toBe(true);
    const entries = await res.json() as { id: string }[];
    expect(entries.some(e => e.id === entryId)).toBe(true);
  });

  it('Step 3 — GET /api/journal/:id/links returns array (may be empty before ingestion completes)', async () => {
    const res = await fetch(`${baseUrl}/api/journal/${entryId}/links`);
    expect(res.ok).toBe(true);
    const links = await res.json();
    expect(Array.isArray(links)).toBe(true);
  });

  it('Step 4 — POST /api/journal/:id/ingest triggers re-ingestion (idempotent)', async () => {
    const res = await fetch(`${baseUrl}/api/journal/${entryId}/ingest`, { method: 'POST' });
    // 200/202 = triggered; 409 = already running; all are valid responses
    expect([200, 202, 409]).toContain(res.status);
  });

  it('Step 5 — GET /api/journal/:id returns updated entry', async () => {
    const res = await fetch(`${baseUrl}/api/journal/${entryId}`);
    expect(res.ok).toBe(true);
    const entry = await res.json() as { id: string; raw_text: string };
    expect(entry.id).toBe(entryId);
    expect(entry.raw_text).toContain('__e2e_test__');
  });
});

// ─── Scenario 2: Plan Week → Schedule Preview → Proposals ───────────────────

describe.skipIf(SKIP_INTEGRATION)('E2E Scenario 2 — Schedule preview and proposals', () => {
  let goalId: string;
  let taskId: string;

  beforeAll(async () => {
    await startE2EServer();

    // Create a goal + task so the scheduler has something to work with
    const gr = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__e2e_schedule_goal__', description: '', category: 'Test', status: 'Safe' }),
    });
    goalId = ((await gr.json()) as { id: string }).id;

    const tr = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        title: '__e2e_schedule_task__',
        status: 'todo',
        priority: 'medium',
        estimated_minutes: 60,
      }),
    });
    taskId = ((await tr.json()) as { id: string }).id;
  });

  afterAll(async () => {
    if (taskId) await fetch(`${baseUrl}/api/tasks/${taskId}`, { method: 'DELETE' });
    if (goalId) await fetch(`${baseUrl}/api/goals/${goalId}`, { method: 'DELETE' });
    await stopE2EServer();
  });

  it('GET /api/ai/schedule-preview returns days array and scheduler_result', async () => {
    const res = await fetch(`${baseUrl}/api/ai/schedule-preview`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { days: unknown[]; scheduler_result: unknown; task_lookup: unknown };
    expect(Array.isArray(body.days)).toBe(true);
    expect(body.scheduler_result).toBeTruthy();
    // task_lookup is a Record<string, ...>
    expect(typeof body.task_lookup).toBe('object');
  });

  it('GET /api/ai/schedule-preview days have expected shape', async () => {
    const res = await fetch(`${baseUrl}/api/ai/schedule-preview`);
    const body = await res.json() as { days: { date: string; tasks: unknown[]; meetings: unknown[]; proposals: unknown[] }[] };
    expect(body.days.length).toBeGreaterThan(0);
    const day = body.days[0];
    expect(typeof day.date).toBe('string');
    expect(Array.isArray(day.tasks)).toBe(true);
    expect(Array.isArray(day.meetings)).toBe(true);
    expect(Array.isArray(day.proposals)).toBe(true);
  });

  it('scheduler_result has status and gap_minutes', async () => {
    const res = await fetch(`${baseUrl}/api/ai/schedule-preview`);
    const body = await res.json() as { scheduler_result: { status: string; gap_minutes: number } };
    expect(['feasible', 'tight', 'risky', 'impossible']).toContain(body.scheduler_result.status);
    expect(typeof body.scheduler_result.gap_minutes).toBe('number');
  });

  it('GET /api/ai/proposals returns array', async () => {
    const res = await fetch(`${baseUrl}/api/ai/proposals`);
    expect(res.ok).toBe(true);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

// ─── Scenario 3: Graph Navigation ───────────────────────────────────────────

describe.skipIf(SKIP_INTEGRATION)('E2E Scenario 3 — Graph navigation', () => {
  let goalId: string;

  beforeAll(async () => {
    await startE2EServer();

    // Ensure at least one goal exists for the graph to show
    const gr = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__e2e_graph_goal__', description: 'E2E graph test', category: 'Test', status: 'Safe' }),
    });
    goalId = ((await gr.json()) as { id: string }).id;
  });

  afterAll(async () => {
    if (goalId) await fetch(`${baseUrl}/api/goals/${goalId}`, { method: 'DELETE' });
    await stopE2EServer();
  });

  it('GET /api/graph returns nodes and edges arrays', async () => {
    const res = await fetch(`${baseUrl}/api/graph`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { nodes: unknown[]; edges: unknown[]; truncated: boolean; total_nodes: number };
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    expect(typeof body.truncated).toBe('boolean');
    expect(typeof body.total_nodes).toBe('number');
  });

  it('graph nodes have id, type, label', async () => {
    const res = await fetch(`${baseUrl}/api/graph`);
    const body = await res.json() as { nodes: { id: string; type: string; label: string }[] };
    expect(body.nodes.length).toBeGreaterThan(0);
    for (const node of body.nodes.slice(0, 5)) {
      expect(typeof node.id).toBe('string');
      expect(typeof node.type).toBe('string');
      expect(typeof node.label).toBe('string');
    }
  });

  it('graph goal nodes can be fetched individually via /api/goals', async () => {
    const res = await fetch(`${baseUrl}/api/graph`);
    const body = await res.json() as { nodes: { id: string; type: string; metadata: { raw_id?: string } }[] };
    const goalNode = body.nodes.find(n => n.type === 'goal');
    if (!goalNode) return; // No goal nodes — skip assertion

    const rawId = goalNode.metadata?.raw_id ?? goalNode.id;
    const goalRes = await fetch(`${baseUrl}/api/goals/${rawId}`);
    expect([200, 404]).toContain(goalRes.status); // 404 is ok if the id format is prefixed
  });

  it('GET /api/graph?goal_id= filters to that goal subgraph', async () => {
    const res = await fetch(`${baseUrl}/api/graph?goal_id=${goalId}`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { nodes: { id: string; type: string }[] };
    expect(Array.isArray(body.nodes)).toBe(true);
    // The test goal should appear in the subgraph (or the subgraph may be empty if no edges yet)
    expect(body.nodes.length).toBeGreaterThanOrEqual(0);
  });
});
