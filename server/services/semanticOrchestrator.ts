import { chat, parseJSON, type ChatCallTrace } from '../ollama.js';

export type SemanticDomain = 'research' | 'planning' | 'mixed' | 'general';
export type SemanticOperation =
  | 'search_evidence'
  | 'synthesize_research'
  | 'inspect_schedule'
  | 'propose_schedule'
  | 'mutate_work'
  | 'answer';

export interface SemanticFrame {
  domain: SemanticDomain;
  operation: SemanticOperation;
  objective: string;
  entities: Array<{ type: 'task' | 'goal' | 'paper' | 'topic'; mention: string }>;
  temporal: { raw: string | null };
  requires_confirmation: boolean;
  confidence: number;
}

export interface OrchestrationStep {
  tool: 'research.search' | 'research.synthesize' | 'schedule.inspect' | 'schedule.solve' | 'work.propose' | 'answer';
  purpose: string;
  read_only: boolean;
}

export interface ScheduleIntentDecision {
  mode: 'inspect' | 'propose_change' | 'not_schedule';
  view: 'deadline_overview' | 'schedule_analysis' | 'none';
  operation: 'inspect' | 'plan_new' | 'move_existing' | 'update_dates' | 'none';
  source_date: string | null;
  target_date: string | null;
  scope: {
    all_matching: boolean;
    entity_types: Array<'tasks' | 'deadlines' | 'events'>;
  };
  preserve_event_times: boolean;
  confidence: number;
  rationale: string;
}

const RESEARCH = /\b(paper|papers|journal|journals|study|studies|literature|citation|evidence|research|doi|abstract)\b/i;
const PLANNING = /\b(schedule|calendar|task|tasks|deadline|plan|tomorrow|today|overdue|available|capacity|block)\b/i;
const MUTATION = /\b(create|add|schedule|move|reschedule|delete|remove|mark|complete|apply|change|update)\b/i;
const SYNTHESIS = /\b(compare|synthesize|review|summarize|gap|consensus|contradict|what does the literature)\b/i;
const TEMPORAL = /\b(today|tomorrow|tonight|next week|(?:mon|tues|wednes|thurs|fri|satur|sun)day|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

/** Fast, deterministic semantic frame. The LLM may enrich this later, but may
 * not bypass the typed operation or confirmation boundary. */
export function interpretObjective(message: string): SemanticFrame {
  const research = RESEARCH.test(message);
  const planning = PLANNING.test(message);
  const mutating = MUTATION.test(message);
  const temporal = message.match(TEMPORAL)?.[0] ?? null;
  const domain: SemanticDomain = research && planning ? 'mixed' : research ? 'research' : planning ? 'planning' : 'general';

  let operation: SemanticOperation = 'answer';
  if (research) operation = SYNTHESIS.test(message) ? 'synthesize_research' : 'search_evidence';
  if (planning) operation = mutating || /\b(?:want|need)\b.+\b(?:done|scheduled|planned)\b/i.test(message)
    ? 'propose_schedule'
    : 'inspect_schedule';
  if (research && planning && SYNTHESIS.test(message)) operation = mutating ? 'mutate_work' : 'synthesize_research';

  const quoted = [...message.matchAll(/["“]([^"”]{2,100})["”]/g)].map(m => m[1]);
  return {
    domain,
    operation,
    objective: message.trim(),
    entities: quoted.map(mention => ({ type: research ? 'paper' as const : 'task' as const, mention })),
    temporal: { raw: temporal },
    requires_confirmation: operation === 'propose_schedule' || operation === 'mutate_work',
    confidence: domain === 'general' ? 0.55 : research && planning ? 0.82 : 0.9,
  };
}

export function buildToolPlan(frame: SemanticFrame): OrchestrationStep[] {
  switch (frame.operation) {
    case 'search_evidence':
      return [{ tool: 'research.search', purpose: 'Retrieve ranked passages with provenance', read_only: true }];
    case 'synthesize_research':
      return [
        { tool: 'research.search', purpose: 'Gather relevant evidence', read_only: true },
        { tool: 'research.synthesize', purpose: 'Compare claims while preserving citations', read_only: true },
      ];
    case 'inspect_schedule':
      return [{ tool: 'schedule.inspect', purpose: 'Load canonical workload and constraints', read_only: true }];
    case 'propose_schedule':
      return [
        { tool: 'schedule.inspect', purpose: 'Resolve tasks, availability, deadlines, and dependencies', read_only: true },
        { tool: 'schedule.solve', purpose: 'Compute a constraint-checked proposal', read_only: true },
        { tool: 'work.propose', purpose: 'Present changes for confirmation', read_only: true },
      ];
    case 'mutate_work':
      return [
        { tool: 'research.search', purpose: 'Gather evidence for the proposed work', read_only: true },
        { tool: 'research.synthesize', purpose: 'Derive evidence-backed gaps or candidate tasks', read_only: true },
        { tool: 'work.propose', purpose: 'Present task changes for confirmation', read_only: true },
      ];
    default:
      return [{ tool: 'answer', purpose: 'Answer without changing application state', read_only: true }];
  }
}

function deterministicScheduleFallback(message: string): ScheduleIntentDecision {
  const frame = interpretObjective(message);
  if (frame.domain !== 'planning' && frame.domain !== 'mixed') {
    return {
      mode: 'not_schedule', view: 'none', operation: 'none', source_date: null, target_date: null,
      scope: { all_matching: false, entity_types: [] }, preserve_event_times: true,
      confidence: 0.6, rationale: 'No schedule domain detected.',
    };
  }
  return {
    mode: 'inspect',
    view: /\b(?:due|deadline|deadlines)\b/i.test(message) ? 'deadline_overview' : 'schedule_analysis',
    operation: 'inspect',
    source_date: null,
    target_date: null,
    scope: { all_matching: false, entity_types: [] },
    preserve_event_times: true,
    confidence: 0.5,
    rationale: 'Read-only fallback because semantic change intent could not be confirmed.',
  };
}

export function parseScheduleIntentDecision(
  raw: string,
  fallbackMessage: string,
): ScheduleIntentDecision {
  try {
    const parsed = parseJSON<Record<string, unknown>>(raw);
    const mode = parsed.mode;
    if (mode !== 'inspect' && mode !== 'propose_change' && mode !== 'not_schedule') {
      return deterministicScheduleFallback(fallbackMessage);
    }
    return {
      mode,
      view: parsed.view === 'deadline_overview' || parsed.view === 'schedule_analysis'
        ? parsed.view
        : 'none',
      operation: parsed.operation === 'inspect' || parsed.operation === 'plan_new'
        || parsed.operation === 'move_existing' || parsed.operation === 'update_dates'
        ? parsed.operation
        : mode === 'inspect' ? 'inspect' : mode === 'propose_change' ? 'plan_new' : 'none',
      source_date: typeof parsed.source_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.source_date)
        ? parsed.source_date : null,
      target_date: typeof parsed.target_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.target_date)
        ? parsed.target_date : null,
      scope: {
        all_matching: Boolean((parsed.scope as Record<string, unknown> | undefined)?.all_matching),
        entity_types: Array.isArray((parsed.scope as Record<string, unknown> | undefined)?.entity_types)
          ? ((parsed.scope as Record<string, unknown>).entity_types as unknown[])
            .filter((type): type is 'tasks' | 'deadlines' | 'events' => type === 'tasks' || type === 'deadlines' || type === 'events')
          : [],
      },
      preserve_event_times: parsed.preserve_event_times !== false,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.8))),
      rationale: String(parsed.rationale ?? ''),
    };
  } catch {
    return deterministicScheduleFallback(fallbackMessage);
  }
}

/**
 * Semantic read-vs-change boundary for scheduling. This classification is
 * intentionally independent from keywords such as "layout", "schedule", or
 * "organize": those words can describe either a read or a mutation.
 */
export async function classifyScheduleIntent(
  message: string,
  recentUserMessages: string[] = [],
  options: { onModelTrace?: (trace: ChatCallTrace) => void; currentDate?: string; model?: string } = {},
): Promise<ScheduleIntentDecision> {
  const fallback = deterministicScheduleFallback(message);
  const history = recentUserMessages
    .filter(Boolean)
    .slice(-3);
  try {
    const raw = await chat([
      {
        role: 'system',
        content: `Classify the user's CURRENT scheduling intent by meaning, not keywords.

Return JSON only:
{"mode":"inspect|propose_change|not_schedule","view":"deadline_overview|schedule_analysis|none","operation":"inspect|plan_new|move_existing|update_dates|none","source_date":"YYYY-MM-DD or null","target_date":"YYYY-MM-DD or null","scope":{"all_matching":false,"entity_types":["tasks|deadlines|events"]},"preserve_event_times":true,"confidence":0.0,"rationale":"short"}

Definitions:
- inspect: read, display, list, group, explain, audit, or break down the existing schedule/tasks/deadlines. It must not create new calendar placements.
- propose_change: explicitly asks to create, move, reschedule, fit, allocate, or reorganize work into new calendar placements. Changes will still require confirmation.
- not_schedule: the current request is not about schedule/task timing.
- deadline_overview: the user wants existing tasks grouped/listed by their current due dates or deadlines.
- schedule_analysis: the user wants reasoning about feasibility, priorities, risk, capacity, or what to work on.
- none: use for propose_change or not_schedule.

Semantic operations:
- inspect: read existing schedule state.
- plan_new: create new placements for unscheduled work.
- move_existing: shift records already assigned to a source date onto a target date. Do not reinterpret this as planning the backlog.
- update_dates: change due/start dates without moving calendar events.
- Resolve relative dates using current_date. For example, if current_date is 2026-07-26, today is 2026-07-26 and tomorrow is 2026-07-27.
- scope.entity_types must reflect what the user actually named. "tasks, deadlines and events" means all three.
- all_matching is true only when the user says all/everything or otherwise clearly selects the whole source scope.
- preserve_event_times is true unless the user asks to reorganize or find new times.

Important distinctions:
- "lay out/list my tasks by due date" means inspect.
- "lay my tasks onto the calendar" means propose_change.
- "show my week" means inspect.
- "plan/reschedule my week" means propose_change.
- A prior planning request must not override a standalone current inspection request.
- Use history only to resolve genuine pronouns or short follow-ups such as "show me those options".`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          current_date: options.currentDate ?? null,
          recent_user_history: history,
          current_message: message,
        }),
      },
    ], {
      temperature: 0,
      max_tokens: 256,
      jsonMode: true,
      model: options.model,
      onTrace: options.onModelTrace,
      // A local 8B fallback can take minutes even for this tiny classifier.
      // The read-only deterministic fallback below is safer and immediate.
      allowLocalFallback: false,
    });
    return parseScheduleIntentDecision(raw, message);
  } catch (error) {
    console.warn(`[semantic-router] classifier failed; using safe fallback: ${String(error)}`);
    return fallback;
  }
}

export function applyScheduleIntentDecision(
  frame: SemanticFrame,
  decision: ScheduleIntentDecision,
): SemanticFrame {
  if (decision.mode === 'not_schedule') return frame;
  const operation: SemanticOperation = decision.mode === 'propose_change'
    ? 'propose_schedule'
    : 'inspect_schedule';
  return {
    ...frame,
    domain: frame.domain === 'research' ? 'mixed' : 'planning',
    operation,
    requires_confirmation: decision.mode === 'propose_change',
    confidence: decision.confidence,
  };
}
