import { Trash2 } from 'lucide-react';
import type { ResourceLog } from '../../db/schema';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ResourceInsightsPinned({
  logs,
  onDelete,
}: {
  logs: ResourceLog[];
  onDelete: (log: ResourceLog) => void;
}) {
  const insights = logs.filter(l => l.is_insight === 1);
  if (insights.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-widest text-amber-600">
        ★ Key Insights ({insights.length})
      </p>
      <div className="space-y-2">
        {insights.map(log => (
          <div
            key={log.id}
            data-testid="insight-card"
            className="group/insight relative rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          >
            <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">{log.content}</p>
            <p className="mt-1.5 font-mono text-[9px] text-amber-400">{fmtDate(log.created_at)}</p>
            <button
              onClick={() => onDelete(log)}
              aria-label="delete insight"
              className="absolute right-3 top-3 opacity-0 group-hover/insight:opacity-100
                text-amber-300 hover:text-red-400 transition-all"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
