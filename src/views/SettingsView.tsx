import { useState, useEffect } from 'react';
import { Plus, Trash2, Calendar, AlertTriangle, CheckCircle, Info, Database, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useSchedulePrefs, useScheduleOverrides, useUpsertScheduleOverride, useDeleteScheduleOverride, useEntityAliases, useDeleteEntityAlias, useDataReadiness } from '../api/hooks';

interface ProviderSummary {
  mode: 'local' | 'hybrid' | 'cloud';
  chat: { provider: string; model: string; fallback: string };
  embeddings: { provider: string; model: string; dimension: number; sends_raw_text_to_cloud: boolean };
}

interface HealthData {
  status: 'ok' | 'degraded';
  db: 'connected' | 'error';
  ollama: 'ok' | 'unavailable';
  embed_model: string;
  embed_dimension: number;
  queue: Record<string, number>;
  schema_version: string | null;
  migration_count: number;
  provider?: ProviderSummary;
  timestamp: string;
}

function useHealth() {
  const [health, setHealth] = useState<HealthData | null>(null);
  useEffect(() => {
    fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {});
  }, []);
  return health;
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  goal: 'Goal', task: 'Task', meeting: 'Meeting', resource: 'Resource', milestone: 'Milestone', note: 'Note',
};

function EntityAliasesSection() {
  const { data: aliases = [] } = useEntityAliases({ created_by: 'ai' });
  const deleteAlias = useDeleteEntityAlias();
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? aliases.filter(a =>
        a.alias.toLowerCase().includes(filter.toLowerCase()) ||
        (a.entity_title ?? '').toLowerCase().includes(filter.toLowerCase()) ||
        a.entity_type.toLowerCase().includes(filter.toLowerCase()),
      )
    : aliases;

  return (
    <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black">AI-Learned Aliases</h3>
        <span className="text-[10px] text-gray-400 font-mono">{aliases.length} total</span>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        These are names Marina learned for your goals, tasks, meetings, and resources. Delete any that are wrong.
      </p>
      {aliases.length > 6 && (
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter aliases..."
          className="w-full text-xs rounded-lg border border-gray-200 p-2 mb-3 focus:ring-1 focus:ring-black outline-none"
        />
      )}
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-300 italic">No AI-learned aliases yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {filtered.map(a => (
            <div key={a.id} className="flex items-center gap-2 group">
              <span className="inline-block text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0 w-20 text-center">
                {ENTITY_TYPE_LABELS[a.entity_type] ?? a.entity_type}
              </span>
              <span className="text-xs text-gray-600 truncate flex-1">
                <span className="font-semibold text-black">{a.alias}</span>
                {a.entity_title && <span className="text-gray-400"> → {a.entity_title}</span>}
              </span>
              <button
                onClick={() => deleteAlias.mutate(a.id)}
                disabled={deleteAlias.isPending}
                className="text-gray-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                title="Delete alias"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function decimalToTime(decimal: number): string {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToDecimal(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h + (m ?? 0) / 60;
}

function SchedulePrefsSection({ onSave }: { onSave: (msg: string) => void }) {
  const { data: prefs } = useSchedulePrefs();

  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [capacity, setCapacity] = useState(480);
  const [deepStart, setDeepStart] = useState('09:00');
  const [deepEnd, setDeepEnd] = useState('12:00');
  const [buffer, setBuffer] = useState(15);
  const [timezone, setTimezone] = useState('Asia/Beirut');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!prefs) return;
    try {
      setWorkDays(JSON.parse(prefs.work_days as unknown as string));
    } catch { /* */ }
    setWorkStart(decimalToTime(Number(prefs.work_start)));
    setWorkEnd(decimalToTime(Number(prefs.work_end)));
    setCapacity(Number(prefs.daily_capacity_minutes ?? 480));
    setDeepStart(decimalToTime(Number(prefs.deep_work_start ?? 9)));
    setDeepEnd(decimalToTime(Number(prefs.deep_work_end ?? 12)));
    setBuffer(Math.round(Number((prefs as unknown as Record<string, unknown>).buffer_ratio ?? 0.15) * 100));
    setTimezone(String((prefs as unknown as Record<string, unknown>).timezone ?? 'Asia/Beirut'));
  }, [prefs]);

  const effective = Math.round(capacity * (1 - buffer / 100));

  const toggleDay = (d: number) => setWorkDays(ds => ds.includes(d) ? ds.filter(x => x !== d) : [...ds, d].sort((a, b) => a - b));

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/schedule-prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_days: JSON.stringify(workDays),
          work_start: timeToDecimal(workStart),
          work_end: timeToDecimal(workEnd),
          daily_capacity_minutes: capacity,
          deep_work_start: timeToDecimal(deepStart),
          deep_work_end: timeToDecimal(deepEnd),
          buffer_ratio: buffer / 100,
          timezone: timezone.trim() || 'Asia/Beirut',
        }),
      });
      onSave('Work schedule saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
      <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black mb-4">Work Schedule</h3>

      <div className="space-y-4 text-sm">
        {/* Work days */}
        <div>
          <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-2">Work Days</label>
          <div className="flex gap-1.5">
            {DAYS.map((label, i) => {
              const val = i + 1;
              return (
                <button
                  key={val}
                  onClick={() => toggleDay(val)}
                  className={`px-2.5 py-1 text-[10px] font-mono uppercase rounded-lg border transition-colors ${
                    workDays.includes(val)
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Work hours */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-1">Start Time</label>
            <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)}
              className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-1">End Time</label>
            <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)}
              className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400" />
          </div>
        </div>

        {/* Deep work window */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-1">Deep Work Start</label>
            <input type="time" value={deepStart} onChange={e => setDeepStart(e.target.value)}
              className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-1">Deep Work End</label>
            <input type="time" value={deepEnd} onChange={e => setDeepEnd(e.target.value)}
              className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400" />
          </div>
        </div>

        {/* Daily capacity */}
        <div>
          <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-1">
            Daily Capacity — {capacity} min ({(capacity / 60).toFixed(1)} hrs)
          </label>
          <input type="number" min={60} max={720} step={30} value={capacity}
            onChange={e => setCapacity(Number(e.target.value))}
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400" />
        </div>

        {/* Buffer ratio */}
        <div>
          <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-1">
            Buffer — {buffer}% · Effective capacity: <strong>{effective} min</strong> ({(effective / 60).toFixed(1)} hrs)
          </label>
          <input type="range" min={0} max={50} step={5} value={buffer}
            onChange={e => setBuffer(Number(e.target.value))}
            className="w-full accent-indigo-600" />
        </div>

        {/* Timezone */}
        <div>
          <label className="text-xs text-gray-500 font-mono uppercase tracking-wider block mb-1">Timezone (IANA)</label>
          <input
            type="text"
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            placeholder="e.g. Asia/Beirut, America/New_York"
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400"
          />
          <p className="text-[10px] text-gray-400 mt-1">Used by the scheduler and journal ingestion to determine today's date in your local time.</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : 'Save Schedule'}
        </button>
      </div>
    </div>
  );
}

function ScheduleOverridesSection({ onSave }: { onSave: (msg: string, type?: 'success' | 'error') => void }) {
  const { data: overrides } = useScheduleOverrides();
  const upsert = useUpsertScheduleOverride();
  const remove = useDeleteScheduleOverride();

  // Use local date (not UTC) so midnight in Beirut gives the correct calendar day
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [date, setDate] = useState(todayStr);
  const [minutes, setMinutes] = useState<string>('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!date) { onSave('Date is required.', 'error'); return; }
    const m = minutes !== '' ? Number(minutes) : null;
    if (m !== null && (isNaN(m) || m < 0 || m > 1440)) {
      onSave('Available minutes must be 0–1440.', 'error'); return;
    }
    setAdding(true);
    try {
      await upsert.mutateAsync({ date, available_minutes: m, note: note.trim() || undefined });
      onSave(`Override saved for ${date}.`);
      setDate(todayStr);
      setMinutes('');
      setNote('');
    } catch {
      onSave('Failed to save override.', 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (d: string) => {
    await remove.mutateAsync(d);
    onSave(`Removed override for ${d}.`);
  };

  return (
    <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
      <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black mb-3 flex items-center gap-2">
        <Calendar size={12} className="text-indigo-500" />
        Schedule Day Overrides
      </h3>
      <p className="text-[11px] text-gray-400 mb-4">
        Override availability for specific dates — e.g. vacations, sick days, or extra-capacity days.
      </p>

      {/* Add form */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 mb-4 items-end">
        <div>
          <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block mb-1">Avail. Min</label>
          <input type="number" min={0} max={1440} step={30} placeholder="480"
            value={minutes} onChange={e => setMinutes(e.target.value)}
            className="w-20 text-xs font-mono border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block mb-1">Note</label>
          <input type="text" placeholder="e.g. vacation" value={note} onChange={e => setNote(e.target.value)}
            className="w-full text-xs font-mono border border-gray-200 rounded-lg px-2.5 py-2 outline-none focus:border-indigo-400" />
        </div>
        <button
          onClick={handleAdd}
          disabled={adding}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors self-end"
        >
          {adding ? '…' : 'Add'}
        </button>
      </div>

      {/* Existing overrides list */}
      {(overrides ?? []).length === 0 ? (
        <p className="text-[11px] font-mono text-gray-400">No overrides in the next 60 days.</p>
      ) : (
        <div className="space-y-1.5">
          {(overrides ?? []).map(o => (
            <div key={o.date} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-lg text-xs">
              <span className="font-mono text-gray-700 font-semibold">{o.date}</span>
              <span className="text-gray-500">
                {o.available_minutes != null ? `${o.available_minutes} min` : 'no override'}
                {o.note ? ` · ${o.note}` : ''}
              </span>
              <button
                onClick={() => handleDelete(o.date)}
                className="ml-auto text-gray-300 hover:text-red-500 transition-colors"
                title="Remove override"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataReadinessSection() {
  const { data, isLoading, refetch } = useDataReadiness();

  const severityIcon = (severity: string) => {
    if (severity === 'warning') return <AlertTriangle size={11} className="text-amber-400 shrink-0" />;
    return <Info size={11} className="text-gray-400 shrink-0" />;
  };

  return (
    <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black">Data Readiness</h3>
        <div className="flex items-center gap-2">
          {data && (
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${data.ok ? 'border-green-200 bg-green-50 text-green-600' : 'border-amber-200 bg-amber-50 text-amber-600'}`}>
              {data.ok ? '✓ All clear' : `${data.total_gaps} gaps`}
            </span>
          )}
          <button onClick={() => refetch()} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">Refresh</button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-3">Planning gaps that may reduce AI accuracy — these are informational, not errors.</p>
      {isLoading && <p className="text-xs text-gray-400">Checking…</p>}
      {data && (
        <div className="space-y-1.5">
          {data.items.map(item => (
            <div key={item.bucket} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${item.count > 0 ? (item.severity === 'warning' ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50 border border-gray-100') : 'bg-gray-50 border border-gray-100 opacity-40'}`}>
              {item.count > 0 ? severityIcon(item.severity) : <CheckCircle size={11} className="text-green-400 shrink-0" />}
              <span className="flex-1 text-gray-600">{item.description}</span>
              <span className={`font-mono font-bold shrink-0 ${item.count > 0 ? (item.severity === 'warning' ? 'text-amber-600' : 'text-gray-500') : 'text-green-500'}`}>{item.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const INVENTORY_LABELS: Record<string, string> = {
  goals: 'Goals', tasks: 'Tasks', goal_milestones: 'Milestones', goal_deadlines: 'Deadlines',
  meetings: 'Meetings', events: 'Events', work_sessions: 'Work Sessions', resources: 'Resources',
  journal_entries: 'Journal Entries', embeddings: 'Embeddings', embedding_jobs: 'Embed. Jobs',
  entity_summaries: 'Summaries', ai_action_proposals: 'Proposals', edges: 'Graph Edges',
  chat_sessions: 'Chat Sessions', chat_messages: 'Chat Messages',
};

function useInventory() {
  const [data, setData] = useState<{ tables: Record<string, number>; timestamp: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = () => {
    setLoading(true);
    fetch('/api/inventory').then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);
  return { data, loading, refresh };
}

function DBInventorySection() {
  const { data, loading, refresh } = useInventory();

  const displayKeys = Object.keys(INVENTORY_LABELS);
  const rows = displayKeys.map(k => ({ key: k, label: INVENTORY_LABELS[k], count: data?.tables[k] ?? null }));

  return (
    <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black flex items-center gap-2">
          <Database size={12} className="text-indigo-500" />
          Database Inventory
        </h3>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">Read-only row counts — your data, live from PostgreSQL.</p>
      {!data && !loading && <p className="text-xs text-gray-400">No data yet.</p>}
      {loading && <p className="text-xs text-gray-400">Loading…</p>}
      {data && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          {rows.map(r => (
            <div key={r.key} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
              <span className="text-[11px] text-gray-600">{r.label}</span>
              <span className={`font-mono text-[11px] font-bold ${r.count === null || r.count < 0 ? 'text-gray-300' : r.count > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                {r.count === null ? '…' : r.count < 0 ? 'N/A' : r.count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
      {data && (
        <p className="text-[9px] font-mono text-gray-300 mt-3 text-right">
          as of {new Date(data.timestamp).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

export function SettingsView() {
  const {
    triggerToast,
    showConfirm,
    goalCategories,
    addGoalCategory,
    removeGoalCategory,
  } = useAppStore();
  const [categoryInput, setCategoryInput] = useState('');
  const health = useHealth();

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = categoryInput.trim();
    if (!trimmed) {
      triggerToast('Name the umbrella first.', 'error');
      return;
    }
    if (goalCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      triggerToast('That umbrella already exists.', 'info');
      return;
    }
    addGoalCategory(trimmed);
    setCategoryInput('');
    triggerToast(`Umbrella "${trimmed}" added.`, 'success');
  };

  const handleRemoveCategory = (category: string) => {
    if (goalCategories.length <= 1) {
      triggerToast('Keep at least one goal umbrella.', 'error');
      return;
    }
    removeGoalCategory(category);
    triggerToast(`Umbrella "${category}" removed from new goal options.`, 'info');
  };

  return (
    <div className="max-w-[700px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
      <div className="mb-8 border-b border-gray-100 pb-4">
        <h2 className="font-headline text-2xl font-black text-black mb-1">Marina OS Preferences</h2>
        <p className="text-sm text-gray-500">
          Configure personal co-pilot workspace triggers, prompt models, and storage.
        </p>
      </div>

      <div className="space-y-6">
        {/* Work Schedule */}
        <SchedulePrefsSection onSave={msg => triggerToast(msg, 'success')} />

        {/* Schedule Day Overrides */}
        <ScheduleOverridesSection onSave={(msg, type) => triggerToast(msg, type ?? 'success')} />

        {/* Copilot Metadata */}
        <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black mb-3">
            Copilot Metadata
          </h3>
          <div className="flex items-start gap-4">
            <div className="relative w-14 h-14 rounded-full border overflow-hidden shrink-0">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC77RLeDDakGJQ4MP9wYcxIvZx0LhA3x49A5xlJOg4S4uEo34dcUMSBQVhKcZBFlyy4DyGXswu_nmLlGrM96KKrsDwJqdiwgn3Fq-1eo360fT94FzZEXJWyGw3kA5xy1tcXh-Gg4OaNLhI4M59l6zGRFM5KFSYJoyowOybjI-zdIKlvmZsMT3OpWwBsr7ftzsvCJZ2rsyvmpgtTinuxohWed8GXUyi1k1-OEHrRZdXUVXtQTu_RRoElUV-UE_b0WSUfslNnagddlw"
                alt="Marina AI"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800">Marina DeepMind AI Engine</p>
              <p className="text-xs text-gray-400 mt-1">
                DB: <span className={health?.db === 'connected' ? 'text-green-400' : 'text-red-400'}>{health?.db ?? '…'}</span>
                {' · '}Chat: <span className={health?.ollama === 'ok' ? 'text-green-400' : 'text-yellow-400'}>{health?.ollama ?? '…'}</span>
                {health?.embed_model ? ` · Embed: ${health.embed_model} (${health.embed_dimension}d)` : ''}
              </p>
              {health?.provider && (
                <p className="text-[10px] font-mono mt-1">
                  <span className={`font-bold ${
                    health.provider.mode === 'local' ? 'text-green-500' :
                    health.provider.mode === 'hybrid' ? 'text-yellow-500' : 'text-orange-500'
                  }`}>
                    {health.provider.mode.toUpperCase()} MODE
                  </span>
                  {' · '}
                  <span className="text-gray-500">
                    Chat: {health.provider.chat.model}
                    {' · '}
                    Embed: {health.provider.embeddings.provider}
                    {health.provider.embeddings.sends_raw_text_to_cloud
                      ? ' (raw text sent to cloud)'
                      : health.provider.mode !== 'local' ? ' (summaries only)' : ''}
                  </span>
                </p>
              )}
              {health?.schema_version && (
                <p className="text-[10px] font-mono text-gray-500 mt-1">
                  Schema: {health.schema_version} ({health.migration_count} migrations applied)
                </p>
              )}
              {health?.queue && Object.keys(health.queue).length > 0 && (
                <p className="text-[10px] font-mono text-gray-500 mt-1">
                  Queue: {Object.entries(health.queue).map(([k, v]) => `${k}=${v}`).join(' ')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Goal Umbrellas */}
        <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black mb-3">Goal Umbrellas</h3>

          <form onSubmit={handleAddCategory} className="flex gap-2 mb-4">
            <input
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              placeholder="New umbrella"
              className="flex-1 text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none"
            />
            <button
              type="submit"
              className="bg-black text-white rounded-lg px-3 flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
              title="Add umbrella"
            >
              <Plus size={15} />
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {goalCategories.map((category) => (
              <span
                key={category}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-[#f8f9fa] px-2.5 py-1.5 text-xs font-semibold text-gray-700"
              >
                {category}
                <button
                  type="button"
                  onClick={() => handleRemoveCategory(category)}
                  className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30 disabled:hover:text-gray-300"
                  disabled={goalCategories.length <= 1}
                  title="Remove umbrella"
                >
                  <Trash2 size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Entity Aliases */}
        <EntityAliasesSection />

        {/* Data Readiness */}
        <DataReadinessSection />

        {/* DB Inventory */}
        <DBInventorySection />

        {/* Tech Stack */}
        <div className="bg-[#EEF2FF] border border-[#4648d4]/10 p-5 rounded-xl">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#4648d4] mb-3">Tech Stack</h3>
          <div className="space-y-2 text-xs text-gray-600">
            {[
              ['UI',        'React 19 + Vite 6 + TypeScript'],
              ['Styling',   'Tailwind CSS v4'],
              ['State',     'Zustand 5 (UI state only)'],
              ['Database',  'PostgreSQL + pgvector — graph-ready schema'],
              ['Editor',    'TipTap (StarterKit + Placeholder)'],
              ['Animations','Framer Motion (motion/react)'],
              ['Icons',     'Lucide React'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-[#4648d4] font-bold w-24 shrink-0">{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
