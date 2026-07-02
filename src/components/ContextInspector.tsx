import { useEffect, useState } from 'react';
import { X, ExternalLink, FileText, Link, Figma, File, Lightbulb, MessageSquare, BookOpen } from 'lucide-react';
import {
  getResource,
  getResourceLogs,
  getResourceReferences,
  type ResourceReference,
} from '../db/queries/resources';
import type { DBResource, ResourceLog } from '../db/schema';
import { useAppStore } from '../store/useAppStore';

type FeedEntry =
  | { kind: 'log';  ts: string; item: ResourceLog }
  | { kind: 'ref';  ts: string; item: ResourceReference };

function resourceIcon(type: string) {
  if (type === 'figma')    return <Figma size={14} className="text-purple-500" />;
  if (type === 'link')     return <Link size={14} className="text-teal-500" />;
  if (type === 'document') return <FileText size={14} className="text-blue-500" />;
  return <File size={14} className="text-gray-400" />;
}

function refSourceLabel(ref: ResourceReference): string {
  const src = ref.source_type;
  if (src === 'task')      return 'Mentioned in task';
  if (src === 'note')      return 'Cited in note';
  if (src === 'braindump') return 'In brain-dump';
  if (src === 'goal')      return 'Linked to goal';
  return `Referenced (${src})`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ContextInspector({
  resource,
  onClose,
}: {
  resource: DBResource | null;
  onClose: () => void;
}) {
  const { navigateToResource } = useAppStore();
  const [logs, setLogs] = useState<ResourceLog[]>([]);
  const [refs, setRefs] = useState<ResourceReference[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resource) { setLogs([]); setRefs([]); return; }
    setLoading(true);
    Promise.all([
      getResourceLogs(resource.id),
      getResourceReferences(resource.id),
    ]).then(([l, r]) => {
      setLogs(l);
      setRefs(r);
    }).finally(() => setLoading(false));
  }, [resource?.id]);

  if (!resource) return null;

  const feed: FeedEntry[] = [
    ...logs.map(l => ({ kind: 'log' as const, ts: l.created_at, item: l })),
    ...refs.map(r => ({ kind: 'ref' as const, ts: r.created_at, item: r })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <div className="shrink-0 border-t-2 border-[#4648d4]/20 bg-white flex flex-col" style={{ maxHeight: '50%' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center shrink-0">
          {resourceIcon(resource.type)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-gray-800 truncate">{resource.title}</p>
          <p className="text-[9px] text-gray-400 font-mono uppercase">{resource.type} · activity log</p>
        </div>
        <button
          onClick={() => navigateToResource(resource.id)}
          title="Open full profile"
          className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
        >
          <ExternalLink size={12} />
        </button>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100"
        >
          <X size={12} />
        </button>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {loading && (
          <p className="text-[10px] text-gray-400 italic text-center py-4">Loading…</p>
        )}

        {!loading && feed.length === 0 && (
          <p className="text-[10px] text-gray-400 italic text-center py-4">
            No activity yet for this resource.
          </p>
        )}

        {feed.map((entry, i) => (
          <div key={i} className="flex gap-2">
            {/* Timeline dot */}
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                entry.kind === 'log'
                  ? (entry.item as ResourceLog).is_insight ? 'bg-[#4648d4]' : 'bg-teal-400'
                  : 'bg-gray-300'
              }`} />
              {i < feed.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" />}
            </div>

            {/* Entry content */}
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <div className="flex items-center gap-1">
                  {entry.kind === 'log' ? (
                    (entry.item as ResourceLog).is_insight
                      ? <Lightbulb size={10} className="text-[#4648d4] shrink-0" />
                      : <MessageSquare size={10} className="text-teal-400 shrink-0" />
                  ) : (
                    <BookOpen size={10} className="text-gray-400 shrink-0" />
                  )}
                  <span className="text-[10px] font-semibold text-gray-700">
                    {entry.kind === 'log'
                      ? ((entry.item as ResourceLog).is_insight ? 'Insight' : 'Note')
                      : refSourceLabel(entry.item as ResourceReference)
                    }
                  </span>
                </div>
                <span className="text-[9px] text-gray-400 shrink-0">{timeAgo(entry.ts)}</span>
              </div>

              {entry.kind === 'log' ? (
                <p className="text-[10px] text-gray-600 leading-relaxed">
                  {(entry.item as ResourceLog).content}
                </p>
              ) : (
                <div>
                  <p className="text-[10px] text-gray-600 leading-relaxed">
                    {(entry.item as ResourceReference).source_title ?? (entry.item as ResourceReference).source_content?.slice(0, 100) ?? '—'}
                  </p>
                  {(entry.item as ResourceReference).parent_title && (
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      in <span className="font-medium">{(entry.item as ResourceReference).parent_title}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
