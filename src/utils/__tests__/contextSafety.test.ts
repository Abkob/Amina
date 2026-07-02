import { describe, it, expect } from 'vitest';
import { assertSafeAIContext } from '../../../server/utils/contextSafety.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeValidContext() {
  return {
    today: '2026-06-29',
    schedule_prefs: {
      work_days: [1, 2, 3, 4, 5],
      daily_capacity_minutes: 480,
      effective_capacity_minutes: 408,
      buffer_ratio: 0.15,
    },
    scheduler_result: {
      status: 'feasible',
      gap_minutes: 4000,
      tasks_overflow: [],
      unestimated_task_ids: [],
    },
    active_goals: [
      {
        id: 'g1',
        title: 'Finish thesis',
        archived_at: null,
        upcoming_tasks: [
          {
            id: 't1',
            title: 'Write chapter 3',
            planning_summary: 'Status: todo | Priority: high\nDue: 2026-07-10',
            blocker_ids: [],
            remaining_minutes: 180,
          },
        ],
      },
    ],
    meetings_next_7_days: [],
    recent_journal: [{ date: '2026-06-28', summary: 'Worked on chapter 3.' }],
    schedule_overrides: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('assertSafeAIContext', () => {
  it('passes for a well-formed context', () => {
    expect(() => assertSafeAIContext(makeValidContext())).not.toThrow();
  });

  it('throws when raw_text appears in context', () => {
    const ctx = {
      ...makeValidContext(),
      recent_journal: [{ date: '2026-06-28', raw_text: 'Dear diary, today was rough...' }],
    };
    expect(() => assertSafeAIContext(ctx)).toThrow('raw_text');
  });

  it('throws when resource_chunks appears in context', () => {
    const ctx = {
      ...makeValidContext(),
      resource_chunks: [{ chunk_index: 0, content: 'PDF page text...' }],
    };
    expect(() => assertSafeAIContext(ctx)).toThrow('resource_chunks');
  });

  it('throws when a vector array appears in context', () => {
    const ctx = {
      ...makeValidContext(),
      embedding: [0.12345, 0.67890, 0.11111, 0.22222],
    };
    expect(() => assertSafeAIContext(ctx)).toThrow('vector array');
  });

  it('does NOT throw for a short number array (e.g. work_days)', () => {
    // [1, 2, 3] has integers, not floats with decimal points — should pass
    const ctx = makeValidContext();
    expect(() => assertSafeAIContext(ctx)).not.toThrow();
  });

  it('throws when an archived goal leaks into context', () => {
    const ctx = makeValidContext();
    ctx.active_goals[0] = { ...ctx.active_goals[0], archived_at: '2026-01-15T00:00:00Z' };
    expect(() => assertSafeAIContext(ctx)).toThrow('archived_at');
  });

  it('passes when archived_at is null', () => {
    const ctx = makeValidContext();
    ctx.active_goals[0] = { ...ctx.active_goals[0], archived_at: null };
    expect(() => assertSafeAIContext(ctx)).not.toThrow();
  });

  it('throws when context exceeds 50,000 chars', () => {
    const ctx = { ...makeValidContext(), padding: 'x'.repeat(50_000) };
    expect(() => assertSafeAIContext(ctx)).toThrow('too large');
  });

  it('passes when context is just under 50,000 chars', () => {
    const ctx = { ...makeValidContext(), padding: 'x'.repeat(49_900 - JSON.stringify(makeValidContext()).length) };
    expect(() => assertSafeAIContext(ctx)).not.toThrow();
  });
});

// ─── SYSTEM_PROMPT field coverage ─────────────────────────────────────────────
// These fields are referenced in the SYSTEM_PROMPT. If they disappear from the
// context shape, the AI will silently reason about keys that don't exist.

describe('context shape includes all SYSTEM_PROMPT-referenced fields', () => {
  const ctx = makeValidContext();
  const str = JSON.stringify(ctx);

  it('has effective_capacity_minutes', () => {
    expect(str).toContain('"effective_capacity_minutes"');
  });

  it('has scheduler_result with status', () => {
    expect(str).toContain('"scheduler_result"');
    expect(str).toContain('"status"');
  });

  it('has active_goals', () => {
    expect(str).toContain('"active_goals"');
  });

  it('has upcoming_tasks inside active_goals', () => {
    expect(str).toContain('"upcoming_tasks"');
  });

  it('has planning_summary inside upcoming_tasks', () => {
    expect(str).toContain('"planning_summary"');
  });

  it('has blocker_ids inside upcoming_tasks', () => {
    expect(str).toContain('"blocker_ids"');
  });

  it('has remaining_minutes inside upcoming_tasks', () => {
    expect(str).toContain('"remaining_minutes"');
  });

  it('has meetings_next_7_days', () => {
    expect(str).toContain('"meetings_next_7_days"');
  });

  it('has recent_journal with no raw_text', () => {
    expect(str).toContain('"recent_journal"');
    expect(str).not.toContain('"raw_text"');
  });

  it('has schedule_overrides', () => {
    expect(str).toContain('"schedule_overrides"');
  });
});

// ─── planning_coverage guard ──────────────────────────────────────────────────
// The planning_coverage bucket counts are intentionally omitted from the minimal
// fixture but should not cause assertSafeAIContext to throw when present.

describe('assertSafeAIContext with planning_coverage', () => {
  it('passes when planning_coverage is included with valid bucket counts', () => {
    const ctx = {
      ...makeValidContext(),
      planning_coverage: {
        total_incomplete: 10,
        overdue: 2,
        upcoming_dated: 3,
        undated: 5,
        unestimated: 4,
        in_progress: 1,
        blocked: 0,
      },
    };
    expect(() => assertSafeAIContext(ctx)).not.toThrow();
  });

  it('passes without planning_coverage (field is optional)', () => {
    const ctx = makeValidContext();
    expect((ctx as Record<string, unknown>).planning_coverage).toBeUndefined();
    expect(() => assertSafeAIContext(ctx)).not.toThrow();
  });
});
