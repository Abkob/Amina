import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Box,
  ChevronDown,
  ChevronUp,
  Database,
  KeyRound,
  Link2,
  RotateCcw,
  Search,
  Sparkles,
  Table2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { apiFetch } from '../utils/apiFetch';

interface AtlasColumn {
  name: string;
  position: number;
  data_type: string;
  nullable: boolean;
  default_value: string | null;
  is_primary: boolean;
  is_unique: boolean;
}

interface AtlasIndex {
  name: string;
  definition: string;
}

interface AtlasTable {
  name: string;
  row_count: number;
  total_bytes: number;
  index_count: number;
  columns: AtlasColumn[];
  indexes: AtlasIndex[];
}

interface AtlasRelationship {
  id: string;
  kind: 'physical' | 'logical';
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  label: string;
  note: string;
  is_validated?: boolean;
}

interface DatabaseAtlasResponse {
  generated_at: string;
  database: { name: string; total_bytes: number; server_version: string };
  summary: {
    tables: number;
    columns: number;
    rows: number;
    indexes: number;
    physical_relationships: number;
    logical_relationships: number;
  };
  tables: AtlasTable[];
  relationships: AtlasRelationship[];
}

type DomainKey = 'capture' | 'truth' | 'time' | 'organize' | 'intelligence';

interface TableNarrative {
  domain: DomainKey;
  purpose: string;
  detail: string;
}

const DOMAIN_META: Record<DomainKey, { label: string; caption: string; color: string; x: number }> = {
  capture: {
    label: '01 · Capture & evidence',
    caption: 'Human input, documents, notes and source material enter here.',
    color: '#22d3ee',
    x: 74,
  },
  truth: {
    label: '02 · Structured truth',
    caption: 'Goals and tasks form the operational spine of Marina.',
    color: '#818cf8',
    x: 414,
  },
  time: {
    label: '03 · Time & execution',
    caption: 'Planning becomes calendar capacity and recorded work.',
    color: '#f59e0b',
    x: 754,
  },
  organize: {
    label: '04 · Graph & organization',
    caption: 'Flexible links, labels and semantic clusters cross boundaries.',
    color: '#34d399',
    x: 1094,
  },
  intelligence: {
    label: '05 · Intelligence & memory',
    caption: 'AI proposals, summaries, vectors and chat sit above the truth.',
    color: '#f472b6',
    x: 1434,
  },
};

const TABLE_NARRATIVE: Record<string, TableNarrative> = {
  notes: { domain: 'capture', purpose: 'Fast capture inbox', detail: 'Stores brain-dump notes before they become structured journal evidence or tasks.' },
  journal_entries: { domain: 'capture', purpose: 'Durable personal journal', detail: 'Holds raw entries plus ingestion state, summaries, mood, energy and AI tags.' },
  journal_links: { domain: 'capture', purpose: 'Journal evidence bridge', detail: 'Connects a journal entry to any entity it mentions or supports.' },
  resources: { domain: 'capture', purpose: 'Reference library', detail: 'Documents, links and external material used by goals and tasks.' },
  resource_chunks: { domain: 'capture', purpose: 'Searchable document fragments', detail: 'Splits resource content into page-aware chunks for retrieval and embedding.' },
  resource_logs: { domain: 'capture', purpose: 'Resource activity trail', detail: 'Records progress notes and pinned insights about a resource.' },
  task_notes: { domain: 'capture', purpose: 'Task commentary', detail: 'Small durable notes attached directly to a task.' },
  task_note_files: { domain: 'capture', purpose: 'Task-note attachments', detail: 'File metadata for images and documents attached to task notes.' },

  goals: { domain: 'truth', purpose: 'Top-level outcomes', detail: 'The main planning container: state, progress, dates, activity and scheduling policy.' },
  goal_milestones: { domain: 'truth', purpose: 'Internal checkpoints', detail: 'Pacing points between a goal and its task tree.' },
  goal_deadlines: { domain: 'truth', purpose: 'Named external dates', detail: 'Multiple deadline buckets that tasks can be assigned to.' },
  tasks: { domain: 'truth', purpose: 'Atomic executable work', detail: 'Tasks and subtasks, including status, estimates, dates, hierarchy and completion.' },
  daily_scores: { domain: 'truth', purpose: 'Daily wellbeing signal', detail: 'Mood, energy, focus and completed-task score for each day.' },

  events: { domain: 'time', purpose: 'Calendar blocks', detail: 'Focus, buffer, review and admin blocks placed on a weekly timeline.' },
  event_task_links: { domain: 'time', purpose: 'Plan-to-calendar bridge', detail: 'Maps tasks into events and optionally records planned minutes.' },
  meetings: { domain: 'time', purpose: 'Scheduled collaboration', detail: 'Meetings connected to goals, milestones, notes and summaries.' },
  work_sessions: { domain: 'time', purpose: 'Auditable time ledger', detail: 'Immutable-ish work intervals that explain actual time on tasks and goals.' },
  user_schedule_prefs: { domain: 'time', purpose: 'Capacity policy', detail: 'Workdays, working hours, deep-work window, timezone and safety buffer.' },
  schedule_day_overrides: { domain: 'time', purpose: 'Calendar exceptions', detail: 'Overrides normal availability for one specific date.' },

  edges: { domain: 'organize', purpose: 'Universal relationship graph', detail: 'Polymorphic links such as contains, attached_to, blocks and co_cited.' },
  tags: { domain: 'organize', purpose: 'Tag vocabulary', detail: 'Canonical reusable labels and their display colors.' },
  entity_tags: { domain: 'organize', purpose: 'Polymorphic tagging', detail: 'Attaches a canonical tag to many kinds of entities.' },
  topics: { domain: 'organize', purpose: 'Cross-goal semantic clusters', detail: 'Curated or AI-created themes that group related entities.' },
  topic_aliases: { domain: 'organize', purpose: 'Topic naming memory', detail: 'Alternative names that resolve back to a canonical topic.' },
  topic_memberships: { domain: 'organize', purpose: 'Topic membership decisions', detail: 'Accepted and suggested entity-to-topic assignments with evidence.' },
  entity_aliases: { domain: 'organize', purpose: 'Entity naming memory', detail: 'Alternative names for goals, tasks, resources and other entities.' },
  suggestion_runs: { domain: 'organize', purpose: 'Clustering audit trail', detail: 'Tracks model parameters, statistics and outcomes for topic suggestions.' },

  entity_summaries: { domain: 'intelligence', purpose: 'Compressed entity memory', detail: 'Planning and semantic summaries used to reduce context size.' },
  embeddings: { domain: 'intelligence', purpose: 'Semantic vectors', detail: 'Vector representations used for meaning-based retrieval and similarity.' },
  embedding_jobs: { domain: 'intelligence', purpose: 'Embedding work queue', detail: 'Retryable lifecycle for creating, updating or deleting semantic vectors.' },
  extracted_facts: { domain: 'intelligence', purpose: 'Structured AI observations', detail: 'Facts and task candidates extracted from journals or other sources.' },
  ai_action_proposals: { domain: 'intelligence', purpose: 'Human-confirmed AI actions', detail: 'Pending, applied and rejected mutations proposed by the copilot.' },
  chat_sessions: { domain: 'intelligence', purpose: 'Conversation container', detail: 'Model, title and lifecycle for each Copilot conversation.' },
  chat_messages: { domain: 'intelligence', purpose: 'Conversation transcript', detail: 'User, assistant and system messages inside a session.' },
  schema_migrations: { domain: 'intelligence', purpose: 'Database evolution ledger', detail: 'Records each applied schema migration and when it ran.' },
};

const DOMAIN_TABLES: Record<DomainKey, string[]> = {
  capture: ['notes', 'journal_entries', 'journal_links', 'resources', 'resource_chunks', 'resource_logs', 'task_notes', 'task_note_files'],
  truth: ['goals', 'goal_milestones', 'goal_deadlines', 'tasks', 'daily_scores'],
  time: ['events', 'event_task_links', 'meetings', 'work_sessions', 'user_schedule_prefs', 'schedule_day_overrides'],
  organize: ['edges', 'tags', 'entity_tags', 'topics', 'topic_aliases', 'topic_memberships', 'entity_aliases', 'suggestion_runs'],
  intelligence: ['entity_summaries', 'embeddings', 'embedding_jobs', 'extracted_facts', 'ai_action_proposals', 'chat_sessions', 'chat_messages', 'schema_migrations'],
};

const CANVAS_WIDTH = 1780;
const CANVAS_HEIGHT = 1260;
const NODE_WIDTH = 268;
const NODE_HEIGHT = 88;

interface NodePosition {
  x: number;
  y: number;
}

const NODE_POSITIONS = new Map<string, NodePosition>();
for (const [domain, names] of Object.entries(DOMAIN_TABLES) as [DomainKey, string[]][]) {
  const step = names.length >= 8 ? 126 : names.length >= 6 ? 150 : 180;
  names.forEach((name, index) => {
    NODE_POSITIONS.set(name, { x: DOMAIN_META[domain].x, y: 142 + index * step });
  });
}

function humanize(name: string): string {
  return name.replaceAll('_', ' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function relationPath(source: NodePosition, target: NodePosition): string {
  const sourceCenterY = source.y + NODE_HEIGHT / 2;
  const targetCenterY = target.y + NODE_HEIGHT / 2;
  if (source.x === target.x) {
    const x = source.x + NODE_WIDTH;
    const bow = 48 + Math.min(90, Math.abs(targetCenterY - sourceCenterY) * 0.08);
    return `M ${x} ${sourceCenterY} C ${x + bow} ${sourceCenterY}, ${x + bow} ${targetCenterY}, ${x} ${targetCenterY}`;
  }
  const leftToRight = source.x < target.x;
  const x1 = leftToRight ? source.x + NODE_WIDTH : source.x;
  const x2 = leftToRight ? target.x : target.x + NODE_WIDTH;
  const bend = Math.max(90, Math.abs(x2 - x1) * 0.42);
  return `M ${x1} ${sourceCenterY} C ${x1 + (leftToRight ? bend : -bend)} ${sourceCenterY}, ${x2 + (leftToRight ? -bend : bend)} ${targetCenterY}, ${x2} ${targetCenterY}`;
}

function TableNode({
  table,
  selected,
  connected,
  dimmed,
  onSelect,
}: {
  table: AtlasTable;
  selected: boolean;
  connected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const narrative = TABLE_NARRATIVE[table.name];
  const domain = DOMAIN_META[narrative?.domain ?? 'intelligence'];
  const position = NODE_POSITIONS.get(table.name);
  if (!position) return null;

  const keyColumns = table.columns
    .filter(column => column.is_primary || column.name.endsWith('_id'))
    .slice(0, 3);

  return (
    <button
      type="button"
      data-testid={`atlas-table-${table.name}`}
      onClick={onSelect}
      className={`absolute text-left rounded-xl border transition-all duration-300 overflow-hidden ${
        selected
          ? 'bg-slate-900 border-white/50 shadow-[0_0_0_1px_rgba(255,255,255,.22),0_0_35px_rgba(129,140,248,.38)] scale-[1.03]'
          : connected
            ? 'bg-slate-900/95 border-white/20 shadow-[0_0_24px_rgba(99,102,241,.16)]'
            : 'bg-slate-950/90 border-white/10 hover:border-white/25 hover:bg-slate-900'
      } ${dimmed ? 'opacity-25' : 'opacity-100'}`}
      style={{ left: position.x, top: position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT, zIndex: selected ? 30 : 20 }}
      aria-label={`Inspect table ${table.name}`}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: domain.color, boxShadow: `0 0 16px ${domain.color}` }} />
      <span className="block px-4 pt-3 pb-2">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-mono text-[11px] font-bold text-white truncate">{table.name}</span>
            <span className="block text-[9px] text-slate-500 mt-0.5 truncate">{narrative?.purpose ?? 'Database table'}</span>
          </span>
          <span className="shrink-0 rounded-md bg-white/5 border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
            {table.row_count.toLocaleString()} rows
          </span>
        </span>
        <span className="flex items-center gap-1.5 mt-2 min-h-4 overflow-hidden">
          {keyColumns.length ? keyColumns.map(column => (
            <span key={column.name} className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[8px] text-slate-500">
              {column.is_primary && <KeyRound size={7} className="text-amber-400" />}
              {column.name}
            </span>
          )) : (
            <span className="font-mono text-[8px] text-slate-600">{table.columns.length} columns · {table.index_count} indexes</span>
          )}
        </span>
      </span>
    </button>
  );
}

function TableInspector({
  table,
  relationships,
  onSelectTable,
}: {
  table: AtlasTable;
  relationships: AtlasRelationship[];
  onSelectTable: (table: string) => void;
}) {
  const narrative = TABLE_NARRATIVE[table.name];
  const domain = DOMAIN_META[narrative?.domain ?? 'intelligence'];
  const relatedRelationships = relationships.filter(relationship =>
    relationship.source_table === table.name || relationship.target_table === table.name,
  );

  return (
    <aside data-testid="atlas-inspector" className="h-[780px] bg-[#0a0f1d] border border-white/10 rounded-2xl overflow-y-auto shadow-2xl">
      <div className="sticky top-0 z-10 bg-[#0a0f1d]/95 backdrop-blur-xl border-b border-white/10 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: domain.color }}>
              {domain.label}
            </p>
            <h4 className="font-headline text-xl font-bold text-white truncate mt-1">{table.name}</h4>
          </div>
          <span className="rounded-xl bg-white/5 border border-white/10 px-2.5 py-1.5 text-center">
            <span className="block text-lg font-headline font-bold text-white">{table.row_count.toLocaleString()}</span>
            <span className="block font-mono text-[8px] uppercase tracking-wider text-slate-500">live rows</span>
          </span>
        </div>
      </div>

      <div className="p-5 space-y-6">
        <section>
          <p className="font-headline text-sm font-bold text-white">{narrative?.purpose ?? 'Database table'}</p>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5">{narrative?.detail ?? 'Live PostgreSQL relation.'}</p>
        </section>

        <section className="grid grid-cols-3 gap-2">
          {[
            { label: 'Columns', value: table.columns.length },
            { label: 'Indexes', value: table.index_count },
            { label: 'Storage', value: formatBytes(table.total_bytes) },
          ].map(metric => (
            <div key={metric.label} className="rounded-xl bg-white/[0.035] border border-white/[0.07] px-3 py-2.5">
              <p className="font-headline font-bold text-sm text-white">{metric.value}</p>
              <p className="font-mono text-[8px] uppercase tracking-wider text-slate-600 mt-0.5">{metric.label}</p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-dashed border-indigo-400/30 bg-indigo-400/[0.05] p-4">
          <div className="flex items-center gap-2 text-indigo-300">
            <Box size={13} />
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider">Widget socket reserved</p>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed mt-2">
            This space is ready for the future full-size <b className="text-slate-300">{humanize(table.name)}</b> widget:
            live metrics, controls, records and table-specific workflows.
          </p>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <Link2 size={12} className="text-slate-500" />
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] font-bold text-slate-500">
              Relationships · {relatedRelationships.length}
            </p>
          </div>
          <div className="space-y-1.5">
            {relatedRelationships.map(relationship => {
              const outgoing = relationship.source_table === table.name;
              const otherTable = outgoing ? relationship.target_table : relationship.source_table;
              return (
                <button
                  type="button"
                  key={`${relationship.id}-${outgoing ? 'out' : 'in'}`}
                  onClick={() => onSelectTable(otherTable)}
                  className="w-full text-left rounded-lg bg-white/[0.035] hover:bg-white/[0.07] border border-white/[0.06] px-3 py-2 transition-colors"
                >
                  <span className="flex items-center gap-1.5 font-mono text-[9px]">
                    <span className={relationship.kind === 'physical' ? 'text-cyan-300' : 'text-fuchsia-300'}>
                      {outgoing ? table.name : otherTable}
                    </span>
                    <ArrowRight size={9} className="text-slate-600" />
                    <span className={relationship.kind === 'physical' ? 'text-cyan-300' : 'text-fuchsia-300'}>
                      {outgoing ? otherTable : table.name}
                    </span>
                    <span className="ml-auto text-[7px] uppercase tracking-wider text-slate-600">{relationship.kind}</span>
                  </span>
                  <span className="block text-[9px] text-slate-500 mt-1">
                    {relationship.label} · {relationship.source_column} → {relationship.target_column}
                  </span>
                </button>
              );
            })}
            {relatedRelationships.length === 0 && (
              <p className="text-[10px] text-slate-600 italic">No declared or annotated relationships.</p>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-2">
            <Table2 size={12} className="text-slate-500" />
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] font-bold text-slate-500">Complete column map</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] overflow-hidden">
            {table.columns.map(column => (
              <div key={column.name} className="flex items-start gap-2 px-3 py-2 border-b border-white/[0.05] last:border-b-0 bg-white/[0.02]">
                <div className="w-4 pt-0.5 shrink-0">
                  {column.is_primary
                    ? <KeyRound size={10} className="text-amber-400" />
                    : column.name.endsWith('_id')
                      ? <Link2 size={10} className="text-cyan-500" />
                      : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[9px] text-slate-200 break-all">{column.name}</p>
                  <p className="font-mono text-[8px] text-slate-600 mt-0.5">
                    {column.data_type}{column.nullable ? ' · nullable' : ' · required'}
                    {column.is_unique ? ' · unique' : ''}
                  </p>
                  {column.default_value && (
                    <p className="font-mono text-[7px] text-slate-700 truncate mt-0.5" title={column.default_value}>
                      default {column.default_value}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] font-bold text-slate-500 mb-2">
            Indexes · {table.indexes.length}
          </p>
          <div className="space-y-1.5">
            {table.indexes.map(index => (
              <div key={index.name} title={index.definition} className="rounded-lg bg-white/[0.025] border border-white/[0.05] px-3 py-2">
                <p className="font-mono text-[8px] text-slate-400 break-all">{index.name}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

export function DatabaseAtlas() {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedTable, setSelectedTable] = useState('tasks');
  const [search, setSearch] = useState('');
  const [relationMode, setRelationMode] = useState<'all' | 'physical' | 'logical'>('all');
  const [zoom, setZoom] = useState(0.72);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);

  const { data, isLoading, error } = useQuery<DatabaseAtlasResponse>({
    queryKey: ['database-atlas'],
    queryFn: () => apiFetch<DatabaseAtlasResponse>('/api/database-atlas'),
    staleTime: 60_000,
    retry: 1,
  });

  const tablesByName = useMemo(
    () => new Map((data?.tables ?? []).map(table => [table.name, table])),
    [data],
  );

  const visibleRelationships = useMemo(() => {
    if (!data) return [];
    return data.relationships.filter(relationship =>
      relationMode === 'all' || relationship.kind === relationMode,
    );
  }, [data, relationMode]);

  const selectedRelationships = useMemo(
    () => visibleRelationships.filter(relationship =>
      relationship.source_table === selectedTable || relationship.target_table === selectedTable,
    ),
    [visibleRelationships, selectedTable],
  );

  const connectedTables = useMemo(() => {
    const names = new Set<string>([selectedTable]);
    for (const relationship of selectedRelationships) {
      names.add(relationship.source_table);
      names.add(relationship.target_table);
    }
    return names;
  }, [selectedRelationships, selectedTable]);

  const selected = tablesByName.get(selectedTable) ?? data?.tables[0];
  const query = search.trim().toLowerCase();

  const resetView = () => {
    setZoom(0.72);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input')) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const start = panRef.current;
    if (!viewport || !start || start.pointerId !== event.pointerId) return;
    viewport.scrollLeft = start.left - (event.clientX - start.x);
    viewport.scrollTop = start.top - (event.clientY - start.y);
  };

  const stopPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  };

  return (
    <section className="mt-14" aria-labelledby="database-atlas-title">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-7 h-7 rounded-lg bg-[#0a0f1d] text-indigo-300 flex items-center justify-center shadow-lg">
              <Database size={14} />
            </span>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] font-bold text-[#4648d4]">System anatomy</p>
          </div>
          <h3 id="database-atlas-title" className="font-headline text-2xl font-bold text-black">Live Database Atlas</h3>
          <p className="text-sm text-gray-500 max-w-2xl mt-1">
            A living ERD of PostgreSQL. Follow the glowing veins, select any table, and inspect its complete contract.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(value => !value)}
          className="inline-flex items-center gap-2 self-start lg:self-auto rounded-full border border-gray-200 bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-500 hover:text-black hover:border-gray-300 transition-colors"
        >
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          {collapsed ? 'Open atlas' : 'Collapse atlas'}
        </button>
      </div>

      {!collapsed && (
        <div className="rounded-[24px] bg-[#050914] border border-slate-800 shadow-[0_28px_80px_rgba(15,23,42,.22)] p-3 md:p-4">
          {isLoading && (
            <div className="h-[520px] flex flex-col items-center justify-center gap-3">
              <Database size={30} className="text-indigo-400 animate-pulse" />
              <p className="font-mono text-[11px] text-slate-500">Reading live schema metadata…</p>
            </div>
          )}

          {error && (
            <div className="h-[420px] flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-red-300 font-bold">Database atlas unavailable</p>
              <p className="font-mono text-[10px] text-slate-600">{error instanceof Error ? error.message : 'Unknown error'}</p>
            </div>
          )}

          {data && selected && (
            <>
              <div className="flex flex-wrap items-center gap-2 px-2 pb-3">
                <div className="flex items-center gap-2 mr-auto">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9px] text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                    LIVE · {data.database.name}
                  </span>
                  <span className="font-mono text-[9px] text-slate-600">
                    {data.summary.tables} tables · {data.summary.columns} columns · {data.summary.rows.toLocaleString()} rows
                  </span>
                </div>

                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Find a table…"
                    aria-label="Find a database table"
                    className="w-44 rounded-lg bg-white/[0.04] border border-white/10 py-1.5 pl-7 pr-2 font-mono text-[9px] text-slate-200 placeholder:text-slate-700 focus:outline-none focus:border-indigo-400/60"
                  />
                </div>

                <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                  {(['all', 'physical', 'logical'] as const).map(mode => (
                    <button
                      type="button"
                      key={mode}
                      onClick={() => setRelationMode(mode)}
                      className={`rounded-md px-2 py-1 font-mono text-[8px] uppercase tracking-wider transition-colors ${
                        relationMode === mode ? 'bg-indigo-500 text-white' : 'text-slate-600 hover:text-slate-300'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                  <button type="button" onClick={() => setZoom(value => Math.max(0.5, value - 0.1))} aria-label="Zoom database atlas out" className="p-1.5 text-slate-600 hover:text-white"><ZoomOut size={11} /></button>
                  <span className="w-9 text-center font-mono text-[8px] text-slate-500">{Math.round(zoom * 100)}%</span>
                  <button type="button" onClick={() => setZoom(value => Math.min(1.1, value + 0.1))} aria-label="Zoom database atlas in" className="p-1.5 text-slate-600 hover:text-white"><ZoomIn size={11} /></button>
                  <button type="button" onClick={resetView} aria-label="Reset database atlas view" className="p-1.5 text-slate-600 hover:text-white border-l border-white/10"><RotateCcw size={10} /></button>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div
                  ref={viewportRef}
                  data-testid="database-atlas-canvas"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={stopPan}
                  onPointerCancel={stopPan}
                  className="h-[780px] overflow-auto rounded-2xl border border-white/[0.08] bg-[#070c18] cursor-grab active:cursor-grabbing select-none"
                  style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(148,163,184,.12) 1px, transparent 0)',
                    backgroundSize: '22px 22px',
                    touchAction: 'none',
                  }}
                >
                  <div style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom, position: 'relative' }}>
                    <div
                      className="absolute top-0 left-0"
                      style={{
                        width: CANVAS_WIDTH,
                        height: CANVAS_HEIGHT,
                        transform: `scale(${zoom})`,
                        transformOrigin: 'top left',
                      }}
                    >
                      <div className="absolute left-8 top-7 right-8 flex items-center gap-3">
                        <Sparkles size={12} className="text-indigo-400" />
                        <p className="font-mono text-[9px] text-slate-600">
                          Drag the empty space to pan · select a table to energize its neighborhood · solid cyan = enforced FK · dashed pink = logical contract
                        </p>
                      </div>

                      {(Object.entries(DOMAIN_META) as [DomainKey, typeof DOMAIN_META[DomainKey]][]).map(([key, domain]) => (
                        <div key={key} className="absolute top-[68px]" style={{ left: domain.x, width: NODE_WIDTH }}>
                          <div className="h-px w-full opacity-50" style={{ background: `linear-gradient(90deg, ${domain.color}, transparent)` }} />
                          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] mt-2" style={{ color: domain.color }}>{domain.label}</p>
                          <p className="text-[9px] leading-relaxed text-slate-600 mt-1">{domain.caption}</p>
                        </div>
                      ))}

                      <svg
                        className="absolute inset-0 pointer-events-none overflow-visible"
                        width={CANVAS_WIDTH}
                        height={CANVAS_HEIGHT}
                        aria-hidden="true"
                        style={{ zIndex: 5 }}
                      >
                        <defs>
                          <filter id="atlas-cyan-glow" x="-80%" y="-80%" width="260%" height="260%">
                            <feGaussianBlur stdDeviation="4" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                          </filter>
                          <filter id="atlas-pink-glow" x="-80%" y="-80%" width="260%" height="260%">
                            <feGaussianBlur stdDeviation="3.5" result="blur" />
                            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                          </filter>
                          <marker id="atlas-arrow-cyan" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                            <path d="M0,0 L7,3.5 L0,7 z" fill="#22d3ee" />
                          </marker>
                          <marker id="atlas-arrow-pink" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                            <path d="M0,0 L7,3.5 L0,7 z" fill="#f472b6" />
                          </marker>
                        </defs>
                        {visibleRelationships.map(relationship => {
                          const source = NODE_POSITIONS.get(relationship.source_table);
                          const target = NODE_POSITIONS.get(relationship.target_table);
                          if (!source || !target) return null;
                          const active = relationship.source_table === selectedTable || relationship.target_table === selectedTable;
                          const color = relationship.kind === 'physical' ? '#22d3ee' : '#f472b6';
                          return (
                            <g key={relationship.id} opacity={active ? 0.96 : 0.12}>
                              <path
                                d={relationPath(source, target)}
                                fill="none"
                                stroke={color}
                                strokeWidth={active ? 2.2 : 1}
                                strokeDasharray={relationship.kind === 'logical' ? '7 7' : undefined}
                                markerEnd={`url(#atlas-arrow-${relationship.kind === 'physical' ? 'cyan' : 'pink'})`}
                                filter={active ? `url(#atlas-${relationship.kind === 'physical' ? 'cyan' : 'pink'}-glow)` : undefined}
                                className={active ? 'atlas-vein-active' : undefined}
                              />
                            </g>
                          );
                        })}
                      </svg>

                      {data.tables.map(table => {
                        const matches = !query || table.name.toLowerCase().includes(query) || TABLE_NARRATIVE[table.name]?.purpose.toLowerCase().includes(query);
                        return (
                          <TableNode
                            key={table.name}
                            table={table}
                            selected={table.name === selectedTable}
                            connected={connectedTables.has(table.name)}
                            dimmed={!matches || (Boolean(selectedTable) && !connectedTables.has(table.name))}
                            onSelect={() => setSelectedTable(table.name)}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                <TableInspector
                  table={selected}
                  relationships={data.relationships}
                  onSelectTable={setSelectedTable}
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 pt-3 font-mono text-[8px] text-slate-600">
                <span className="inline-flex items-center gap-1.5"><span className="w-5 h-px bg-cyan-400 shadow-[0_0_8px_#22d3ee]" /> Enforced foreign key ({data.summary.physical_relationships})</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-pink-400" /> Logical / polymorphic ({data.summary.logical_relationships})</span>
                <span className="ml-auto">Snapshot {new Date(data.generated_at).toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
