const SCHEDULE_PLAN_PATTERNS: RegExp[] = [
  /\b(make|put|set)\b.*\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(schedule|reschedule|plan|place|put|set)\b.*\b(calendar|schedule|tasks?|work|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b/i,
  /\b(plan|schedule|reschedule|replan)\s+(my|me|out|this|today|tomorrow|tmrw|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|day|month|tasks?|work|time|calendar|schedule|plan)\b/i,
  /\b(move|reschedule|shift|push|transfer)\b.*\b(tasks?|work|schedule|calendar|monday|tuesday|wednesday|thursday|thirsday|friday|saturday|sunday|today|tomorrow|week|day)\b/i,
  /\b(make|create|build|generate|give)\s+(me\s+)?(a\s+|an\s+|the\s+)?(new\s+)?(schedule|plan)\b/i,
  /\b(fix|repair)\s+(my\s+)?schedule\b/i,
  /\b(organize|reorganize|lay\s*out|layout|fit|fill|slot|allocate|place)\b.*\b(tasks?|work|schedule|calendar|plan|week|day|time|hours?|slots?)\b/i,
  /\b(suggest|recommend)\b.*\b(schedule|plan)\b/i,
  /\b(use|fill)\s+(my\s+)?(free|available)\s+time\b/i,
  /\b(want|need|would\s+like)\b.*\b(done|scheduled|placed|worked\s+on)\b.*\b(today|tomorrow|tmrw|monday|tuesday|wednesday|thursday|friday|saturday|sunday|around|at)\b/i,
  /\b(done|scheduled|placed)\s+on\s+(today|tomorrow|tmrw|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
];

const DIAGNOSTIC_LEAD_PATTERN =
  /^(show|check|analy[sz]e|review|break\s*down|explain|tell me|summari[sz]e|view|list)\b/i;

const STRONG_PLAN_CUE_PATTERN =
  /\b(make|create|build|generate|fix|repair|organize|reorganize|lay\s*out|layout|fit|fill|slot|allocate|place|put|suggest|recommend|move|reschedule|shift|push|transfer|replan)\b|\b(want|need|would\s+like)\b.*\b(done|scheduled|placed|worked\s+on)\b|\b(done|scheduled|placed)\s+on\b|\bplan\s+(my|me|out|this|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|thirsday|friday|saturday|sunday|week|day|month|tasks?|work|time)\b|\bschedule\b.*\b(tasks?|work|calendar|week|day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bset\b.*\b(calendar|schedule|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bnew\s+(schedule|plan)\b/i;

const WHOLE_SYSTEM_REVIEW_PATTERN =
  /\b(proactive|smart)\b.*\b(review|audit|check|analy[sz]e)\b|\b(review|audit|check|analy[sz]e)\b.*\b(entire|whole|full|all)\b.*\b(schedule|planning|tasks?|goals?|system)\b/i;

const EXPLICIT_PLACEMENT_CHANGE_PATTERN =
  /\b(reschedule|replan|move|shift|push|transfer|fit|fill|slot|allocate|place)\b|\b(make|create|build|generate)\b.*\b(schedule|calendar|plan)\b|\b(fix|repair|organize|reorganize)\b.*\b(schedule|calendar|plan)\b|\bplan\s+(my|me|out|this|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|thirsday|friday|saturday|sunday|week|day|month|tasks?|work|time)\b/i;

const DEADLINE_DISPLAY_LAYOUT_PATTERN =
  /\b(lay\s*out|layout|list|show|display|break\s*down)\b.*\b(tasks?|work)\b.*\b(in\s+terms\s+of|by|according\s+to|grouped\s+by)\b.*\b(due\s+dates?|deadlines?)\b/i;

const DEADLINE_LAYOUT_MUTATION_PATTERN =
  /\b(move|reschedule|replan|shift|push|transfer|fit|fill|slot|allocate|place|change|update)\b|\b(make|create|build|generate)\b.*\b(schedule|calendar|plan)\b/i;

function normalizeIntentText(message?: string | null): string {
  return (message ?? '')
    .toLowerCase()
    .replace(/[\u2019']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasExplicitSchedulePlanIntent(message?: string | null): boolean {
  const text = normalizeIntentText(message);
  if (!text) return false;

  if (DEADLINE_DISPLAY_LAYOUT_PATTERN.test(text) && !DEADLINE_LAYOUT_MUTATION_PATTERN.test(text)) {
    return false;
  }

  if (WHOLE_SYSTEM_REVIEW_PATTERN.test(text)) {
    return EXPLICIT_PLACEMENT_CHANGE_PATTERN.test(text);
  }

  if (DIAGNOSTIC_LEAD_PATTERN.test(text) && !STRONG_PLAN_CUE_PATTERN.test(text)) {
    return false;
  }

  return SCHEDULE_PLAN_PATTERNS.some(pattern => pattern.test(text));
}

const TASK_ESTIMATE_UPDATE_PATTERN =
  /\b(?:needs?|takes?|estimate(?:d)?(?:\s+duration)?(?:\s+is)?|make\s+(?:it|this)|set\s+(?:it|this))\b[^.!?\n]{0,80}\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/i;

const TASK_DEADLINE_UPDATE_PATTERN =
  /\b(?:move|change|set|update|push|extend)\b[^.!?\n]{0,100}\b(?:due\s*date|deadline)\b|\b(?:due\s*date|deadline)\b[^.!?\n]{0,100}\b(?:to|on|until|through)\b/i;

const TASK_ROUTINE_PATTERN =
  /\b(?:every|each)\s+(?:day|weekday|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b|\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\s+(?:a|per)\s+(?:day|weekday|week)\b|\b(?:daily|weekly|monthly)\b/i;

/**
 * A task-configuration command changes task metadata or defines a routine; it
 * is not a request for an unrelated whole-schedule layout. These turns must
 * reach the action model so it can resolve the named task and emit reviewable
 * update_task/create_block_series actions.
 */
export function hasTaskConfigurationIntent(message?: string | null): boolean {
  const text = normalizeIntentText(message);
  return TASK_ESTIMATE_UPDATE_PATTERN.test(text)
    || TASK_DEADLINE_UPDATE_PATTERN.test(text)
    || TASK_ROUTINE_PATTERN.test(text);
}

/** A compound command cannot be safely consumed by the deadline-only fast path. */
export function hasEstimateOrRoutineIntent(message?: string | null): boolean {
  const text = normalizeIntentText(message);
  return TASK_ESTIMATE_UPDATE_PATTERN.test(text) || TASK_ROUTINE_PATTERN.test(text);
}

const SCHEDULE_VIEW_PATTERN =
  /\b(schedule|calendar|day|today|tomorrow|tmrw|tmr|monday|mon\b|tuesday|tues|teus|tueds|wednesday|wed\b|thursday|thu\b|friday|fri\b|saturday|sat\b|sunday|sun\b|shc\w*|sch\w*)\b/i;

const DIAGNOSTIC_VIEW_PATTERN =
  /\b(show|check|view|look|see|open|display|analy[sz]e|review|break\s*down|tell me|what|what'?s|how'?s)\b/i;

const ENTITY_MUTATION_PATTERN =
  /\b(create|add|make|start|set\s*up|track|log)\b.*\b(goal|task|milestone|deadline|project|note|journal|resource)\b|\b(new|first|initial)\s+(goal|task|milestone|deadline|project)\b/i;

const SINGLE_DAY_REFERENCE_PATTERN =
  /\b(today|tomorrow|tmrw|tmr|monday|mon\b|tuesday|tues\w*|teus\w*|tueds\w*|wednesday|wed\b|thursday|thu\b|friday|fri\b|saturday|sat\b|sunday|sun\b)\b|\b\d{4}-\d{2}-\d{2}\b/i;

const MULTI_DAY_REFERENCE_PATTERN =
  /\b(this|next|coming|whole|entire|full)\s+(week|month)\b|\bweek(?:ly)?\b|\bmonth(?:ly)?\b|\bday\s*by\s*day\b|\beach\s+day\b|\bnext\s+\d+\s+days?\b/i;

export function wantsScheduleDayView(message?: string | null): boolean {
  const text = normalizeIntentText(message);
  if (!text || hasExplicitSchedulePlanIntent(text)) return false;
  if (ENTITY_MUTATION_PATTERN.test(text)) return false;
  // The deterministic day widget is intentionally narrow. Week/range/general
  // reviews must reach the semantic planner so it can reason across the full
  // schedule instead of silently collapsing the request to one date.
  if (MULTI_DAY_REFERENCE_PATTERN.test(text)) return false;
  return SINGLE_DAY_REFERENCE_PATTERN.test(text)
    && SCHEDULE_VIEW_PATTERN.test(text)
    && DIAGNOSTIC_VIEW_PATTERN.test(text);
}

export function wantsOverdueTaskList(message?: string | null): boolean {
  const text = normalizeIntentText(message);
  if (!text || !(/\bover\s*due\b|\boverdue\b/.test(text))) return false;
  const isSettingDeadlineState =
    /\b(mark|make|set|change|update)\b.{0,40}\bover\s*due\b|\b(mark|make|set|change|update)\b.{0,40}\boverdue\b/.test(text);
  if (isSettingDeadlineState) return false;
  // "Overdue" is often one criterion inside a whole-system review. Only use
  // the deterministic overdue widget when overdue work is the actual request.
  if (/\b(smart|proactive)\b.*\breview\b|\b(entire|whole|full)\s+(planning\s+)?system\b|\bevery\s+active\s+goal\b/.test(text)) {
    return false;
  }
  const asksForList = /\b(show|list|which|what|how many|tell me|give me|do i have|any)\b/.test(text);
  return asksForList || text.split(/\s+/).length <= 5;
}
