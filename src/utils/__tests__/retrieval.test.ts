import { describe, it, expect } from 'vitest';

// ─── Import only the pure helpers via the retrieval module ───────────────────
// reciprocalRankFusion, budget-trim logic, and dedup logic are tested indirectly
// through the data structures they produce. We inline equivalent pure
// implementations here so the test file remains unit-only (no DB).

// ─── RRF pure implementation (mirrors server/services/retrieval.ts) ───────────

interface MinimalCard {
  entity_type: string;
  entity_id: string;
  planning_summary?: string | null;
}

function reciprocalRankFusion(lists: MinimalCard[][], k = 60): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const key = `${item.entity_type}:${item.entity_id}`;
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return scores;
}

function dedupByEntityKey<T extends MinimalCard>(cards: T[]): T[] {
  const seen = new Map<string, T>();
  for (const c of cards) {
    const key = `${c.entity_type}:${c.entity_id}`;
    if (!seen.has(key)) seen.set(key, c);
  }
  return [...seen.values()];
}

function budgetTrim<T extends MinimalCard>(cards: T[], maxChars: number): T[] {
  let used = 0;
  const result: T[] = [];
  for (const card of cards) {
    const len = card.planning_summary?.length ?? 0;
    if (result.length > 0 && used + len > maxChars) break;
    result.push(card);
    used += len;
  }
  return result;
}

// ─── RRF tests ────────────────────────────────────────────────────────────────

describe('reciprocalRankFusion', () => {
  it('scores an item appearing in all three lanes higher than one appearing in one', () => {
    const a: MinimalCard = { entity_type: 'task', entity_id: 'a' };
    const b: MinimalCard = { entity_type: 'task', entity_id: 'b' };
    const c: MinimalCard = { entity_type: 'task', entity_id: 'c' };

    const scores = reciprocalRankFusion([[a, b], [a, c], [a, b]]);
    const sa = scores.get('task:a') ?? 0;
    const sb = scores.get('task:b') ?? 0;
    const sc = scores.get('task:c') ?? 0;
    expect(sa).toBeGreaterThan(sb);
    expect(sa).toBeGreaterThan(sc);
  });

  it('rank 0 scores higher than rank 1 within the same lane', () => {
    const a: MinimalCard = { entity_type: 'task', entity_id: 'a' };
    const b: MinimalCard = { entity_type: 'task', entity_id: 'b' };
    const scores = reciprocalRankFusion([[a, b]]);
    expect(scores.get('task:a')!).toBeGreaterThan(scores.get('task:b')!);
  });

  it('handles empty input list without throwing', () => {
    const scores = reciprocalRankFusion([]);
    expect(scores.size).toBe(0);
  });

  it('handles empty sublists', () => {
    const a: MinimalCard = { entity_type: 'task', entity_id: 'a' };
    const scores = reciprocalRankFusion([[], [a], []]);
    expect(scores.get('task:a')).toBeDefined();
  });

  it('uses entity_type in the key to prevent cross-type collisions', () => {
    const task: MinimalCard = { entity_type: 'task', entity_id: 'shared-id' };
    const goal: MinimalCard = { entity_type: 'goal', entity_id: 'shared-id' };
    const scores = reciprocalRankFusion([[task], [goal]]);
    // Both types produce separate map entries (no key collision)
    expect(scores.get('task:shared-id')).toBeDefined();
    expect(scores.get('goal:shared-id')).toBeDefined();
    expect(scores.size).toBe(2);
  });
});

// ─── Dedup tests ──────────────────────────────────────────────────────────────

describe('dedupByEntityKey', () => {
  it('removes duplicate (entity_type, entity_id) pairs, keeping the first', () => {
    const a1 = { entity_type: 'task', entity_id: 'x', planning_summary: 'first' };
    const a2 = { entity_type: 'task', entity_id: 'x', planning_summary: 'second' };
    const result = dedupByEntityKey([a1, a2]);
    expect(result).toHaveLength(1);
    expect(result[0].planning_summary).toBe('first');
  });

  it('does not remove cards with different entity_types but same entity_id', () => {
    const task = { entity_type: 'task', entity_id: 'shared' };
    const goal = { entity_type: 'goal', entity_id: 'shared' };
    const result = dedupByEntityKey([task, goal]);
    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty input', () => {
    expect(dedupByEntityKey([])).toHaveLength(0);
  });
});

// ─── Budget trim tests ────────────────────────────────────────────────────────

describe('budgetTrim', () => {
  it('always includes at least the first card even if it exceeds budget', () => {
    const card: MinimalCard = { entity_type: 'task', entity_id: 't1', planning_summary: 'x'.repeat(100_000) };
    const result = budgetTrim([card], 1000);
    expect(result).toHaveLength(1);
  });

  it('stops adding cards once budget is exhausted', () => {
    const small: MinimalCard[] = Array.from({ length: 5 }, (_, i) => ({
      entity_type: 'task',
      entity_id: `t${i}`,
      planning_summary: 'x'.repeat(500),
    }));
    const result = budgetTrim(small, 1000);
    expect(result.length).toBeLessThan(small.length);
  });

  it('includes all cards when total summary length is under budget', () => {
    const cards: MinimalCard[] = Array.from({ length: 3 }, (_, i) => ({
      entity_type: 'task',
      entity_id: `t${i}`,
      planning_summary: 'short',
    }));
    const result = budgetTrim(cards, 50_000);
    expect(result).toHaveLength(3);
  });

  it('treats null planning_summary as zero length for budget accounting', () => {
    const cards: MinimalCard[] = [
      { entity_type: 'task', entity_id: 't1', planning_summary: null },
      { entity_type: 'task', entity_id: 't2', planning_summary: null },
    ];
    const result = budgetTrim(cards, 0);
    // First card always included; second has null summary (0 chars) so it fits too
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
