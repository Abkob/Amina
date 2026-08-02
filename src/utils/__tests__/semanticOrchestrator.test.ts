import { describe, expect, it } from 'vitest';
import {
  applyScheduleIntentDecision,
  buildToolPlan,
  interpretObjective,
  parseScheduleIntentDecision,
} from '../../../server/services/semanticOrchestrator';

describe('semantic orchestrator', () => {
  it('routes literature questions to evidence retrieval', () => {
    const frame = interpretObjective('Find papers about pressure sensing in prosthetic liners');
    expect(frame.domain).toBe('research');
    expect(frame.operation).toBe('search_evidence');
    expect(buildToolPlan(frame)[0].tool).toBe('research.search');
  });

  it('uses a solver proposal for scheduling mutations', () => {
    const frame = interpretObjective('Schedule the report task for Thursday at 7am');
    expect(frame.operation).toBe('propose_schedule');
    expect(frame.requires_confirmation).toBe(true);
    expect(buildToolPlan(frame).map(step => step.tool)).toEqual(['schedule.inspect', 'schedule.solve', 'work.propose']);
  });

  it('recognizes mixed research and planning objectives', () => {
    const frame = interpretObjective('Review the journal evidence and create tasks for the missing experiments');
    expect(frame.domain).toBe('mixed');
    expect(frame.requires_confirmation).toBe(true);
  });

  it('accepts a semantic inspection decision for deadline layouts', () => {
    const decision = parseScheduleIntentDecision(
      '{"mode":"inspect","view":"deadline_overview","confidence":0.97,"rationale":"The user wants a read-only deadline view."}',
      'lay out all my scheduled tasks of the week in terms of due dates',
    );
    const frame = applyScheduleIntentDecision(
      interpretObjective('lay out all my scheduled tasks of the week in terms of due dates'),
      decision,
    );

    expect(decision.mode).toBe('inspect');
    expect(decision.view).toBe('deadline_overview');
    expect(frame.operation).toBe('inspect_schedule');
    expect(frame.requires_confirmation).toBe(false);
  });

  it('accepts a semantic calendar-change decision without applying it', () => {
    const decision = parseScheduleIntentDecision(
      '{"mode":"propose_change","view":"none","confidence":0.96,"rationale":"The user asked for new calendar placements."}',
      'fit these tasks onto my calendar next week',
    );
    const frame = applyScheduleIntentDecision(
      interpretObjective('fit these tasks onto my calendar next week'),
      decision,
    );

    expect(frame.operation).toBe('propose_schedule');
    expect(frame.requires_confirmation).toBe(true);
    expect(buildToolPlan(frame).map(step => step.tool)).toEqual([
      'schedule.inspect',
      'schedule.solve',
      'work.propose',
    ]);
  });

  it('preserves a model-resolved whole-day move as semantic scope', () => {
    const decision = parseScheduleIntentDecision(
      JSON.stringify({
        mode: 'propose_change',
        view: 'none',
        operation: 'move_existing',
        source_date: '2026-07-26',
        target_date: '2026-07-27',
        scope: { all_matching: true, entity_types: ['tasks', 'deadlines', 'events'] },
        preserve_event_times: true,
        confidence: 0.99,
        rationale: 'The user wants existing Sunday records shifted to Monday.',
      }),
      'move everything today to tomorrow',
    );

    expect(decision).toMatchObject({
      operation: 'move_existing',
      source_date: '2026-07-26',
      target_date: '2026-07-27',
      scope: { all_matching: true, entity_types: ['tasks', 'deadlines', 'events'] },
      preserve_event_times: true,
    });
  });

  it('falls back to read-only inspection when semantic JSON is unavailable', () => {
    const decision = parseScheduleIntentDecision(
      'not-json',
      'lay out all my scheduled tasks of the week in terms of due dates',
    );
    expect(decision.mode).toBe('inspect');
    expect(decision.view).toBe('deadline_overview');
  });
});
