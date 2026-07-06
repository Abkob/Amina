import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, Zap, RefreshCw, CheckCircle, X, AlertTriangle, ChevronRight, ChevronDown, Diamond, Calendar, ChevronLeft, MessageSquare, Plus, Paperclip, PanelLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSchedulePreview, useGoals, useInvalidate, useChatSessions, useCreateChatSession, useDeleteChatSession, useSendSessionMessage, type ScheduleDay, type SchedulerResult, type ScheduleTaskInfo, type DayAssignment } from '../api/hooks';
import { apiFetch, apiPost } from '../utils/apiFetch';
import { useAppStore } from '../store/useAppStore';
import { PlanCalendarWidget, type ChatPlan } from './copilot/PlanCalendarWidget';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CopilotAction {
  id: string;
  type: 'create_task' | 'create_goal' | 'update_task' | 'update_goal' | 'create_milestone' | 'attach_resource';
  description: string;
  params: Record<string, unknown>;
  status: 'pending' | 'confirmed' | 'skipped' | 'applying' | 'done' | 'error';
  /** Durable proposal backing this card — apply/skip go through the proposal API. */
  proposal_id?: string;
  /** Set when the server rejected this model action during validation. */
  rejected_reason?: string;
}

/** Map a durable proposal status onto the card status used by the UI. */
function statusFromProposal(proposalStatus: string | undefined): CopilotAction['status'] {
  switch (proposalStatus) {
    case 'applied':  return 'done';
    case 'rejected': return 'skipped';
    case 'pending':  return 'pending';
    default:         return 'error'; // proposal missing/expired
  }
}

/** Query keys affected by applying a task/goal/milestone proposal. */
const PROPOSAL_AFFECTED_KEYS = [
  'goals', 'goals-health', 'goal-tasks', 'tasks', 'milestones',
  'proposals', 'ai-proposals', 'schedule-preview', 'data-readiness', 'org-inbox',
] as const;

interface FeasibilityIssue {
  goal_id: string;
  goal_title: string;
  issue: string;
  severity: 'warning' | 'critical';
}

interface FeasibilityResult {
  status: 'on_track' | 'at_risk' | 'critical';
  summary: string;
  issues?: FeasibilityIssue[];
}

interface ChatCitation {
  entity_type: string;
  entity_id: string;
  title: string;
  matched_via: string[];
  similarity?: number;
  topics?: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: CopilotAction[];
  feasibility?: FeasibilityResult;
  citations?: ChatCitation[];
  /** interactive calendar payload when the turn was a plan request */
  plan?: ChatPlan;
  /** server-side message id — needed to persist plan widget state */
  serverMsgId?: string;
  timestamp: Date;
  error?: string;
}

interface GoalHealth {
  id: string;
  title: string;
  deadline: string | null;
  days_until_deadline: number | null;
  feasibility: 'on_track' | 'at_risk' | 'overdue' | null;
  total_incomplete_tasks: number;
  total_mins_remaining: number;
  category: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMins(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const isH2     = line.startsWith('## ');
    const isH3     = line.startsWith('### ');
    const isBullet = /^[-*•]\s/.test(line);
    const content  = line.replace(/^#{2,3}\s/, '').replace(/^[-*•]\s/, '');

    const inline = (s: string) =>
      s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, j) => {
        if (p.startsWith('**') && p.endsWith('**'))
          return <strong key={j} className="font-semibold text-gray-100">{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`'))
          return <code key={j} className="bg-white/10 px-1 py-0.5 rounded text-[11px] font-mono text-indigo-300">{p.slice(1, -1)}</code>;
        return p;
      });

    if (isH2)    return <p key={i} className="text-[13px] font-bold text-white mt-3 mb-1 first:mt-0">{content}</p>;
    if (isH3)    return <p key={i} className="text-xs font-semibold text-gray-200 mt-2 mb-0.5">{content}</p>;
    if (isBullet) return (
      <div key={i} className="flex gap-2 my-0.5 pl-1">
        <span className="text-indigo-400 mt-0.5 shrink-0 text-[10px]">•</span>
        <span className="text-[13px] text-gray-300 leading-relaxed">{inline(content)}</span>
      </div>
    );
    if (!line.trim()) return <div key={i} className="h-2" />;
    return <p key={i} className="text-[13px] text-gray-300 leading-relaxed">{inline(line)}</p>;
  });
}

// ── Action Card ───────────────────────────────────────────────────────────────

function ActionCard({ action, onConfirm, onSkip }: {
  action: CopilotAction;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const isDone     = action.status === 'done';
  const isSkipped  = action.status === 'skipped';
  const isApplying = action.status === 'applying';
  const isError    = action.status === 'error';
  const isPending  = action.status === 'pending';

  const typeLabel = { create_task: 'New Task', create_goal: 'New Goal', update_task: 'Update Task', update_goal: 'Update Goal' }[action.type];
  const typeDot   = { create_task: 'bg-indigo-400', create_goal: 'bg-purple-400', update_task: 'bg-amber-400', update_goal: 'bg-amber-400' }[action.type];

  const p = action.params;

  if (isDone)    return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
      <CheckCircle size={12} className="text-emerald-400 shrink-0" />
      <span className="text-[12px] text-emerald-300 flex-1 min-w-0 truncate">{action.description}</span>
      <span className="text-[10px] text-emerald-500 shrink-0">Applied</span>
    </div>
  );

  if (isSkipped) return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-white/3 border border-white/8 opacity-40">
      <span className="text-[12px] text-gray-400 flex-1 min-w-0 truncate line-through">{action.description}</span>
      <span className="text-[10px] text-gray-600 shrink-0">Skipped</span>
    </div>
  );

  return (
    <div className={`rounded-xl border ${isError ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-white/5'} p-3`}>
      <div className="flex items-start gap-2.5">
        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${typeDot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wide">{typeLabel}</span>
          </div>
          <p className="text-[13px] text-gray-200 leading-snug">{action.description}</p>
          {/* Param chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {p.title       && <span className="text-[10px] bg-white/8 text-gray-400 px-2 py-0.5 rounded-full">{String(p.title)}</span>}
            {p.due_date    && <span className="text-[10px] bg-white/8 text-gray-400 px-2 py-0.5 rounded-full">due {String(p.due_date)}</span>}
            {p.priority    && <span className="text-[10px] bg-white/8 text-gray-400 px-2 py-0.5 rounded-full capitalize">{String(p.priority)}</span>}
            {p.estimated_minutes && <span className="text-[10px] bg-white/8 text-gray-400 px-2 py-0.5 rounded-full">{fmtMins(Number(p.estimated_minutes))}</span>}
            {p.deadline    && <span className="text-[10px] bg-white/8 text-gray-400 px-2 py-0.5 rounded-full">deadline {String(p.deadline)}</span>}
            {p.category    && <span className="text-[10px] bg-white/8 text-gray-400 px-2 py-0.5 rounded-full">{String(p.category)}</span>}
          </div>
        </div>
      </div>
      {isError && <p className="text-[11px] text-red-400 mt-2 pl-4">Failed to apply — try again</p>}
      {isPending && (
        <div className="flex items-center gap-2 mt-3 pl-4">
          <button
            onClick={onConfirm}
            disabled={isApplying}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-[12px] font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isApplying ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={11} />}
            {isApplying ? 'Applying…' : 'Apply'}
          </button>
          <button onClick={onSkip} className="px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-300 transition-colors">
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ── Feasibility Banner ────────────────────────────────────────────────────────

function FeasibilityBanner({ f }: { f: FeasibilityResult }) {
  const [expanded, setExpanded] = useState(false);
  const cls = f.status === 'on_track'
    ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-300'
    : f.status === 'at_risk'
      ? 'border-amber-500/25 bg-amber-500/8 text-amber-300'
      : 'border-red-500/25 bg-red-500/8 text-red-300';

  return (
    <div className={`mt-3 rounded-xl border p-3 ${cls}`}>
      <button className="flex items-center gap-2 w-full text-left" onClick={() => setExpanded(x => !x)}>
        {f.status === 'on_track' ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
        <span className="text-[12px] font-medium flex-1">{f.summary}</span>
        {f.issues?.length ? (expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />) : null}
      </button>
      {expanded && f.issues?.map((issue, i) => (
        <div key={i} className="mt-2 pl-5">
          <p className="text-[11px] opacity-80 leading-relaxed">
            <span className="font-semibold">{issue.goal_title}:</span> {issue.issue}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, sessionId, onConfirmAction, onSkipAction }: {
  msg: ChatMessage;
  sessionId: string | null;
  onConfirmAction: (msgId: string, actionId: string) => void;
  onSkipAction:    (msgId: string, actionId: string) => void;
}) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] bg-indigo-600 rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
          <p className="text-[13px] text-white leading-relaxed">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 max-w-[85%]">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <Zap size={13} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {msg.error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl rounded-tl-sm px-4 py-3">
            <p className="text-[13px] text-red-300">{msg.error}</p>
          </div>
        ) : (
          <div className="bg-white/6 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            {renderMarkdown(msg.content)}
          </div>
        )}
        {msg.plan && (
          <PlanCalendarWidget plan={msg.plan} sessionId={sessionId} messageId={msg.serverMsgId} />
        )}
        {msg.feasibility && <FeasibilityBanner f={msg.feasibility} />}
        {msg.actions?.length ? (
          <div className="mt-2 space-y-2">
            {msg.actions.map(a => (
              <ActionCard
                key={a.id}
                action={a}
                onConfirm={() => onConfirmAction(msg.id, a.id)}
                onSkip={()    => onSkipAction(msg.id, a.id)}
              />
            ))}
          </div>
        ) : null}
        {msg.citations?.length ? <CitationRow citations={msg.citations} /> : null}
      </div>
    </div>
  );
}

// ── Citations ─────────────────────────────────────────────────────────────────
// Every assistant answer discloses exactly what was in the model's context and
// why each source was retrieved (lane provenance + similarity + topics).

const LANE_LABEL: Record<string, string> = {
  sql: 'planning window',
  vector: 'semantic match',
  graph: 'graph link',
  topic: 'topic member',
  recency: 'recent journal',
};

function CitationRow({ citations }: { citations: ChatCitation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[10px] font-mono text-gray-500 hover:text-gray-300 flex items-center gap-1"
      >
        {open ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
        Sources: {citations.length} item{citations.length !== 1 ? 's' : ''} in context
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 max-h-48 overflow-y-auto pr-1">
          {citations.map((c, i) => (
            <div key={`${c.entity_type}-${c.entity_id}-${i}`} className="flex items-center gap-2 text-[10px] bg-white/4 border border-white/6 rounded-lg px-2 py-1">
              <span className="font-mono uppercase text-gray-500 shrink-0">{c.entity_type.replace('_', ' ')}</span>
              <span className="text-gray-300 truncate flex-1">{c.title}</span>
              <span className="font-mono text-gray-600 shrink-0">
                {c.matched_via.map(v => LANE_LABEL[v] ?? v).join(' · ')}
                {c.similarity !== undefined && ` (${(c.similarity * 100).toFixed(0)}%)`}
              </span>
              {c.topics?.length ? (
                <span className="font-mono text-indigo-400 shrink-0" title={`Topics: ${c.topics.join(', ')}`}>#{c.topics[0]}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Goal Health Panel ─────────────────────────────────────────────────────────

function GoalHealthPanel({ onGoalClick }: { onGoalClick: (title: string) => void }) {
  const [goals, setGoals] = useState<GoalHealth[]>([]);

  useEffect(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    apiFetch<Record<string, unknown>[]>('/api/goals')
      .then(async (gs) => {
        const active = gs.filter(g => !g.archived_at);
        const health = await Promise.all(active.map(async g => {
          const tasks = await apiFetch<Record<string, unknown>[]>(`/api/tasks?goal_id=${g.id}`);
          const incomplete = tasks.filter(t => !t.completed && t.status !== 'done');
          const totalMins  = incomplete.reduce((s, t) => s + (Number(t.estimated_minutes) || 0), 0);
          const deadline   = g.deadline as string | null;
          let feasibility: GoalHealth['feasibility'] = null;
          let daysUntil: number | null = null;
          if (deadline) {
            const dl = new Date(deadline);
            daysUntil = Math.ceil((dl.getTime() - today.getTime()) / 86400000);
            const avail = Math.max(0, daysUntil) * 8 * 60;
            feasibility = daysUntil < 0 ? 'overdue' : totalMins > avail * 0.9 ? 'at_risk' : 'on_track';
          }
          return { id: String(g.id), title: String(g.title), deadline, days_until_deadline: daysUntil, feasibility, total_incomplete_tasks: incomplete.length, total_mins_remaining: totalMins, category: String(g.category ?? '') };
        }));
        // Sort: overdue first, then at_risk, then on_track, then no deadline
        const order = { overdue: 0, at_risk: 1, on_track: 2, null: 3 };
        health.sort((a, b) => (order[String(a.feasibility) as keyof typeof order] ?? 3) - (order[String(b.feasibility) as keyof typeof order] ?? 3));
        setGoals(health);
      })
      .catch(() => {});
  }, []);

  const dot = (f: GoalHealth['feasibility']) => ({
    overdue:  'bg-red-400',
    at_risk:  'bg-amber-400',
    on_track: 'bg-emerald-400',
  }[f ?? ''] ?? 'bg-gray-600');

  const badge = (g: GoalHealth) => {
    if (!g.deadline || g.days_until_deadline === null) return null;
    const d = g.days_until_deadline;
    const label = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Today' : `${d}d`;
    const cls   = d < 0 ? 'text-red-400' : d <= 3 ? 'text-amber-400' : 'text-gray-500';
    return <span className={`text-[10px] font-mono ml-auto shrink-0 ${cls}`}>{label}</span>;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-5 pb-3 shrink-0">
        <p className="text-[10px] font-mono uppercase tracking-widest text-gray-600 mb-1">Goals</p>
        <p className="text-xs font-semibold text-gray-300">{goals.length} active</p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
        {goals.length === 0 && (
          <div className="space-y-1.5 px-1 mt-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-white/4 animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        )}
        {goals.map(g => (
          <button
            key={g.id}
            onClick={() => onGoalClick(g.title)}
            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/6 transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full shrink-0 ${dot(g.feasibility)}`} />
              <span className="text-[12px] text-gray-300 group-hover:text-white transition-colors flex-1 min-w-0 leading-snug line-clamp-2 text-left">{g.title}</span>
              {badge(g)}
            </div>
            {(g.total_incomplete_tasks > 0 || g.total_mins_remaining > 0) && (
              <div className="flex items-center gap-2 mt-1 pl-[18px]">
                {g.total_incomplete_tasks > 0 && (
                  <span className="text-[10px] text-gray-600">{g.total_incomplete_tasks} tasks</span>
                )}
                {g.total_mins_remaining > 0 && (
                  <span className="text-[10px] text-gray-600">{fmtMins(g.total_mins_remaining)}</span>
                )}
              </div>
            )}
          </button>
        ))}
      </div>
      {/* Legend */}
      <div className="px-4 py-3 border-t border-white/6 shrink-0 flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-[10px] text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />OK</span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />Risk</span>
        <span className="flex items-center gap-1.5 text-[10px] text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />Late</span>
      </div>
    </div>
  );
}

// ── Schedule Preview Panel ────────────────────────────────────────────────────

const PRIORITY_COLOR = { high: 'bg-red-400/20 text-red-300 border-red-400/20', medium: 'bg-amber-400/20 text-amber-300 border-amber-400/20', low: 'bg-gray-600/20 text-gray-400 border-gray-600/20' } as Record<string, string>;

const FEASIBILITY_BADGE: Record<SchedulerResult['status'], { label: string; className: string }> = {
  feasible:  { label: 'Feasible',  className: 'bg-green-900/50 text-green-400 border-green-700/40' },
  tight:     { label: 'Tight',     className: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/40' },
  risky:     { label: 'Risky',     className: 'bg-amber-900/40 text-amber-300 border-amber-700/40' },
  impossible:{ label: 'Impossible',className: 'bg-red-900/40 text-red-400 border-red-700/40' },
};

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekBounds(offset: number): { start: string; end: string; label: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysFromMon = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysFromMon + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { start: toLocalDateStr(monday), end: toLocalDateStr(sunday), label: `${fmt(monday)} – ${fmt(sunday)}` };
}

function SchedulePreviewPanel() {
  const { data } = useSchedulePreview();
  const { data: goals } = useGoals();
  const goalTitleMap = Object.fromEntries((goals ?? []).map(g => [g.id, g.title]));
  const invalidate = useInvalidate();
  const todayRef = useRef<HTMLDivElement>(null);
  const today = toLocalDateStr(new Date());
  const [goalFilter, setGoalFilter] = useState<string>('');
  const [weekOffset, setWeekOffset] = useState(0);

  const { start: weekStart, end: weekEnd, label: weekLabel } = useMemo(() => getWeekBounds(weekOffset), [weekOffset]);

  const allDays: ScheduleDay[] = data?.days ?? [];
  const taskLookup = data?.task_lookup ?? {} as Record<string, ScheduleTaskInfo>;
  const dayAssignmentMap = useMemo(
    () => Object.fromEntries((data?.scheduler_result?.day_assignments ?? []).map((da: DayAssignment) => [da.date, da])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.scheduler_result?.day_assignments],
  );
  const days = useMemo(
    () => allDays.filter(d => d.date >= weekStart && d.date <= weekEnd),
    [allDays, weekStart, weekEnd],
  );

  useEffect(() => {
    if (weekOffset === 0 && todayRef.current) {
      todayRef.current.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }, [weekOffset]);

  const schedulerResult = data?.scheduler_result;
  const allGoalIds = [...new Set(allDays.flatMap(d => d.tasks.map(t => t.goal_id).filter(Boolean)))];

  const applyProposal = async (id: string) => {
    await apiFetch(`/api/ai/proposals/${id}/apply`, { method: 'POST' });
    invalidate.schedulePreview();
    invalidate.allTasks();
    invalidate.goals();
  };

  const { triggerToast } = useAppStore();
  const [planning, setPlanning] = useState(false);
  // On-demand scheduler run: proposals land on their target days below and the
  // 5s schedule-preview poll keeps the panel live as they're accepted/rejected.
  const planWeek = async () => {
    setPlanning(true);
    try {
      const r = await apiPost<{ proposals_created: number; scheduler_result: { unestimated_task_ids: string[] } }>(
        '/api/ai/schedule/propose', { horizon_days: 7 },
      );
      invalidate.schedulePreview();
      if (r.proposals_created > 0) {
        triggerToast(`Scheduler proposed ${r.proposals_created} start date${r.proposals_created > 1 ? 's' : ''} — confirm them on their days below.`, 'success');
      } else if (r.scheduler_result.unestimated_task_ids.length) {
        triggerToast(`Nothing to schedule: ${r.scheduler_result.unestimated_task_ids.length} tasks need estimates first (see Schedule tab).`, 'info');
      } else {
        triggerToast('Schedule already matches the plan — no changes proposed.', 'info');
      }
    } catch (e) {
      triggerToast((e as Error).message, 'error');
    } finally {
      setPlanning(false);
    }
  };

  const rejectProposal = async (id: string) => {
    await apiFetch(`/api/ai/proposals/${id}/reject`, { method: 'POST' });
    invalidate.schedulePreview();
  };

  const badge = schedulerResult ? FEASIBILITY_BADGE[schedulerResult.status] : null;

  return (
    <div className="flex flex-col h-full overflow-hidden border-l border-white/6">
      <div className="shrink-0 px-3 h-14 flex items-center gap-2 border-b border-white/6">
        <Calendar size={14} className="text-indigo-400 shrink-0" />
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekOffset(w => w - 1)} className="text-gray-600 hover:text-gray-300 transition-colors" title="Previous week">
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="text-[10px] font-mono text-gray-400 hover:text-white transition-colors px-1 whitespace-nowrap"
            title="Jump to current week"
          >
            {weekOffset === 0 ? <span className="text-indigo-400">This week</span> : weekLabel}
          </button>
          <button onClick={() => setWeekOffset(w => w + 1)} className="text-gray-600 hover:text-gray-300 transition-colors" title="Next week">
            <ChevronRight size={13} />
          </button>
        </div>
        {badge && (
          <span
            className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.className}`}
            title={schedulerResult?.impossible_reason ?? `${schedulerResult?.tasks_overflow.length ?? 0} overflow, gap ${schedulerResult?.gap_minutes ?? 0}min`}
          >
            {badge.label}
          </span>
        )}
        {(schedulerResult?.unestimated_task_ids.length ?? 0) > 0 && (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30"
            title={`${schedulerResult!.unestimated_task_ids.length} tasks have no time estimate and can't be scheduled — see the Schedule tab to fix`}
          >
            {schedulerResult!.unestimated_task_ids.length} unest.
          </span>
        )}
        <button
          onClick={planWeek}
          disabled={planning}
          className="text-indigo-400 hover:text-indigo-300 disabled:opacity-40 transition-colors"
          title="Run the deterministic scheduler now — proposed start dates appear on their days below; nothing applies until you confirm each one"
        >
          {planning ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
        </button>
        <select
          value={goalFilter}
          onChange={e => setGoalFilter(e.target.value)}
          className="ml-auto text-[10px] font-mono bg-white/5 border border-white/10 text-gray-400 rounded-lg px-2 py-1 outline-none"
        >
          <option value="">All goals</option>
          {allGoalIds.map(id => <option key={id!} value={id!}>{goalTitleMap[id!] ?? id!.slice(0, 12)}</option>)}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {days.map(day => {
          const isToday = day.date === today;
          const tasks = goalFilter ? day.tasks.filter(t => t.goal_id === goalFilter) : day.tasks;
          const dayAssignment = dayAssignmentMap[day.date] as DayAssignment | undefined;
          const assignedTaskIds = goalFilter
            ? (dayAssignment?.task_ids ?? []).filter(id => taskLookup[id]?.goal_id === goalFilter)
            : (dayAssignment?.task_ids ?? []);
          const hasContent = tasks.length || day.meetings.length || day.proposals.length || day.deadline_titles.length || assignedTaskIds.length;
          if (!hasContent) return null;

          return (
            <div
              key={day.date}
              ref={isToday ? todayRef : undefined}
              className={`px-3 py-2.5 border-b border-white/5 ${isToday ? 'bg-indigo-950/30' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[10px] font-mono font-bold ${isToday ? 'text-indigo-300' : 'text-gray-600'}`}>
                  {new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                {day.deadline_titles.map((t, i) => (
                  <span key={i} className="flex items-center gap-0.5 text-[9px] font-mono text-amber-400">
                    <Diamond size={8} /> {t.slice(0, 14)}
                  </span>
                ))}
                {day.override && (
                  <span className="text-[9px] font-mono text-gray-600 ml-auto">{day.override.available_minutes}min</span>
                )}
              </div>

              <div className="space-y-1">
                {day.meetings.map(m => (
                  <div key={m.id} className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="text-amber-400">⚑</span>
                    <span className="text-gray-400 truncate">{m.title}</span>
                    {m.duration_minutes && <span className="text-gray-600 shrink-0">{m.duration_minutes}m</span>}
                  </div>
                ))}

                {tasks.map(t => (
                  <div key={t.id} className={`flex items-center gap-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-md border ${PRIORITY_COLOR[t.priority] ?? PRIORITY_COLOR.low}`}>
                    <span className="truncate flex-1">{t.title.slice(0, 28)}</span>
                    {t.estimated_minutes && <span className="shrink-0 opacity-60">{t.estimated_minutes}m</span>}
                  </div>
                ))}

                {assignedTaskIds.length > 0 && (
                  <>
                    <div className="text-[8px] font-mono text-gray-600 uppercase tracking-widest mt-1 mb-0.5">Planned work</div>
                    {assignedTaskIds.map(id => {
                      const info = taskLookup[id];
                      if (!info) return null;
                      return (
                        <div key={`assigned-${id}`} className={`flex items-center gap-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-md border opacity-70 ${PRIORITY_COLOR[info.priority] ?? PRIORITY_COLOR.low}`}>
                          <span className="text-gray-500 shrink-0">→</span>
                          <span className="truncate flex-1">{info.title.slice(0, 26)}</span>
                          {info.estimated_minutes > 0 && <span className="shrink-0 opacity-60">{info.estimated_minutes}m</span>}
                        </div>
                      );
                    })}
                    {dayAssignment && (
                      <div className="text-[8px] font-mono text-gray-600 text-right mt-0.5">
                        {dayAssignment.used_minutes}m / {dayAssignment.available_minutes}m
                      </div>
                    )}
                  </>
                )}

                {day.proposals.map((p: ScheduleDay['proposals'][0]) => {
                  // Scheduler proposals carry task_id + start_date, not a title —
                  // resolve the real task name so the card isn't a bare "update_task".
                  const taskId = p.params.task_id as string | undefined;
                  const label = (p.params.title as string | undefined)
                    ?? (taskId ? taskLookup[taskId]?.title : undefined)
                    ?? p.action_type;
                  const move = p.params.start_date ? `start ${String(p.params.start_date).slice(5)}` : null;
                  return (
                    <div key={p.id} className="flex items-center gap-1.5 border border-dashed border-amber-400/40 rounded-md px-1.5 py-0.5">
                      <span className="text-[10px] font-mono text-amber-300 truncate flex-1" title={p.explanation ?? label}>
                        ✦ {label.slice(0, 22)}{move ? ` → ${move}` : ''}
                      </span>
                      <button onClick={() => applyProposal(p.id)} className="text-green-400 hover:text-green-300 shrink-0" title="Confirm — writes the change">✓</button>
                      <button onClick={() => rejectProposal(p.id)} className="text-gray-600 hover:text-red-400 shrink-0" title="Reject — persists, won't reappear">✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Starter prompts ───────────────────────────────────────────────────────────

const ANALYZE_PROMPT = `Analyze my entire schedule right now. For each goal, tell me:
1. Is it feasible to finish before the deadline?
2. What tasks are at risk?
3. What should I prioritize this week?
Then give me your top 3 schedule recommendations with specific actions I can apply.`;

const STARTERS = [
  { icon: '📊', label: 'Analyze schedule',  prompt: ANALYZE_PROMPT },
  { icon: '⚠️', label: "What's at risk?",   prompt: "Which goals or tasks are at risk of missing deadlines? Be specific." },
  { icon: '📅', label: 'Plan this week',    prompt: `What should I focus on this week? Suggest a realistic plan based on my deadlines and remaining work.` },
  { icon: '🔧', label: 'Fix my schedule',   prompt: 'Suggest specific date adjustments and task reorganizations to make everything feasible.' },
];

// ── CopilotView ───────────────────────────────────────────────────────────────

// ── Session History Sidebar ───────────────────────────────────────────────────

function SessionSidebar({ activeSessionId, onSelect, onNew }: { activeSessionId: string | null; onSelect: (id: string) => void; onNew: () => void }) {
  const { data: sessions = [] } = useChatSessions();
  const deleteSession = useDeleteChatSession();

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-white/6">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">History</span>
        <button onClick={onNew} className="w-6 h-6 rounded-lg bg-white/6 hover:bg-white/10 flex items-center justify-center transition-colors" title="New conversation">
          <Plus size={11} className="text-gray-400" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 && (
          <p className="text-[11px] text-gray-600 text-center mt-6 px-4">No saved conversations yet</p>
        )}
        {sessions.map(s => (
          <div key={s.id} className={`group flex items-center gap-2 mx-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${s.id === activeSessionId ? 'bg-indigo-500/15 border border-indigo-500/25' : 'hover:bg-white/5'}`}
            onClick={() => onSelect(s.id)}>
            <MessageSquare size={10} className={s.id === activeSessionId ? 'text-indigo-400' : 'text-gray-600'} />
            <span className="flex-1 text-[11px] text-gray-400 truncate leading-snug">
              {s.title ?? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button
              onClick={e => { e.stopPropagation(); deleteSession.mutate(s.id); }}
              className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-opacity"
            >
              <X size={9} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CopilotView() {
  const [messages,        setMessages]        = useState<ChatMessage[]>([]);
  const [input,           setInput]           = useState('');
  const [isLoading,       setIsLoading]       = useState(false);
  const [apiKeyMissing,   setApiKeyMissing]   = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistory,     setShowHistory]     = useState(false);
  const [railOpen,        setRailOpen]        = useState(false);
  const [attachment, setAttachment] = useState<{ id: string; title: string; indexing: boolean } | null>(null);
  const [uploading,  setUploading]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const qc        = useQueryClient();
  const { triggerToast } = useAppStore();

  // Attach = real library upload (chunked + embedded like any resource); the
  // resource_id is then stated in the next message so the model can propose
  // attach_resource actions against it.
  const uploadAttachment = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { id } = await apiFetch<{ id: string }>('/api/resources/upload', { method: 'POST', body: fd });
      setAttachment({ id, title: file.name, indexing: true });
      qc.invalidateQueries({ queryKey: ['resources'] });
      triggerToast(`"${file.name}" added to your Resource Library. Tell the copilot where to file it.`, 'success');
      setTimeout(() => setAttachment(a => a && a.id === id ? { ...a, indexing: false } : a), 20_000);
    } catch (e) {
      triggerToast(`Upload failed: ${(e as Error).message}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  const createSession = useCreateChatSession();
  const sendSessionMsg = useSendSessionMessage();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      interface StoredAction extends Omit<CopilotAction, 'status'> { proposal_status?: string }
      const msgs = await apiFetch<{
        id: string; role: 'user' | 'assistant'; content: string; created_at: string;
        metadata?: { actions?: StoredAction[]; feasibility?: FeasibilityResult | null; citations?: ChatCitation[]; plan?: ChatPlan } | null;
      }[]>(`/api/ai/sessions/${sessionId}/messages`);
      setActiveSessionId(sessionId);
      // Restore action cards from persisted metadata; card status reflects the
      // CURRENT durable proposal state, so applied/skipped survive reloads.
      // Plan widgets restore with their saved status and drag adjustments.
      setMessages(msgs.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        actions: m.metadata?.actions?.map(a => ({
          ...a,
          status: a.rejected_reason ? 'error' as const : statusFromProposal(a.proposal_status),
        })),
        feasibility: m.metadata?.feasibility ?? undefined,
        citations: m.metadata?.citations ?? undefined,
        plan: m.metadata?.plan ?? undefined,
        serverMsgId: m.id,
        timestamp: new Date(m.created_at),
      })));
      setShowHistory(false);
    } catch { /* ignore */ }
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setShowHistory(false);
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    setInput('');
    // A pending attachment rides along as an explicit reference the model can
    // act on (attach_resource) — stated in-message, never smuggled invisibly.
    const outgoing = attachment
      ? `${text.trim()}\n\n[Attached file "${attachment.title}" is already in my Resource Library with resource_id: ${attachment.id}]`
      : text.trim();
    if (attachment) setAttachment(null);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: outgoing, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    const assistantId = crypto.randomUUID();

    try {
      let sessionId = activeSessionId;

      if (!sessionId) {
        // Create a new session titled from the first user message
        const session = await createSession.mutateAsync(text.trim().slice(0, 60));
        sessionId = session.id;
        setActiveSessionId(sessionId);
      }

      const data = await apiPost<{ reply?: string; actions?: Omit<CopilotAction, 'status'>[]; feasibility?: FeasibilityResult; citations?: ChatCitation[]; plan?: ChatPlan | null; message_id?: string; error?: string }>(
        `/api/ai/sessions/${sessionId}/chat`, { message: outgoing },
      );
      const actions: CopilotAction[] = (data.actions ?? []).map(a => ({ ...a, status: 'pending' as const }));
      setMessages(prev => [...prev, {
        id: assistantId,
        role: 'assistant',
        content: data.reply ?? '',
        actions,
        feasibility: data.feasibility,
        citations: data.citations,
        plan: data.plan ?? undefined,
        serverMsgId: data.message_id,
        timestamp: new Date(),
      }]);
      qc.invalidateQueries({ queryKey: ['proposals'] });
    } catch (err) {
      const isOffline = err instanceof Error && err.message.includes('Failed to fetch');
      const errMsg = isOffline
        ? 'Network error — is the Marina server running?'
        : (err instanceof Error ? err.message : 'Request failed');
      const isApiKeyErr = errMsg.toLowerCase().includes('api key') || errMsg.toLowerCase().includes('gemini');
      if (isApiKeyErr) setApiKeyMissing(true);
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', error: errMsg, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, isLoading, activeSessionId, createSession, sendSessionMsg, qc, attachment]);

  const handleConfirmAction = useCallback(async (msgId: string, actionId: string) => {
    const action = messages.find(m => m.id === msgId)?.actions?.find(a => a.id === actionId);
    if (!action?.proposal_id) {
      // No durable proposal behind this card (validation-rejected or legacy) — surface honestly.
      setMessages(prev => prev.map(m => m.id !== msgId ? m : { ...m, actions: m.actions?.map(a => a.id === actionId ? { ...a, status: 'error' as const } : a) }));
      return;
    }
    setMessages(prev => prev.map(m => m.id !== msgId ? m : { ...m, actions: m.actions?.map(a => a.id === actionId ? { ...a, status: 'applying' as const } : a) }));
    try {
      // Durable path: transactional, row-locked, double-apply safe.
      await apiPost(`/api/ai/proposals/${action.proposal_id}/apply`, {});
      setMessages(prev => prev.map(m => m.id !== msgId ? m : { ...m, actions: m.actions?.map(a => a.id === actionId ? { ...a, status: 'done' as const } : a) }));
      for (const key of PROPOSAL_AFFECTED_KEYS) qc.invalidateQueries({ queryKey: [key] });
    } catch {
      setMessages(prev => prev.map(m => m.id !== msgId ? m : { ...m, actions: m.actions?.map(a => a.id === actionId ? { ...a, status: 'error' as const } : a) }));
    }
  }, [messages, qc]);

  const handleSkipAction = useCallback(async (msgId: string, actionId: string) => {
    const action = messages.find(m => m.id === msgId)?.actions?.find(a => a.id === actionId);
    // Skip must persist: reject the durable proposal so it disappears from the
    // proposals panel and stays skipped after a reload.
    if (action?.proposal_id) {
      try {
        await apiPost(`/api/ai/proposals/${action.proposal_id}/reject`, {});
        qc.invalidateQueries({ queryKey: ['proposals'] });
        qc.invalidateQueries({ queryKey: ['ai-proposals'] });
        qc.invalidateQueries({ queryKey: ['schedule-preview'] });
      } catch { /* already decided elsewhere — still mark locally */ }
    }
    setMessages(prev => prev.map(m => m.id !== msgId ? m : { ...m, actions: m.actions?.map(a => a.id === actionId ? { ...a, status: 'skipped' as const } : a) }));
  }, [messages, qc]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full overflow-hidden bg-[#0e0e1c]">

      {/* ── Left rail: hidden by default — chat is the page, not a page-in-a-page ── */}
      {railOpen && (
        <aside className="w-56 md:w-64 shrink-0 border-r border-white/6 bg-[#0b0b18] flex flex-col overflow-hidden">
          {showHistory ? (
            <SessionSidebar
              activeSessionId={activeSessionId}
              onSelect={loadSession}
              onNew={startNewConversation}
            />
          ) : (
            <GoalHealthPanel
              onGoalClick={title =>
                send(`Tell me about the schedule for "${title}" — is it feasible and what should I prioritize?`)
              }
            />
          )}
        </aside>
      )}

      {/* ── Center: Chat (fills remaining width) ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 flex items-center gap-3 px-5 h-14 border-b border-white/6">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
            <Zap size={13} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">Copilot</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{activeSessionId ? 'Session active' : 'New conversation'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { if (railOpen && !showHistory) setRailOpen(false); else { setRailOpen(true); setShowHistory(false); } }}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${railOpen && !showHistory ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/6 text-gray-500 hover:text-gray-300'}`}
              title="Goal health panel"
            >
              <PanelLeft size={12} />
            </button>
            <button
              onClick={() => { if (railOpen && showHistory) { setRailOpen(false); setShowHistory(false); } else { setRailOpen(true); setShowHistory(true); } }}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${railOpen && showHistory ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/6 text-gray-500 hover:text-gray-300'}`}
              title="Conversation history"
            >
              <MessageSquare size={12} />
            </button>
            <button
              onClick={() => send(ANALYZE_PROMPT)}
              disabled={isLoading}
              className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-300 border border-indigo-500/25 bg-indigo-500/8 hover:bg-indigo-500/15 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
              Analyze All
            </button>
            {messages.length > 0 && (
              <button onClick={startNewConversation} className="text-[11px] text-gray-600 hover:text-gray-400 transition-colors">
                New
              </button>
            )}
          </div>
        </div>

        {/* API key banner */}
        {apiKeyMissing && (
          <div className="shrink-0 m-4 p-3 border border-amber-500/25 bg-amber-500/5 rounded-xl">
            <p className="text-[12px] text-amber-300 font-medium">GEMINI_API_KEY not configured</p>
            <p className="text-[11px] text-amber-400/70 mt-0.5">
              Get a free key at <span className="underline">aistudio.google.com</span> → add <code className="bg-white/8 px-1 rounded font-mono">GEMINI_API_KEY=AIza…</code> to your <code className="bg-white/8 px-1 rounded font-mono">.env</code> → restart server
            </p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center px-6 text-center select-none">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/20">
                <Zap size={20} className="text-white" />
              </div>
              <p className="text-[15px] font-semibold text-white mb-1.5">Marina Copilot</p>
              <p className="text-[12px] text-gray-500 max-w-sm mb-8 leading-relaxed">
                I read your goals, tasks, and deadlines and can analyze feasibility, add tasks intelligently, and reschedule when things are at risk.
              </p>
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                {STARTERS.map(s => (
                  <button
                    key={s.label}
                    onClick={() => send(s.prompt)}
                    className="text-left p-3.5 rounded-xl border border-white/8 bg-white/4 hover:bg-white/8 hover:border-indigo-500/30 transition-all group"
                  >
                    <span className="text-lg leading-none">{s.icon}</span>
                    <p className="text-[12px] font-medium text-gray-300 group-hover:text-white mt-2 transition-colors">{s.label}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-5 py-5 space-y-5">
              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  sessionId={activeSessionId}
                  onConfirmAction={handleConfirmAction}
                  onSkipAction={handleSkipAction}
                />
              ))}
              {isLoading && (
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                    <Zap size={13} className="text-white" />
                  </div>
                  <div className="bg-white/6 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 150, 300].map(d => (
                        <span key={d} className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-white/6 px-4 py-3">
          {attachment && (
            <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
              <Paperclip size={11} className="text-emerald-400 shrink-0" />
              <span className="text-[11px] text-emerald-300 truncate flex-1">
                {attachment.title} — uploaded to your library{attachment.indexing ? ', indexing…' : ' and indexed'}
              </span>
              <span className="text-[10px] font-mono text-gray-500">will be referenced in your next message</span>
              <button onClick={() => setAttachment(null)} className="text-gray-500 hover:text-red-400"><X size={11} /></button>
            </div>
          )}
          <div className="flex items-end gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2 focus-within:border-indigo-500/40 transition-colors">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = ''; }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || isLoading}
              className="w-8 h-8 shrink-0 rounded-xl text-gray-500 hover:text-indigo-300 hover:bg-white/5 disabled:opacity-30 flex items-center justify-center transition-colors"
              title="Attach a file — it's added to your Resource Library, chunked for search, and the copilot can file it under a goal/task/milestone if you ask"
            >
              {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Paperclip size={14} />}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about your schedule, or say what you need to get done…"
              rows={1}
              className="flex-1 bg-transparent text-[13px] text-white placeholder-gray-600 outline-none resize-none leading-relaxed max-h-28 overflow-y-auto"
              style={{ minHeight: 24 }}
              onInput={e => {
                const t = e.currentTarget;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 112) + 'px';
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || isLoading}
              className="w-8 h-8 shrink-0 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <Send size={13} className="text-white" />
            </button>
          </div>
          <p className="text-[10px] text-gray-700 mt-1.5 px-1">Enter to send · Shift+Enter for new line</p>
        </div>
      </div>

      {/* ── Right: Schedule Preview ── */}
      <div className="hidden lg:flex flex-col w-64 xl:w-80 shrink-0 overflow-hidden bg-[#0b0b18]">
        <SchedulePreviewPanel />
      </div>
    </div>
  );
}
