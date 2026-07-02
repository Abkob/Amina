import { Router } from 'express';
import crypto from 'crypto';
import { query, transaction } from '../db.js';
import { chat, parseJSON, ollamaHealth, CHAT_MODEL } from '../ollama.js';
import { buildRetrievalContext } from '../services/retrieval.js';
import { computeSchedule, type SchedulerResult } from '../services/scheduler.js';
import { assertSafeAIContext } from '../utils/contextSafety.js';
import { rateLimit } from '../utils/rateLimit.js';
import { generateDeterministicSummaries, generateEntitySummary } from '../services/summaryGenerator.js';
import { markEmbeddingStale, queueEmbeddingUpsert } from '../services/embeddingLifecycle.js';

const router = Router();

/** Format a Date as YYYY-MM-DD using local (server) time. */
const fmtYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function getScheduleContext(userQuery?: string) {
  // ── Schedule preferences ───────────────────────────────────────────────────
  const { rows: prefsRows } = await query("SELECT * FROM user_schedule_prefs WHERE id='default'");
  const prefs = (prefsRows[0] ?? {
    work_days: '[1,2,3,4,5]', work_start: 9, work_end: 18,
    daily_capacity_minutes: 480, deep_work_start: 9, deep_work_end: 12, buffer_ratio: 0.15,
    timezone: undefined,
  }) as Record<string, unknown>;

  // Determine today in the user's configured timezone so "today" matches their wall clock.
  const tz = prefs.timezone as string | undefined;
  const todayStr = tz
    ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    : (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const today = new Date(todayStr + 'T00:00:00');
  const dailyCapacity = Number(prefs.daily_capacity_minutes ?? 480);
  const bufferRatio = Number(prefs.buffer_ratio ?? 0.15);
  const effectiveCapacity = Math.round(dailyCapacity * (1 - bufferRatio));

  // ── Active goals with planning summaries ───────────────────────────────────
  const { rows: goals } = await query(
    `SELECT g.*, es.summary_text as planning_summary
     FROM goals g
     LEFT JOIN entity_summaries es ON es.entity_type='goal' AND es.entity_id=g.id AND es.summary_type='planning'
     WHERE g.archived_at IS NULL ORDER BY g.deadline ASC, g.created_at ASC`,
  ) as { rows: Record<string, unknown>[] };

  const goalIds = goals.map(g => g.id as string);

  // ── Milestones with planning summaries ────────────────────────────────────
  const { rows: allMilestones } = goalIds.length ? await query(
    `SELECT m.*, es.summary_text as planning_summary
     FROM goal_milestones m
     LEFT JOIN entity_summaries es ON es.entity_type='milestone' AND es.entity_id=m.id AND es.summary_type='planning'
     WHERE m.goal_id = ANY($1) ORDER BY m.position ASC, m.due_date ASC`,
    [goalIds],
  ) as { rows: Record<string, unknown>[] } : { rows: [] };

  // ── Task metrics per goal (lightweight: counts + totals only) ─────────────
  const { rows: taskMetrics } = goalIds.length ? await query(
    `SELECT t.goal_id,
            COUNT(*) FILTER (WHERE NOT t.completed) as incomplete_count,
            COALESCE(SUM(t.estimated_minutes) FILTER (WHERE NOT t.completed), 0) as mins_remaining,
            COALESCE(SUM(ws.logged) FILTER (WHERE NOT t.completed), 0) as mins_logged
     FROM tasks t
     LEFT JOIN (SELECT task_id, SUM(minutes) as logged FROM work_sessions WHERE minutes IS NOT NULL GROUP BY task_id) ws ON ws.task_id=t.id
     WHERE t.goal_id = ANY($1)
     GROUP BY t.goal_id`,
    [goalIds],
  ) as { rows: { goal_id: string; incomplete_count: number; mins_remaining: number; mins_logged: number }[] }
  : { rows: [] };
  const metricsMap: Record<string, typeof taskMetrics[0]> = {};
  for (const m of taskMetrics) metricsMap[m.goal_id] = m;

  // ── Task coverage buckets (counts for AI honesty — Epic 40.3) ─────────────
  // These counts let the AI report omissions accurately instead of silently
  // reasoning about a partial view.
  const coverageParams: unknown[] = [todayStr];
  let coverageSql = `
    SELECT
      COUNT(*)::int                                                     AS total_incomplete,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date < $1)::int AS overdue,
      COUNT(*) FILTER (WHERE t.due_date IS NOT NULL AND t.due_date >= $1)::int AS upcoming_dated,
      COUNT(*) FILTER (WHERE t.due_date IS NULL)::int                   AS undated,
      COUNT(*) FILTER (WHERE t.estimated_minutes IS NULL OR t.estimated_minutes = 0)::int AS unestimated,
      COUNT(*) FILTER (WHERE t.status = 'in_progress')::int             AS in_progress,
      COUNT(*) FILTER (WHERE t.status = 'blocked')::int                 AS blocked
    FROM tasks t
    LEFT JOIN goals g ON g.id = t.goal_id
    WHERE t.completed = false
      AND (g.archived_at IS NULL OR t.goal_id IS NULL)
  `;
  if (goalIds.length) {
    coverageParams.push(goalIds);
    coverageSql += ` AND t.goal_id = ANY($${coverageParams.length})`;
  }
  const { rows: coverageRows } = await query(coverageSql, coverageParams) as { rows: Record<string, number>[] };
  const coverage = coverageRows[0] ?? {};

  // ── Upcoming tasks via hybrid retrieval (top 30 across all goals) ─────────
  const retrievalResult = await buildRetrievalContext({
    query: userQuery,
    goalIds: goalIds.length ? goalIds : undefined,
    horizonDays: 14,
    limit: 30,
  });
  const upcomingTaskCards = retrievalResult.cards;

  // ── Meetings next 7 days ──────────────────────────────────────────────────
  const sevenDaysLater = new Date(today);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const { rows: meetings } = await query(
    `SELECT id, title, goal_id, scheduled_at, duration_minutes, location
     FROM meetings WHERE scheduled_at >= $1 AND scheduled_at <= $2 ORDER BY scheduled_at ASC`,
    [todayStr, sevenDaysLater.toISOString()],
  );

  // ── Recent journal (summaries only — no raw text) ─────────────────────────
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { rows: recentJournals } = await query(
    `SELECT entry_date, summary FROM journal_entries
     WHERE entry_date >= $1 AND summary IS NOT NULL
     ORDER BY entry_date DESC LIMIT 10`,
    [fmtYMD(sevenDaysAgo)],
  ) as { rows: { entry_date: string; summary: string }[] };

  // ── Schedule day overrides ─────────────────────────────────────────────────
  const twoWeeksLater = new Date(today);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
  const { rows: overrides } = await query(
    `SELECT date, available_minutes, note FROM schedule_day_overrides WHERE date BETWEEN $1 AND $2`,
    [todayStr, fmtYMD(twoWeeksLater)],
  );

  // ── Calendar events as capacity blockers ───────────────────────────────────
  // Locked events and focus blocks within the 14-day horizon reduce available capacity.
  // Events anchored to a specific week_start are resolved to their actual calendar date
  // (week_start is the ISO Monday of that week; day_index 0=Mon, 1=Tue … 6=Sun).
  const { rows: lockedEvents } = await query(
    `SELECT day_index, start_hour, duration_hours, week_start, type
     FROM events WHERE (locked = true OR type = 'unavailable')
       AND week_start IS NOT NULL
       AND week_start BETWEEN $1 AND $2`,
    [todayStr, fmtYMD(twoWeeksLater)],
  ) as { rows: { day_index: number; start_hour: number; duration_hours: number; week_start: string; type: string }[] };

  // Convert event records to dated meeting-equivalent entries for the scheduler.
  // Duplicate logic: if the same day also has a meeting covering similar hours we'll
  // over-subtract, but both are real capacity reducers so the conservative estimate is correct.
  const eventMeetings: { date: string; duration_minutes: number }[] = [];
  for (const ev of lockedEvents) {
    const [wy, wm, wd] = ev.week_start.split('-').map(Number);
    const weekMonday = new Date(wy, wm - 1, wd);
    weekMonday.setHours(0, 0, 0, 0);
    const eventDate = new Date(weekMonday);
    eventDate.setDate(weekMonday.getDate() + (ev.day_index % 7));
    const dateStr = fmtYMD(eventDate);
    if (dateStr >= todayStr && dateStr <= fmtYMD(twoWeeksLater)) {
      eventMeetings.push({
        date: dateStr,
        duration_minutes: Math.round(ev.duration_hours * 60),
      });
    }
  }

  // ── Build goal contexts ───────────────────────────────────────────────────
  const milestonesByGoal: Record<string, Record<string, unknown>[]> = {};
  for (const m of allMilestones) {
    const gid = m.goal_id as string;
    if (!milestonesByGoal[gid]) milestonesByGoal[gid] = [];
    milestonesByGoal[gid].push(m);
  }

  const tasksByGoal: Record<string, typeof upcomingTaskCards> = {};
  for (const card of upcomingTaskCards) {
    const gid = card.goal_id ?? 'unassigned';
    if (!tasksByGoal[gid]) tasksByGoal[gid] = [];
    tasksByGoal[gid].push(card);
  }

  const goalContexts = goals.map(goal => {
    const metrics = metricsMap[goal.id as string];
    const minsRemaining = Number(metrics?.mins_remaining ?? 0);
    const deadline = goal.deadline as string | null;
    let feasibility: string | null = null;
    let daysUntilDeadline: number | null = null;
    if (deadline) {
      const dl = new Date(deadline);
      daysUntilDeadline = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
      const available = Math.max(0, daysUntilDeadline) * effectiveCapacity;
      feasibility = daysUntilDeadline < 0 ? 'overdue' : minsRemaining === 0 ? 'on_track' : minsRemaining > available * 0.9 ? 'at_risk' : 'on_track';
    }

    return {
      id: goal.id,
      title: goal.title,
      category: goal.category,
      status: goal.status,
      deadline: goal.deadline ?? null,
      days_until_deadline: daysUntilDeadline,
      feasibility,
      total_incomplete_tasks: Number(metrics?.incomplete_count ?? 0),
      total_mins_remaining: minsRemaining,
      total_mins_logged: Number(metrics?.mins_logged ?? 0),
      planning_summary: (goal.planning_summary as string | null) ?? null,
      milestones: (milestonesByGoal[goal.id as string] ?? []).map(m => ({
        id: m.id,
        title: m.title,
        due_date: m.due_date ?? null,
        completed: Boolean(m.completed),
        planning_summary: (m.planning_summary as string | null) ?? null,
      })),
      upcoming_tasks: (tasksByGoal[goal.id as string] ?? []).map(card => ({
        id: card.entity_id,
        title: card.title,
        status: card.status,
        priority: card.priority,
        due_date: card.due_date ?? null,
        estimated_minutes: card.estimated_minutes ?? null,
        logged_minutes: card.logged_minutes ?? 0,
        remaining_minutes: card.remaining_minutes ?? null,
        planning_summary: card.planning_summary ?? null,
        blocker_ids: card.blocker_ids ?? [],
        evidence_facts: card.evidence_facts ?? [],
        milestone_id: card.milestone_id ?? null,
      })),
      meetings: meetings
        .filter(m => (m as Record<string, unknown>).goal_id === goal.id)
        .map(m => ({
          id: (m as Record<string, unknown>).id,
          title: (m as Record<string, unknown>).title,
          scheduled_at: (m as Record<string, unknown>).scheduled_at,
          duration_minutes: (m as Record<string, unknown>).duration_minutes,
          location: (m as Record<string, unknown>).location,
        })),
    };
  });

  // ── Deterministic scheduler (no LLM) ────────────────────────────────────────
  const schedulerResult: SchedulerResult = computeSchedule({
    start_date: todayStr,
    tasks: upcomingTaskCards
      .filter(c => c.entity_type === 'task' && (c.estimated_minutes ?? 0) > 0)
      .map(c => ({
        id: c.entity_id,
        title: c.title,
        // Use remaining work (est - logged) so time already spent is not double-counted
        estimated_minutes: c.remaining_minutes ?? c.estimated_minutes!,
        due_date: c.due_date ?? null,
        priority: (c.priority ?? 'medium') as 'high' | 'medium' | 'low',
        blocker_ids: c.blocker_ids ?? [],
      })),
    // Merge calendar meetings + locked events — both reduce available capacity
    meetings: [
      ...meetings.map(m => ({
        date: String((m as Record<string, unknown>).scheduled_at).slice(0, 10),
        duration_minutes: Number((m as Record<string, unknown>).duration_minutes ?? 0),
      })),
      ...eventMeetings,
    ],
    prefs: {
      // DB stores work_days as ISO 1=Mon…7=Sun; scheduler uses getDay() 0=Sun…6=Sat. Convert via % 7.
      work_days: (JSON.parse(prefs.work_days as string) as number[]).map(d => d % 7),
      daily_capacity_minutes: dailyCapacity,
      buffer_ratio: bufferRatio,
      timezone: prefs.timezone as string | undefined,
    },
    overrides: (overrides as { date: string; available_minutes: number }[]),
    horizon_days: 14,
  });

  const ctx = {
    today: todayStr,
    schedule_prefs: {
      work_days: JSON.parse(prefs.work_days as string),
      work_start: prefs.work_start,
      work_end: prefs.work_end,
      daily_capacity_minutes: dailyCapacity,
      effective_capacity_minutes: effectiveCapacity,
      deep_work_start: prefs.deep_work_start,
      deep_work_end: prefs.deep_work_end,
    },
    scheduler_result: {
      status: schedulerResult.status,
      total_available_minutes: schedulerResult.total_available_minutes,
      total_required_minutes: schedulerResult.total_required_minutes,
      gap_minutes: schedulerResult.gap_minutes,
      tasks_overflow: schedulerResult.tasks_overflow,
      unestimated_task_ids: schedulerResult.unestimated_task_ids,
      ...(schedulerResult.impossible_reason ? { impossible_reason: schedulerResult.impossible_reason } : {}),
    },
    active_goals: goalContexts,
    meetings_next_7_days: meetings.map(m => ({
      id: (m as Record<string, unknown>).id,
      title: (m as Record<string, unknown>).title,
      goal_id: (m as Record<string, unknown>).goal_id,
      scheduled_at: (m as Record<string, unknown>).scheduled_at,
      duration_minutes: (m as Record<string, unknown>).duration_minutes,
    })),
    recent_journal: recentJournals.map(j => ({ date: j.entry_date, summary: j.summary })),
    schedule_overrides: overrides,
    retrieval_meta: {
      vector_degraded: retrievalResult.vector_degraded,
      ...(retrievalResult.vector_degraded_reason
        ? { degraded_reason: retrievalResult.vector_degraded_reason }
        : {}),
    },
    // Task universe coverage — lets AI report omissions rather than reasoning from partial data
    planning_coverage: {
      total_incomplete: Number(coverage.total_incomplete ?? 0),
      tasks_in_context: upcomingTaskCards.filter(c => c.entity_type === 'task').length,
      overdue: Number(coverage.overdue ?? 0),
      upcoming_dated: Number(coverage.upcoming_dated ?? 0),
      undated: Number(coverage.undated ?? 0),
      unestimated: Number(coverage.unestimated ?? 0),
      in_progress: Number(coverage.in_progress ?? 0),
      blocked: Number(coverage.blocked ?? 0),
    },
  };

  console.log(`[ai] context size: ${JSON.stringify(ctx).length} chars${retrievalResult.vector_degraded ? ' [vector degraded]' : ''}`);
  return ctx;
}

const SYSTEM_PROMPT = `You are Amina Copilot — an intelligent life planning assistant embedded in Amina OS, a personal goal and project management system.

You have full visibility into the user's goals, milestones, tasks, meetings, work sessions, and journal entries. Your job is to:

1. Analyze schedules for feasibility — flag tasks/goals that won't fit before their deadlines
2. Help the user add tasks, goals, milestones by understanding natural language
3. Intelligently place new items into the right goal/milestone based on context
4. Suggest date and priority adjustments when things are at risk
5. Surface patterns from journal entries and recent activity
6. Always be honest about what's genuinely infeasible

## Response format
ALWAYS respond with a valid JSON object (no markdown wrapping, pure JSON):
{
  "reply": "Your conversational reply (use markdown for formatting)",
  "actions": [
    {
      "id": "a1",
      "type": "create_task",
      "description": "Human-readable description of this action",
      "params": {
        "goal_id": "...",
        "parent_task_id": null,
        "milestone_id": null,
        "title": "...",
        "due_date": "YYYY-MM-DD",
        "start_date": "YYYY-MM-DD",
        "priority": "high|medium|low",
        "estimated_minutes": 120,
        "status": "todo"
      }
    },
    {
      "id": "a2",
      "type": "create_goal",
      "description": "...",
      "params": {
        "title": "...",
        "description": "...",
        "deadline": "YYYY-MM-DD",
        "category": "Work|Personal|Health|Learning|Home|Money|Creative|Admin"
      }
    },
    {
      "id": "a3",
      "type": "update_task",
      "description": "...",
      "params": {
        "task_id": "...",
        "due_date": "YYYY-MM-DD",
        "start_date": "YYYY-MM-DD",
        "priority": "high|medium|low",
        "status": "todo|in_progress|inactive|done",
        "estimated_minutes": 60
      }
    },
    {
      "id": "a4",
      "type": "update_goal",
      "description": "...",
      "params": {
        "goal_id": "...",
        "deadline": "YYYY-MM-DD",
        "status": "Safe|Watch|Risky"
      }
    },
    {
      "id": "a5",
      "type": "create_milestone",
      "description": "...",
      "params": {
        "goal_id": "...",
        "title": "...",
        "description": "...",
        "due_date": "YYYY-MM-DD",
        "color": "#6366f1"
      }
    }
  ],
  "feasibility": {
    "status": "on_track|at_risk|critical",
    "summary": "...",
    "issues": [
      { "goal_id": "...", "goal_title": "...", "issue": "...", "severity": "warning|critical" }
    ]
  }
}

## Context structure
The JSON injected under "Current data" has these top-level keys:
- today: ISO date string
- schedule_prefs.effective_capacity_minutes: available work minutes per day after buffer (use THIS for scheduling math, not daily_capacity_minutes)
- scheduler_result: pre-computed feasibility analysis — TRUST THIS, do not redo the math yourself
  - status: 'feasible' | 'tight' | 'risky' | 'impossible'
  - gap_minutes: positive = surplus capacity, negative = overloaded
  - tasks_overflow: IDs of tasks that cannot fit in the 14-day horizon
  - unestimated_task_ids: IDs of tasks with no time estimate (flag these to the user)
  - impossible_reason: human-readable explanation when status is 'impossible'
- active_goals[]: each goal has upcoming_tasks[], milestones[], feasibility, days_until_deadline, total_mins_remaining
  - upcoming_tasks[].planning_summary: pre-computed AI-readable card — read this first before any reasoning about a task
  - upcoming_tasks[].blocker_ids: array of task IDs that must be done before this task
  - upcoming_tasks[].remaining_minutes: estimated_minutes minus logged_minutes — the work still needed
- meetings_next_7_days[]: all meetings in the next 7 days (also nested per goal in active_goals[].meetings)
- recent_journal[]: AI summaries of recent journal entries (no raw text) — use for context on recent activity
- schedule_overrides[]: days with non-standard capacity (vacation, sick day, etc.)
- planning_coverage: counts of ALL incomplete tasks by bucket (not just those in context)
  - total_incomplete: total across all active goals
  - tasks_in_context: how many are actually included in active_goals[].upcoming_tasks[]
  - overdue / upcoming_dated / undated / unestimated / in_progress / blocked: bucket counts
  - When total_incomplete > tasks_in_context, mention that omitted tasks exist and they may affect planning

## Rules
- actions[] may be empty if no changes are needed
- Only propose actions that make sense given the user's data
- Use schedule_prefs.effective_capacity_minutes for all scheduling math
- Use remaining_minutes (not estimated_minutes) when computing how much work is left
- When a task has blocker_ids, do not schedule it before all blockers are done
- Read planning_summary for each task before reasoning about it — it contains current status, deadline, and logged time
- Milestones are checkpoints — suggest them when a goal has many unstructured tasks
- Dates must be YYYY-MM-DD
- estimated_minutes: be realistic (30min=30, 1h=60, 3h=180)
- Omit null fields from params entirely
- Use recent_journal summaries to understand what the user has been working on recently`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// POST /api/ai/chat — rate-limited: 60 per minute to prevent runaway Ollama calls
router.post('/chat', rateLimit(60, 60_000, 'ai-chat'), async (req, res) => {
  const { messages }: { messages: ChatMessage[] } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  try {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content;
    const context = await getScheduleContext(lastUserMessage);
    assertSafeAIContext(context);
    const contextStr = JSON.stringify(context, null, 2);

    const systemWithContext = `${SYSTEM_PROMPT}\n\n## Current data (as of ${context.today}):\n${contextStr}`;

    // Build Ollama message history: system + conversation
    const ollamaMessages = [
      { role: 'system' as const, content: systemWithContext },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const raw = await chat(ollamaMessages, { temperature: 0.3, max_tokens: 8192 });

    let parsed: { reply: string; actions?: unknown[]; feasibility?: unknown };
    try {
      parsed = parseJSON(raw);
    } catch {
      parsed = { reply: raw, actions: [] };
    }

    // Persist AI-proposed actions to ai_action_proposals so the Proposals panel shows them.
    // idempotency_key = sha256(action_type + sorted payload) so identical suggestions
    // from repeated chats don't accumulate duplicate pending rows.
    if (Array.isArray(parsed.actions) && parsed.actions.length) {
      const now = new Date().toISOString();
      for (const action of parsed.actions as Array<{ type?: string; description?: string; params?: Record<string, unknown> }>) {
        if (!action.type) continue;
        const payloadStr = JSON.stringify(action.params ?? {});
        const idemKey = crypto
          .createHash('sha256')
          .update(`${action.type}\0${payloadStr}`)
          .digest('hex');
        await query(
          `INSERT INTO ai_action_proposals (id, action_type, action_payload, explanation, confidence, status, source_type, source_id, created_at, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, 'pending', 'chat', NULL, $6, $7)
           ON CONFLICT (action_type, idempotency_key) WHERE status = 'pending' AND idempotency_key IS NOT NULL DO NOTHING`,
          [
            crypto.randomUUID(),
            action.type,
            payloadStr,
            action.description ?? null,
            0.8,
            now,
            idemKey,
          ],
        );
      }
    }

    res.json(parsed);
  } catch (err) {
    const msg = String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
      return res.status(503).json({
        error: `Cannot reach Ollama at ${process.env.OLLAMA_HOST ?? 'http://localhost:11434'}. Is it running? Model: ${CHAT_MODEL}`,
      });
    }
    res.status(500).json({ error: msg });
  }
});

// POST /api/ai/apply — apply a confirmed action to the database
router.post('/apply', async (req, res) => {
  const { type, params } = req.body as { type: string; params: Record<string, unknown> };
  const now = new Date().toISOString();
  const id  = crypto.randomUUID();

  if (type === 'create_task') {
    const { goal_id, parent_task_id, milestone_id, title, due_date, start_date, priority, estimated_minutes, status } = params;
    const { rows: countRows } = await query('SELECT COUNT(*) as c FROM tasks WHERE goal_id=$1', [goal_id ?? null]);
    const count = Number((countRows[0] as Record<string, unknown>).c ?? 0);
    await query(
      `INSERT INTO tasks (id,goal_id,parent_task_id,milestone_id,title,description,status,priority,kind,tags_json,due_date,start_date,estimated_minutes,completed,position,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [id, goal_id ?? null, parent_task_id ?? null, milestone_id ?? null, title, '', status ?? 'todo', priority ?? 'medium', 'manual', '[]', due_date ?? null, start_date ?? null, estimated_minutes ?? null, false, count, now, now],
    );
    if (goal_id) {
      await query(
        `INSERT INTO edges (id,source_id,source_type,target_id,target_type,relationship,metadata,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
        [id + '_edge', goal_id, 'goal', id, 'task', 'contains', '{}', now],
      );
    }
    generateEntitySummary('task', id).catch(err => console.error('[summary] ai create_task:', err));
    queueEmbeddingUpsert('task', id).catch(err => console.error('[embedding] ai create_task:', err));
    return res.json({ id });
  }

  if (type === 'create_goal') {
    const { title, description, deadline, category } = params;
    await query(
      `INSERT INTO goals (id,title,description,category,status,progress,deadline,overdue,activity_level,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, title, description ?? '', category ?? 'Work', 'Safe', 0, deadline ?? null, false, 1, now, now],
    );
    generateEntitySummary('goal', id).catch(err => console.error('[summary] ai create_goal:', err));
    queueEmbeddingUpsert('goal', id).catch(err => console.error('[embedding] ai create_goal:', err));
    return res.json({ id });
  }

  if (type === 'update_task') {
    const { task_id, ...fields } = params;
    const updates: Record<string, unknown> = { updated_at: now };
    const allowed = ['due_date','start_date','priority','status','estimated_minutes','milestone_id'];
    for (const k of allowed) {
      if (fields[k] !== undefined) updates[k] = fields[k];
    }
    const entries = Object.entries(updates);
    const sets = entries.map(([col], i) => `${col}=$${i + 1}`).join(',');
    const vals = entries.map(([, v]) => v);
    await query(`UPDATE tasks SET ${sets} WHERE id=$${vals.length + 1}`, [...vals, task_id]);
    markEmbeddingStale('task', task_id as string).catch(() => {});
    queueEmbeddingUpsert('task', task_id as string).catch(err => console.error('[embedding] ai update_task:', err));
    return res.json({ ok: true });
  }

  if (type === 'update_goal') {
    const { goal_id, ...fields } = params;
    const updates: Record<string, unknown> = { updated_at: now };
    if (fields.deadline !== undefined) updates.deadline = fields.deadline;
    if (fields.status   !== undefined) updates.status   = fields.status;
    const entries = Object.entries(updates);
    const sets = entries.map(([col], i) => `${col}=$${i + 1}`).join(',');
    const vals = entries.map(([, v]) => v);
    await query(`UPDATE goals SET ${sets} WHERE id=$${vals.length + 1}`, [...vals, goal_id]);
    // Fire side effects after successful update (embedding invalidation + summary refresh)
    generateEntitySummary('goal', goal_id as string).catch(err => console.error('[summary] ai update_goal:', err));
    markEmbeddingStale('goal', goal_id as string).catch(() => {});
    queueEmbeddingUpsert('goal', goal_id as string).catch(err => console.error('[embedding] ai update_goal:', err));
    return res.json({ ok: true });
  }

  if (type === 'create_milestone') {
    const { goal_id, title, description, due_date, color } = params;
    const { rows: countRows } = await query('SELECT COUNT(*) as c FROM goal_milestones WHERE goal_id=$1', [goal_id]);
    const count = Number((countRows[0] as Record<string, unknown>).c ?? 0);
    await query(
      `INSERT INTO goal_milestones (id,goal_id,title,description,due_date,color,position,completed,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, goal_id, title ?? '', description ?? '', due_date ?? null, color ?? '#6366f1', count, false, now, now],
    );
    generateEntitySummary('milestone', id).catch(err => console.error('[summary] ai create_milestone:', err));
    return res.json({ id });
  }

  res.status(400).json({ error: `Unknown action type: ${type}` });
});

// GET /api/ai/proposals — pending AI-proposed actions
router.get('/proposals', async (_req, res) => {
  const { rows } = await query(
    `SELECT a.*, je.entry_date AS source_entry_date
     FROM ai_action_proposals a
     LEFT JOIN journal_entries je ON a.source_type='journal_entry' AND a.source_id=je.id
     WHERE a.status='pending'
     ORDER BY a.confidence DESC, a.created_at ASC`,
  );
  res.json(rows);
});

// POST /api/ai/proposals/:id/apply
router.post('/proposals/:id/apply', async (req, res) => {
  const proposalId = req.params.id;
  let actionType = '';
  let actionResult: Record<string, unknown> = {};

  await transaction(async client => {
    // Lock the row first to prevent duplicate-apply races
    const { rows } = await client.query(
      `SELECT * FROM ai_action_proposals WHERE id=$1 FOR UPDATE`,
      [proposalId],
    );
    if (!rows.length) {
      const err = Object.assign(new Error('Proposal not found'), { status: 404 });
      throw err;
    }
    const proposal = rows[0] as Record<string, unknown>;
    if (proposal.status !== 'pending') {
      const err = Object.assign(new Error(`Proposal already ${proposal.status as string}`), { status: 409 });
      throw err;
    }

    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(proposal.action_payload as string ?? '{}'); } catch { /* */ }

    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    actionType = proposal.action_type as string;

    if (actionType === 'create_task') {
      const { goal_id, parent_task_id, milestone_id, title, due_date, start_date, priority, estimated_minutes, status } = payload;
      const { rows: countRows } = await client.query('SELECT COUNT(*) as c FROM tasks WHERE goal_id=$1', [goal_id ?? null]);
      const count = Number((countRows[0] as Record<string, unknown>).c ?? 0);
      await client.query(
        `INSERT INTO tasks (id,goal_id,parent_task_id,milestone_id,title,description,status,priority,kind,tags_json,due_date,start_date,estimated_minutes,completed,position,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [newId, goal_id ?? null, parent_task_id ?? null, milestone_id ?? null, title, '', status ?? 'todo', priority ?? 'medium', 'manual', '[]', due_date ?? null, start_date ?? null, estimated_minutes ?? null, false, count, now, now],
      );
      actionResult.id = newId;
      actionResult.created_task_id = newId; // for post-commit side effects
    } else if (actionType === 'update_task') {
      const { task_id, ...fields } = payload;
      const updates: Record<string, unknown> = { updated_at: now };
      const allowed = ['due_date', 'start_date', 'priority', 'status', 'estimated_minutes', 'milestone_id'];
      for (const k of allowed) { if (fields[k] !== undefined) updates[k] = fields[k]; }
      const entries = Object.entries(updates);
      const sets = entries.map(([col], i) => `${col}=$${i + 1}`).join(',');
      const vals = entries.map(([, v]) => v);
      await client.query(`UPDATE tasks SET ${sets} WHERE id=$${vals.length + 1}`, [...vals, task_id]);
      actionResult.updated_task_id = task_id; // for post-commit side effects
    } else if (actionType === 'create_goal') {
      const { title, description, deadline, category } = payload;
      await client.query(
        `INSERT INTO goals (id,title,description,category,status,progress,deadline,overdue,activity_level,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [newId, title, description ?? '', category ?? 'Work', 'Safe', 0, deadline ?? null, false, 1, now, now],
      );
      actionResult.id = newId;
      actionResult.created_goal_id = newId; // for post-commit side effects
    } else if (actionType === 'update_goal') {
      const { goal_id, ...fields } = payload;
      const updates: Record<string, unknown> = { updated_at: now };
      if (fields.deadline !== undefined) updates.deadline = fields.deadline;
      if (fields.status   !== undefined) updates.status   = fields.status;
      const entries = Object.entries(updates);
      const sets = entries.map(([col], i) => `${col}=$${i + 1}`).join(',');
      const vals = entries.map(([, v]) => v);
      await client.query(`UPDATE goals SET ${sets} WHERE id=$${vals.length + 1}`, [...vals, goal_id]);
      // Store goal_id so post-commit side effects can be triggered after the transaction
      actionResult.updated_goal_id = goal_id;
    } else if (actionType === 'create_milestone') {
      const { goal_id, title, description, due_date, color } = payload;
      const { rows: countRows } = await client.query('SELECT COUNT(*) as c FROM goal_milestones WHERE goal_id=$1', [goal_id]);
      const count = Number((countRows[0] as Record<string, unknown>).c ?? 0);
      await client.query(
        `INSERT INTO goal_milestones (id,goal_id,title,description,due_date,color,position,completed,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [newId, goal_id, title ?? '', description ?? '', due_date ?? null, color ?? '#6366f1', count, false, now, now],
      );
      actionResult.id = newId;
      actionResult.created_milestone_id = newId; // for post-commit summary generation
    } else {
      const err = Object.assign(new Error(`Unknown action type: ${actionType}`), { status: 400 });
      throw err;
    }

    // Transition proposal to applied in same transaction — prevents double-apply
    await client.query(
      `UPDATE ai_action_proposals SET status='applied', applied_at=$1 WHERE id=$2`,
      [now, proposalId],
    );
  });

  // Post-commit side effects: run after the transaction so they're never rolled back with it.
  // We fire-and-forget so the response is immediate, but these always execute after commit.
  if (actionResult.created_task_id) {
    const tid = actionResult.created_task_id as string;
    generateEntitySummary('task', tid).catch(err => console.error('[summary] proposal create_task:', err));
    queueEmbeddingUpsert('task', tid).catch(err => console.error('[embedding] proposal create_task:', err));
    delete actionResult.created_task_id;
  }
  if (actionResult.updated_task_id) {
    const tid = actionResult.updated_task_id as string;
    markEmbeddingStale('task', tid).catch(() => {});
    queueEmbeddingUpsert('task', tid).catch(err => console.error('[embedding] proposal update_task:', err));
    delete actionResult.updated_task_id;
  }
  if (actionResult.created_goal_id) {
    const gid = actionResult.created_goal_id as string;
    generateEntitySummary('goal', gid).catch(err => console.error('[summary] proposal create_goal:', err));
    queueEmbeddingUpsert('goal', gid).catch(err => console.error('[embedding] proposal create_goal:', err));
    delete actionResult.created_goal_id;
  }
  if (actionResult.updated_goal_id) {
    const gid = actionResult.updated_goal_id as string;
    generateEntitySummary('goal', gid).catch(err => console.error('[summary] proposal update_goal:', err));
    markEmbeddingStale('goal', gid).catch(() => {});
    queueEmbeddingUpsert('goal', gid).catch(err => console.error('[embedding] proposal update_goal:', err));
    delete actionResult.updated_goal_id;
  }
  if (actionResult.created_milestone_id) {
    const mid = actionResult.created_milestone_id as string;
    generateEntitySummary('milestone', mid).catch(err => console.error('[summary] proposal create_milestone:', err));
    delete actionResult.created_milestone_id;
  }

  res.json({ ok: true, action_type: actionType, ...actionResult });
});

// POST /api/ai/proposals/:id/reject — only pending proposals may be rejected
router.post('/proposals/:id/reject', async (req, res) => {
  await transaction(async client => {
    const { rows } = await client.query(
      `SELECT status FROM ai_action_proposals WHERE id=$1 FOR UPDATE`,
      [req.params.id],
    );
    if (!rows.length) {
      throw Object.assign(new Error('Proposal not found'), { status: 404 });
    }
    const { status } = rows[0] as { status: string };
    if (status !== 'pending') {
      throw Object.assign(new Error(`Cannot reject a proposal with status '${status}'`), { status: 409 });
    }
    await client.query(
      `UPDATE ai_action_proposals SET status='rejected' WHERE id=$1`,
      [req.params.id],
    );
  });
  res.json({ ok: true });
});

// GET /api/ai/schedule-preview — next 35 days with tasks, meetings, proposals, scheduler result
router.get('/schedule-preview', async (_req, res) => {
  // Fetch prefs first so we can determine today in the user's configured timezone
  const { rows: prefsRows } = await query("SELECT * FROM user_schedule_prefs WHERE id='default'");
  const prefs = (prefsRows[0] ?? { work_days: '[1,2,3,4,5]', daily_capacity_minutes: 480, buffer_ratio: 0.15 }) as Record<string, unknown>;
  const tz = prefs.timezone as string | undefined;
  const todayStr = tz
    ? new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
    : fmtYMD(new Date());
  const today = new Date(todayStr + 'T00:00:00');
  const end = new Date(today);
  end.setDate(end.getDate() + 34);
  const endStr = fmtYMD(end);

  const [
    { rows: tasks },
    { rows: meetings },
    { rows: deadlines },
    { rows: proposals },
    { rows: overrides },
    { rows: allSchedulerTasks },
    { rows: blockerEdges },
  ] = await Promise.all([
    query(
      `SELECT id, title, goal_id, milestone_id, due_date, estimated_minutes, priority, status
       FROM tasks WHERE due_date BETWEEN $1 AND $2 AND completed=false ORDER BY due_date ASC`,
      [todayStr, endStr],
    ),
    query(
      `SELECT id, title, goal_id, scheduled_at, duration_minutes, location
       FROM meetings WHERE DATE(scheduled_at::timestamp) BETWEEN $1 AND $2 ORDER BY scheduled_at ASC`,
      [todayStr, endStr],
    ),
    query(
      `SELECT id, goal_id, date, title FROM goal_deadlines WHERE date BETWEEN $1 AND $2 ORDER BY date ASC`,
      [todayStr, endStr],
    ),
    query(`SELECT id, action_type, action_payload, explanation, confidence, source_type, source_id FROM ai_action_proposals WHERE status='pending'`),
    query(`SELECT date, available_minutes, note FROM schedule_day_overrides WHERE date BETWEEN $1 AND $2`, [todayStr, endStr]),
    query(
      `SELECT t.id, t.title, t.estimated_minutes, t.due_date, t.priority,
              COALESCE(SUM(ws.minutes), 0) as logged_minutes
       FROM tasks t
       LEFT JOIN work_sessions ws ON ws.task_id = t.id AND ws.minutes IS NOT NULL
       WHERE t.completed = false AND t.estimated_minutes > 0
       GROUP BY t.id, t.title, t.estimated_minutes, t.due_date, t.priority`,
    ),
    query(
      `SELECT source_id as blocker_id, target_id as task_id
       FROM edges WHERE relationship='blocks' AND source_type='task' AND target_type='task'`,
    ),
  ]);

  // Build blocker map for scheduler
  const blockerMap = new Map<string, string[]>();
  for (const e of blockerEdges as { blocker_id: string; task_id: string }[]) {
    if (!blockerMap.has(e.task_id)) blockerMap.set(e.task_id, []);
    blockerMap.get(e.task_id)!.push(e.blocker_id);
  }

  // Locked events within the 35-day preview horizon also reduce capacity
  const { rows: previewLockedEvents } = await query(
    `SELECT day_index, duration_hours, week_start
     FROM events WHERE (locked = true OR type = 'unavailable')
       AND week_start IS NOT NULL
       AND week_start BETWEEN $1 AND $2`,
    [todayStr, endStr],
  ) as { rows: { day_index: number; duration_hours: number; week_start: string }[] };

  const previewEventMeetings: { date: string; duration_minutes: number }[] = [];
  for (const ev of previewLockedEvents) {
    const [wy, wm, wd] = ev.week_start.split('-').map(Number);
    const weekMonday = new Date(wy, wm - 1, wd);
    weekMonday.setHours(0, 0, 0, 0);
    const eventDate = new Date(weekMonday);
    eventDate.setDate(weekMonday.getDate() + (ev.day_index % 7));
    const dateStr = fmtYMD(eventDate);
    if (dateStr >= todayStr && dateStr <= endStr) {
      previewEventMeetings.push({ date: dateStr, duration_minutes: Math.round(ev.duration_hours * 60) });
    }
  }

  const schedulerResult = computeSchedule({
    tasks: (allSchedulerTasks as Record<string, unknown>[]).map(t => ({
      id: t.id as string,
      title: t.title as string,
      // Use remaining work so already-logged time is not double-counted
      estimated_minutes: Math.max(0, Number(t.estimated_minutes) - Number(t.logged_minutes ?? 0)) || Number(t.estimated_minutes),
      due_date: (t.due_date as string | null) ?? null,
      priority: (t.priority as string) ?? 'medium',
      blocker_ids: blockerMap.get(t.id as string) ?? [],
    })),
    meetings: [
      ...(meetings as Record<string, unknown>[]).map(m => ({
        date: String(m.scheduled_at).slice(0, 10),
        duration_minutes: Number(m.duration_minutes ?? 0),
      })),
      ...previewEventMeetings,
    ],
    prefs: {
      // DB stores work_days as ISO 1=Mon…7=Sun; scheduler uses getDay() 0=Sun…6=Sat. Convert via % 7.
      work_days: (JSON.parse(prefs.work_days as string) as number[]).map(d => d % 7),
      daily_capacity_minutes: Number(prefs.daily_capacity_minutes ?? 480),
      buffer_ratio: Number(prefs.buffer_ratio ?? 0.15),
      timezone: prefs.timezone as string | undefined,
    },
    overrides: (overrides as { date: string; available_minutes: number }[]),
    horizon_days: 35,
  });

  const tasksByDate: Record<string, unknown[]> = {};
  for (const t of tasks) {
    const d = (t as Record<string, unknown>).due_date as string;
    if (!tasksByDate[d]) tasksByDate[d] = [];
    tasksByDate[d].push(t);
  }

  const meetingsByDate: Record<string, unknown[]> = {};
  for (const m of meetings) {
    const d = String((m as Record<string, unknown>).scheduled_at).slice(0, 10);
    if (!meetingsByDate[d]) meetingsByDate[d] = [];
    meetingsByDate[d].push(m);
  }

  const deadlinesByDate: Record<string, string[]> = {};
  for (const dl of deadlines) {
    const d = (dl as Record<string, unknown>).date as string;
    if (!deadlinesByDate[d]) deadlinesByDate[d] = [];
    deadlinesByDate[d].push((dl as Record<string, unknown>).title as string);
  }

  const proposalsByDate: Record<string, unknown[]> = {};
  for (const p of proposals) {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse((p as Record<string, unknown>).action_payload as string ?? '{}'); } catch { /* */ }
    const targetDate = String(payload.due_date ?? payload.date ?? payload.scheduled_at ?? '').slice(0, 10);
    if (targetDate >= todayStr && targetDate <= endStr) {
      if (!proposalsByDate[targetDate]) proposalsByDate[targetDate] = [];
      proposalsByDate[targetDate].push({ ...(p as Record<string, unknown>), target_date: targetDate, params: payload });
    }
  }

  const overridesByDate: Record<string, unknown> = {};
  for (const o of overrides) overridesByDate[(o as Record<string, unknown>).date as string] = o;

  const days = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = fmtYMD(d);
    return {
      date: dateStr,
      tasks: tasksByDate[dateStr] ?? [],
      meetings: meetingsByDate[dateStr] ?? [],
      deadline_titles: deadlinesByDate[dateStr] ?? [],
      proposals: proposalsByDate[dateStr] ?? [],
      override: overridesByDate[dateStr] ?? null,
    };
  });

  // Build a task lookup so the frontend can render day_assignments with titles/details
  const taskLookup: Record<string, { title: string; goal_id: string | null; priority: string; estimated_minutes: number }> = {};
  for (const t of allSchedulerTasks as Record<string, unknown>[]) {
    taskLookup[t.id as string] = {
      title: t.title as string,
      goal_id: (t as Record<string, unknown>).goal_id as string | null ?? null,
      priority: t.priority as string ?? 'medium',
      estimated_minutes: Number(t.estimated_minutes ?? 0),
    };
  }

  res.json({ days, scheduler_result: schedulerResult, task_lookup: taskLookup });
});

// GET /api/ai/entity-summaries/:type/:id
router.get('/entity-summaries/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  const { rows } = await query(
    'SELECT summary_type, summary_text FROM entity_summaries WHERE entity_type=$1 AND entity_id=$2',
    [type, id],
  );
  if (!rows.length) return res.status(404).json({ error: 'No summaries found for this entity' });
  const summaries: Record<string, string> = {};
  for (const r of rows) {
    summaries[(r as Record<string, unknown>).summary_type as string] = (r as Record<string, unknown>).summary_text as string;
  }
  res.json({ entity_type: type, entity_id: id, summaries });
});

// GET /api/ai/health
// GET /api/ai/retrieval/debug — requires RETRIEVAL_DEBUG=true; never enabled merely by NODE_ENV
router.get('/retrieval/debug', async (req, res) => {
  if (process.env.RETRIEVAL_DEBUG !== 'true') {
    return res.status(403).json({ error: 'Retrieval debug is disabled. Set RETRIEVAL_DEBUG=true to enable.' });
  }
  const { q, goalIds, limit = '10', horizonDays = '14' } = req.query as Record<string, string>;
  try {
    const result = await buildRetrievalContext({
      query: q || undefined,
      goalIds: goalIds ? goalIds.split(',').filter(Boolean) : undefined,
      horizonDays: Number(horizonDays),
      limit: Number(limit),
    });
    res.json({
      card_count: result.cards.length,
      query: q || null,
      vector_degraded: result.vector_degraded,
      vector_degraded_reason: result.vector_degraded_reason,
      cards: result.cards.map(c => ({
        entity_type: c.entity_type,
        entity_id: c.entity_id,
        title: c.title,
        status: c.status,
        priority: c.priority,
        due_date: c.due_date ?? null,
        estimated_minutes: c.estimated_minutes ?? null,
        remaining_minutes: c.remaining_minutes ?? null,
        planning_summary_snippet: c.planning_summary?.slice(0, 120) ?? null,
        blocker_ids: c.blocker_ids ?? [],
        evidence_facts: c.evidence_facts ?? [],
        similarity: c.similarity ?? null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/health', async (_req, res) => {
  const health = await ollamaHealth();
  res.json({ ...health, model: CHAT_MODEL });
});

// GET /api/ai/org-inbox — surfaces unreviewed items that need human attention
router.get('/org-inbox', async (_req, res) => {
  const [
    { rows: pendingProposals },
    { rows: failedJournals },
    { rows: needsReviewFacts },
    { rows: staleGoalSummaries },
    { rows: unestimatedHighPriority },
  ] = await Promise.all([
    query(`
      SELECT id, action_type, action_payload, explanation, confidence, created_at
      FROM ai_action_proposals WHERE status='pending'
      ORDER BY confidence DESC, created_at ASC LIMIT 20`),
    query(`
      SELECT id, entry_date, ingestion_status, ingestion_attempts
      FROM journal_entries WHERE ingestion_status IN ('failed','needs_review')
      ORDER BY entry_date DESC LIMIT 20`),
    query(`
      SELECT ef.id, ef.fact_type, ef.fact_text, ef.confidence, ef.source_type, ef.source_id, ef.target_type, ef.target_id
      FROM extracted_facts ef
      WHERE ef.needs_review = true AND ef.status = 'active'
      ORDER BY ef.confidence ASC LIMIT 20`),
    query(`
      SELECT g.id, g.title, g.status
      FROM goals g
      WHERE g.archived_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM entity_summaries es
          WHERE es.entity_type='goal' AND es.entity_id=g.id
            AND es.summary_type='planning'
            AND es.needs_review = false
        )
      LIMIT 10`),
    query(`
      SELECT t.id, t.title, t.priority, t.due_date, g.title AS goal_title
      FROM tasks t
      LEFT JOIN goals g ON g.id = t.goal_id
      WHERE t.completed = false
        AND t.priority IN ('high','critical')
        AND (t.estimated_minutes IS NULL OR t.estimated_minutes = 0)
        AND (g.archived_at IS NULL OR t.goal_id IS NULL)
      LIMIT 10`),
  ]);

  const sections = [
    { bucket: 'pending_proposals',         items: pendingProposals,         label: 'AI proposals awaiting review' },
    { bucket: 'failed_journal_ingestion',  items: failedJournals,           label: 'Journal entries with failed AI extraction' },
    { bucket: 'facts_needing_review',      items: needsReviewFacts,         label: 'Extracted facts flagged for human review' },
    { bucket: 'goals_missing_summary',     items: staleGoalSummaries,       label: 'Goals without a planning summary' },
    { bucket: 'high_priority_unestimated', items: unestimatedHighPriority,  label: 'High/critical tasks missing time estimate' },
  ];

  const total = sections.reduce((s, sec) => s + sec.items.length, 0);
  res.json({ total, sections, timestamp: new Date().toISOString() });
});

// POST /api/ai/entity-summaries/backfill
// Generates deterministic planning/evidence/graph_card summaries for all entities
// that are missing a planning summary.
router.post('/entity-summaries/backfill', async (_req, res) => {
  const ENTITY_TYPES: Array<{ table: string; type: string }> = [
    { table: 'goals', type: 'goal' },
    { table: 'tasks', type: 'task' },
    { table: 'goal_milestones', type: 'milestone' },
    { table: 'resources', type: 'resource' },
    { table: 'meetings', type: 'meeting' },
  ];

  let queued = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const { table, type } of ENTITY_TYPES) {
    const { rows: entities } = await query(
      `SELECT e.id FROM ${table} e
       WHERE NOT EXISTS (
         SELECT 1 FROM entity_summaries es
         WHERE es.entity_type=$1 AND es.entity_id=e.id AND es.summary_type='planning'
       )
       LIMIT 200`,
      [type],
    );

    for (const row of entities as { id: string }[]) {
      try {
        await generateDeterministicSummaries(type, row.id);
        queued++;
      } catch (err) {
        errors.push(`${type}/${row.id}: ${String(err)}`);
      }
    }

    const { rows: withSummary } = await query(
      `SELECT COUNT(*) as c FROM ${table} e
       WHERE EXISTS (
         SELECT 1 FROM entity_summaries es
         WHERE es.entity_type=$1 AND es.entity_id=e.id AND es.summary_type='planning'
       )`,
      [type],
    );
    skipped += Number((withSummary[0] as Record<string, unknown>).c ?? 0);
  }

  res.json({ queued, skipped, errors: errors.slice(0, 20) });
});

// ─── Chat session management (Epic 42 — durable conversation runtime) ─────────

// GET /api/ai/sessions — list sessions (most recent first)
router.get('/sessions', async (_req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.title, s.model, s.created_at, s.updated_at,
            COUNT(m.id)::int AS message_count
     FROM chat_sessions s
     LEFT JOIN chat_messages m ON m.session_id = s.id AND m.role != 'system'
     WHERE s.archived = false
     GROUP BY s.id
     ORDER BY s.updated_at DESC
     LIMIT 100`,
  );
  res.json(rows);
});

// POST /api/ai/sessions — create a new session
router.post('/sessions', async (req, res) => {
  const id  = crypto.randomUUID();
  const now = new Date().toISOString();
  const { title } = req.body as { title?: string };
  await query(
    `INSERT INTO chat_sessions (id, title, model, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, title ?? null, CHAT_MODEL, now, now],
  );
  res.json({ id, title: title ?? null, model: CHAT_MODEL, created_at: now, updated_at: now });
});

// GET /api/ai/sessions/:id/messages — retrieve message history for a session
router.get('/sessions/:id/messages', async (req, res) => {
  const { rows: session } = await query('SELECT id FROM chat_sessions WHERE id=$1', [req.params.id]);
  if (!session.length) return res.status(404).json({ error: 'Session not found' });
  const { rows } = await query(
    `SELECT id, role, content, created_at FROM chat_messages
     WHERE session_id=$1 AND role != 'system'
     ORDER BY created_at ASC`,
    [req.params.id],
  );
  res.json(rows);
});

// POST /api/ai/sessions/:id/chat — send a message in a session (history auto-loaded)
router.post('/sessions/:id/chat', rateLimit(60, 60_000, 'ai-session-chat'), async (req, res) => {
  const { message }: { message: string } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  // Load or create session
  const { rows: sessionRows } = await query('SELECT id FROM chat_sessions WHERE id=$1', [req.params.id]);
  if (!sessionRows.length) return res.status(404).json({ error: 'Session not found' });

  // Load history (excluding system messages)
  const { rows: historyRows } = await query(
    `SELECT role, content FROM chat_messages WHERE session_id=$1 AND role != 'system' ORDER BY created_at ASC`,
    [req.params.id],
  );
  const history = historyRows as { role: 'user' | 'assistant'; content: string }[];
  const messages: ChatMessage[] = [...history, { role: 'user', content: message }];

  try {
    const context = await getScheduleContext(message);
    assertSafeAIContext(context);
    const systemWithContext = `${SYSTEM_PROMPT}\n\n## Current data (as of ${context.today}):\n${JSON.stringify(context, null, 2)}`;

    const ollamaMessages = [
      { role: 'system' as const, content: systemWithContext },
      ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    const raw = await chat(ollamaMessages, { temperature: 0.3, max_tokens: 8192 });

    let parsed: { reply: string; actions?: unknown[]; feasibility?: unknown };
    try { parsed = parseJSON(raw); } catch { parsed = { reply: raw, actions: [] }; }

    // Persist user message + assistant reply
    const now = new Date().toISOString();
    const msgId1 = crypto.randomUUID();
    const msgId2 = crypto.randomUUID();
    await query(
      `INSERT INTO chat_messages (id, session_id, role, content, created_at) VALUES ($1,$2,'user',$3,$4),($5,$2,'assistant',$6,$4)`,
      [msgId1, req.params.id, message, now, msgId2, parsed.reply],
    );
    await query(`UPDATE chat_sessions SET updated_at=$1 WHERE id=$2`, [now, req.params.id]);

    // Handle proposal persistence (same idempotency logic as /chat)
    if (Array.isArray(parsed.actions) && parsed.actions.length) {
      for (const action of parsed.actions as Array<{ type?: string; description?: string; params?: Record<string, unknown> }>) {
        if (!action.type) continue;
        const payloadStr = JSON.stringify(action.params ?? {});
        const idemKey = crypto.createHash('sha256').update(`${action.type}\0${payloadStr}`).digest('hex');
        await query(
          `INSERT INTO ai_action_proposals (id, action_type, action_payload, explanation, confidence, status, source_type, source_id, created_at, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,'pending','chat',NULL,$6,$7)
           ON CONFLICT (action_type, idempotency_key) WHERE status='pending' AND idempotency_key IS NOT NULL DO NOTHING`,
          [crypto.randomUUID(), action.type, payloadStr, action.description ?? null, 0.8, now, idemKey],
        );
      }
    }

    res.json({ ...parsed, session_id: req.params.id });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch')) {
      return res.status(503).json({ error: `Cannot reach Ollama at ${process.env.OLLAMA_HOST ?? 'http://localhost:11434'}. Model: ${CHAT_MODEL}` });
    }
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/ai/sessions/:id — archive (soft delete) a session
router.delete('/sessions/:id', async (req, res) => {
  const { rowCount } = await query(`UPDATE chat_sessions SET archived=true WHERE id=$1`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Session not found' });
  res.json({ ok: true });
});

export { router as aiRouter };
