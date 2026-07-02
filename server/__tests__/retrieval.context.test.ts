import { describe, it, expect, afterAll } from 'vitest';
import { SKIP_INTEGRATION } from './setup.js';

// Direct import — no HTTP server needed.
process.env.NODE_ENV = 'test';

describe.skipIf(SKIP_INTEGRATION)('buildRetrievalContext (integration)', () => {
  afterAll(async () => {
    const { pool } = await import('../db.js');
    await pool.end().catch(() => {});
  });

  it('returns cards array and vector_degraded flag with no query', async () => {
    const { buildRetrievalContext } = await import('../services/retrieval.js');
    const result = await buildRetrievalContext({ limit: 5 });
    expect(Array.isArray(result.cards)).toBe(true);
    expect(typeof result.vector_degraded).toBe('boolean');
    expect(result.vector_degraded_reason === null || typeof result.vector_degraded_reason === 'string').toBe(true);
  });

  it('each card has entity_type, entity_id, title', async () => {
    const { buildRetrievalContext } = await import('../services/retrieval.js');
    const result = await buildRetrievalContext({ limit: 10 });
    for (const card of result.cards) {
      expect(typeof card.entity_type).toBe('string');
      expect(typeof card.entity_id).toBe('string');
      expect(typeof card.title).toBe('string');
    }
  });

  it('with a text query still returns valid result (vector may be degraded)', async () => {
    const { buildRetrievalContext } = await import('../services/retrieval.js');
    const result = await buildRetrievalContext({ query: 'deadline task', limit: 5 });
    expect(Array.isArray(result.cards)).toBe(true);
    expect(typeof result.vector_degraded).toBe('boolean');
    // vector_degraded_reason is null or string — never undefined
    expect(result.vector_degraded_reason === null || typeof result.vector_degraded_reason === 'string').toBe(true);
  });

  it('respects limit', async () => {
    const { buildRetrievalContext } = await import('../services/retrieval.js');
    const result = await buildRetrievalContext({ limit: 3 });
    expect(result.cards.length).toBeLessThanOrEqual(3);
  });

  it('returns empty cards array when filtering by non-existent goal', async () => {
    const { buildRetrievalContext } = await import('../services/retrieval.js');
    const result = await buildRetrievalContext({
      goalIds: ['00000000-0000-0000-0000-000000000000'],
      limit: 5,
    });
    expect(result.cards).toHaveLength(0);
  });
});
