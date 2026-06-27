import { Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ResourceLog } from '../../db/schema';
import type { ResourceReference } from '../../db/queries/resources';

const SOURCE_LABEL: Record<string, string> = {
  note: 'Journal', task: 'Task', goal: 'Goal', braindump: 'Brain Dump',
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

type TimelineItem =
  | { kind: 'log'; data: ResourceLog }
  | { kind: 'ref'; data: ResourceReference };

export function ResourceTimeline({
  logs,
  refs,
  onDeleteLog,
}: {
  logs: ResourceLog[];
  refs: ResourceReference[];
  onDeleteLog: (log: ResourceLog) => void;
}) {
  // Only progress logs (insights shown separately above)
  const progressLogs = logs.filter(l => l.is_insight === 0);

  const items: TimelineItem[] = [
    ...progressLogs.map(l => ({ kind: 'log' as const, data: l })),
    ...refs.map(r => ({ kind: 'ref' as const, data: r })),
  ].sort((a, b) => b.data.created_at.localeCompare(a.data.created_at));

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-gray-300 italic">
        No activity yet — log a note or reference this resource somewhere.
      </p>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-gray-100" />
      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {items.map(item => {
            const key = item.kind === 'log'
              ? `log-${item.data.id}`
              : `ref-${(item.data as ResourceReference).edge_id}`;

            return (
              <motion.div
                key={key}
                data-testid="timeline-item"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="group/tl relative flex gap-3 pl-5"
              >
                {/* Dot */}
                <div className={`absolute left-0 top-[10px] flex h-3.5 w-3.5 items-center justify-center
                  rounded-full border-2 border-white
                  ${item.kind === 'log' ? 'bg-[#4648d4]' : 'bg-emerald-400'}`}
                />

                {item.kind === 'log' ? (
                  <div className={`min-w-0 flex-1 mb-1 rounded-xl border-l-2 border-[#4648d4]
                    border border-gray-100 bg-gray-50 px-3 py-2.5`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {item.data.content}
                      </p>
                      <button
                        onClick={() => onDeleteLog(item.data as ResourceLog)}
                        className="shrink-0 opacity-0 group-hover/tl:opacity-100 text-gray-300
                          hover:text-red-400 transition-all"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <p className="mt-1.5 font-mono text-[9px] text-gray-300">{fmtDate(item.data.created_at)}</p>
                  </div>
                ) : (() => {
                  const ref = item.data as ResourceReference;
                  const excerpt = ref.source_content
                    ? ref.source_content.slice(0, 200) + (ref.source_content.length >= 200 ? '…' : '')
                    : null;
                  return (
                    <div className="min-w-0 flex-1 mb-1 rounded-xl border-l-2 border-emerald-400
                      border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <div className="mb-1 flex items-center gap-1.5 flex-wrap">
                        <span className="rounded-full bg-emerald-50 px-2 py-px font-mono text-[8px]
                          uppercase tracking-wide text-emerald-600">
                          {SOURCE_LABEL[ref.source_type] ?? ref.source_type}
                        </span>
                        {ref.parent_title && (
                          <span className="text-[10px] text-gray-500">
                            in <span className="font-semibold">{ref.parent_title}</span>
                          </span>
                        )}
                        {!ref.parent_title && ref.source_title && (
                          <span className="text-[10px] font-semibold text-gray-600 truncate">
                            {ref.source_title}
                          </span>
                        )}
                      </div>
                      {excerpt && (
                        <p className="text-[11px] text-gray-500 leading-relaxed italic line-clamp-3">
                          "{excerpt}"
                        </p>
                      )}
                      <p className="mt-1.5 font-mono text-[9px] text-gray-300">{fmtDate(ref.created_at)}</p>
                    </div>
                  );
                })()}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
