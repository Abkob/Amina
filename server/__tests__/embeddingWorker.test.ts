import { describe, it, expect, afterAll } from 'vitest';
import { SKIP_INTEGRATION } from './setup.js';

// Direct import — no HTTP server needed. NODE_ENV=test makes db.ts use DATABASE_URL_TEST.
process.env.NODE_ENV = 'test';

// Pool cleanup happens once after all suites in this file.
afterAll(async () => {
  if (!SKIP_INTEGRATION) {
    const { pool } = await import('../db.js');
    await pool.end().catch(() => {});
  }
});

describe.skipIf(SKIP_INTEGRATION)('embeddingWorker — reclaimExpiredJobs (integration)', () => {
  it('returns a non-negative count when no jobs are stuck', async () => {
    const { reclaimExpiredJobs } = await import('../services/embeddingWorker.js');
    const reclaimed = await reclaimExpiredJobs();
    expect(typeof reclaimed).toBe('number');
    expect(reclaimed).toBeGreaterThanOrEqual(0);
  });

  it('processEmbeddingJobs returns { processed, failed } shape with empty queue', async () => {
    const { processEmbeddingJobs } = await import('../services/embeddingWorker.js');
    const result = await processEmbeddingJobs(1);
    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('failed');
    expect(typeof result.processed).toBe('number');
    expect(typeof result.failed).toBe('number');
  });
});

describe.skipIf(SKIP_INTEGRATION)('embeddingWorker — unknown action permanently fails (integration)', () => {
  let jobId: string | null = null;

  afterAll(async () => {
    if (jobId) {
      const { query } = await import('../db.js');
      await query('DELETE FROM embedding_jobs WHERE id=$1', [jobId]).catch(() => {});
    }
  });

  it('job with unknown action is marked failed after MAX_ATTEMPTS', async () => {
    const { query } = await import('../db.js');
    const { processEmbeddingJobs } = await import('../services/embeddingWorker.js');

    // Insert a job with an action name that is not 'upsert' or 'delete'.
    // id and created_at are NOT NULL without defaults — must be supplied.
    const { rows } = await query<{ id: string }>(
      `INSERT INTO embedding_jobs
         (id, entity_type, entity_id, chunk_id, action, status, attempts, priority, created_at)
       VALUES ($1, 'task', '00000000-0000-0000-0000-000000000000', NULL, 'unknown_test_action', 'pending', 0, 0, $2)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [crypto.randomUUID(), new Date().toISOString()],
    );

    if (!rows.length) {
      // A pending job with these coords already exists (unique index M-016) — skip.
      return;
    }
    jobId = rows[0].id;

    // Drive 4 cycles — MAX_ATTEMPTS is 3, so job transitions pending→processing→failed.
    // Failed attempts set next_attempt_at (exponential backoff by design); clear it
    // between cycles so the retry is immediately eligible in this test.
    for (let i = 0; i < 4; i++) {
      await processEmbeddingJobs(10);
      await query('UPDATE embedding_jobs SET next_attempt_at=NULL WHERE id=$1', [jobId]);
    }

    const { rows: jobs } = await query<{ status: string; error: string }>(
      'SELECT status, error FROM embedding_jobs WHERE id=$1',
      [jobId],
    );
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].status).toBe('failed');
    expect(jobs[0].error).toMatch(/Unknown embedding job action/i);
  });
});
