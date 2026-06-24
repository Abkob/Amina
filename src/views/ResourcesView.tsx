import { useState, useEffect } from 'react';
import { Folder, FileText, Eye, ExternalLink } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { FileViewerModal } from '../components/FileViewerModal';
import type { DBGoal, DBResource } from '../db/schema';

const VIEWABLE_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'md', 'txt']);

function extOf(url: string): string {
  try { return new URL(url).pathname.split('.').pop()?.toLowerCase() ?? ''; }
  catch { return url.split('.').pop()?.toLowerCase() ?? ''; }
}

function mimeOf(url: string): string {
  const ext = extOf(url);
  const map: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', md: 'text/markdown', txt: 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

function isViewable(url: string | null): boolean {
  if (!url) return false;
  return VIEWABLE_EXT.has(extOf(url));
}

// ─── Resource row ─────────────────────────────────────────────────────────────
function ResourceRow({
  resource,
  onView,
}: {
  resource: DBResource;
  onView: (r: DBResource) => void;
}) {
  const canView   = isViewable(resource.url);
  const isExtLink = resource.url?.startsWith('http');

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 group/row">
      <FileText size={12} className="text-gray-300 shrink-0" />
      <span className="truncate flex-1">{resource.title}</span>
      <span className="text-[10px] font-mono text-gray-300 shrink-0">{resource.type}</span>

      {resource.url && (
        <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
          {canView && (
            <button
              onClick={() => onView(resource)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-[#4648d4] hover:bg-[#EEF2FF] transition-colors"
              title="Live preview"
            >
              <Eye size={10} />
              View
            </button>
          )}
          {isExtLink && (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-gray-400 hover:bg-gray-100 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink size={10} />
              Open
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export function ResourcesView() {
  const [goalsWithResources, setGoalsWithResources] = useState<{ goal: DBGoal; resources: DBResource[] }[]>([]);
  const [viewing, setViewing] = useState<DBResource | null>(null);

  useEffect(() => {
    const load = async () => {
      const goals = await fetch('/api/goals').then(r => r.json()) as DBGoal[];
      const results = await Promise.all(
        goals.map(async (goal) => {
          const res: DBResource[] = await fetch(`/api/resources?goal_id=${goal.id}`).then(r => r.json());
          return res.length ? { goal, resources: res } : null;
        })
      );
      setGoalsWithResources(results.filter(Boolean) as { goal: DBGoal; resources: DBResource[] }[]);
    };
    load();
    const id = setInterval(load, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="max-w-[1000px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
        <div className="mb-6">
          <h2 className="font-headline text-2xl font-bold text-black mb-1">Resources</h2>
          <p className="text-sm text-gray-500">
            Structured document vault automatically tracked through mental traces.
          </p>
        </div>

        {goalsWithResources.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">
            No resources yet. Attach links or documents inside a goal's tasks.
          </div>
        ) : (
          <div className="space-y-6">
            {goalsWithResources.map(({ goal, resources }) => (
              <div key={goal.id} className="bg-white rounded-xl border border-gray-150 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Folder size={14} className="text-[#4648d4]" />
                  <span className="font-bold text-sm text-gray-900">{goal.title}</span>
                  <span className="font-mono text-[9px] text-gray-400 uppercase tracking-wider">{goal.category}</span>
                </div>
                <div className="space-y-2">
                  {resources.map(r => (
                    <ResourceRow key={r.id} resource={r} onView={setViewing} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewing && viewing.url && (
          <FileViewerModal
            key={viewing.id}
            src={viewing.url}
            name={viewing.title}
            mimeType={mimeOf(viewing.url)}
            onClose={() => setViewing(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
