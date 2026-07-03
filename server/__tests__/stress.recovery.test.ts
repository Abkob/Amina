/**
 * Stress & recovery tests — concurrency and crash-recovery invariants against
 * the production app on the isolated test database.
 *
 * Covered:
 *  - Concurrent duplicate proposal apply: exactly one wins, rest get 409.
 *  - Concurrent journal creation: no lost writes, all rows durable.
 *  - Embedding worker lease recovery: expired 'processing' leases are reclaimed.
 *  - Concurrent suggestion accept/reject race: one decision wins, other 409s.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { startTestServer, stopTestServer, baseUrl, SKIP_INTEGRATION } from './setup.js';

process.env.NODE_ENV = 'test';

describe.skipIf(SKIP_INTEGRATION)('Stress/recovery — concurrent proposal apply', () => {
  let goalId: string;
  let proposalId: string;

  beforeAll(async () => {
    await startTestServer();
    const gr = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__stress_goal__', description: '', category: 'Test', status: 'Safe' }),
    });
    goalId = ((await gr.json()) as { id: string }).id;

    // Insert a pending create_task proposal directly (no chat model needed)
    const { query } = await import('../db.js');
    proposalId = crypto.randomUUID();
    await query(
      `INSERT INTO ai_action_proposals (id, action_type, action_payload, explanation, confidence, status, source_type, created_at)
       VALUES ($1,'create_task',$2,'stress test',0.9,'pending','test',$3)`,
      [proposalId, JSON.stringify({ goal_id: goalId, title: '__stress_task__', estimated_minutes: 30 }), new Date().toISOString()],
    );
  });

  afterAll(async () => {
    const { query } = await import('../db.js');
    await query(`DELETE FROM tasks WHERE title='__stress_task__'`);
    await query(`DELETE FROM ai_action_proposals WHERE id=$1`, [proposalId]);
    await query(`DELETE FROM edges WHERE source_id=$1 OR target_id=$1`, [goalId]);
    await fetch(`${baseUrl}/api/goals/${goalId}`, { method: 'DELETE' });
    await stopTestServer();
  });

  it('8 parallel applies: exactly one 200, the rest 409, exactly one task created', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        fetch(`${baseUrl}/api/ai/proposals/${proposalId}/apply`, { method: 'POST' }).then(r => r.status),
      ),
    );
    const ok = results.filter(s => s === 200).length;
    const conflict = results.filter(s => s === 409).length;
    expect(ok).toBe(1);
    expect(conflict).toBe(7);

    const { query } = await import('../db.js');
    const { rows } = await query(`SELECT count(*)::int AS n FROM tasks WHERE title='__stress_task__'`);
    expect(Number((rows[0] as { n: number }).n)).toBe(1);
  });
});

describe.skipIf(SKIP_INTEGRATION)('Stress/recovery — concurrent journal creation', () => {
  const createdIds: string[] = [];

  beforeAll(startTestServer);

  afterAll(async () => {
    for (const id of createdIds) {
      await fetch(`${baseUrl}/api/journal/${id}`, { method: 'DELETE' }).catch(() => {});
    }
    await stopTestServer();
  });

  it('5 parallel journal POSTs all commit durable rows', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        fetch(`${baseUrl}/api/journal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: `__stress_journal_${i}__ concurrent write test`, entry_date: '2026-01-15' }),
        }).then(r => r.json() as Promise<{ id: string }>),
      ),
    );
    for (const r of responses) {
      expect(typeof r.id).toBe('string');
      createdIds.push(r.id);
    }
    expect(new Set(createdIds).size).toBe(5);

    const { query } = await import('../db.js');
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM journal_entries WHERE raw_text LIKE '__stress_journal_%'`,
    );
    expect(Number((rows[0] as { n: number }).n)).toBe(5);
  });
});

describe.skipIf(SKIP_INTEGRATION)('Stress/recovery — embedding worker lease recovery', () => {
  let jobId: string;

  beforeAll(startTestServer);

  afterAll(async () => {
    const { query } = await import('../db.js');
    if (jobId) await query('DELETE FROM embedding_jobs WHERE id=$1', [jobId]).catch(() => {});
    await stopTestServer();
  });

  it('a processing job with an expired lease is reclaimed to pending with lease cleared', async () => {
    const { query } = await import('../db.js');
    const { reclaimExpiredJobs } = await import('../services/embeddingWorker.js');

    jobId = crypto.randomUUID();
    const expiredLease = new Date(Date.now() - 60_000).toISOString(); // expired 1 minute ago
    await query(
      `INSERT INTO embedding_jobs (id, entity_type, entity_id, action, status, attempts, priority, created_at, lease_expires_at)
       VALUES ($1,'task','00000000-0000-0000-0000-00000000dead','upsert','processing',1,0,$2,$3)`,
      [jobId, new Date().toISOString(), expiredLease],
    );

    const reclaimed = await reclaimExpiredJobs();
    expect(reclaimed).toBeGreaterThanOrEqual(1);

    const { rows } = await query('SELECT status, lease_expires_at FROM embedding_jobs WHERE id=$1', [jobId]);
    expect((rows[0] as { status: string }).status).toBe('pending');
    expect((rows[0] as { lease_expires_at: string | null }).lease_expires_at).toBeNull();
  });
});

describe.skipIf(SKIP_INTEGRATION)('Stress/recovery — suggestion decision race', () => {
  let topicId: string;
  let goalId: string;
  let suggestionId: string;

  beforeAll(async () => {
    await startTestServer();
    const { query } = await import('../db.js');

    const tr = await fetch(`${baseUrl}/api/topics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `__stress_topic_${crypto.randomUUID().slice(0, 8)}__` }),
    });
    topicId = ((await tr.json()) as { id: string }).id;

    const gr = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '__stress_sugg_goal__', description: '', category: 'Test', status: 'Safe' }),
    });
    goalId = ((await gr.json()) as { id: string }).id;

    // Seed a suggestion row directly (deterministic — no embedding run needed)
    suggestionId = crypto.randomUUID();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO topic_memberships (id, topic_id, entity_type, entity_id, source, status, confidence, evidence_json, reason_codes, created_at, updated_at)
       VALUES ($1,$2,'goal',$3,'ai_suggested','suggested',0.7,'{}','["embedding_similarity"]',$4,$4)`,
      [suggestionId, topicId, goalId, now],
    );
  });

  afterAll(async () => {
    const { query } = await import('../db.js');
    await query('DELETE FROM topic_memberships WHERE topic_id=$1', [topicId]).catch(() => {});
    await query('DELETE FROM topics WHERE id=$1', [topicId]).catch(() => {});
    await query(`DELETE FROM edges WHERE source_id=$1 OR target_id=$1`, [goalId]).catch(() => {});
    await fetch(`${baseUrl}/api/goals/${goalId}`, { method: 'DELETE' }).catch(() => {});
    await stopTestServer();
  });

  it('parallel accept + reject: exactly one decision wins', async () => {
    const [acceptStatus, rejectStatus] = await Promise.all([
      fetch(`${baseUrl}/api/topics/suggestions/${suggestionId}/accept`, { method: 'POST' }).then(r => r.status),
      fetch(`${baseUrl}/api/topics/suggestions/${suggestionId}/reject`, { method: 'POST' }).then(r => r.status),
    ]);
    const outcomes = [acceptStatus, rejectStatus].sort();
    expect(outcomes).toEqual([200, 409]); // one wins, one conflicts

    const { query } = await import('../db.js');
    const { rows } = await query('SELECT status FROM topic_memberships WHERE id=$1', [suggestionId]);
    expect(['accepted', 'rejected']).toContain((rows[0] as { status: string }).status);
  });
});
