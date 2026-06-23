import { Folder, FileText } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { DBGoal, DBResource } from '../db/schema';

// Fetch resources attached to a goal via edges
async function getGoalsWithResources(): Promise<{ goal: DBGoal; resources: DBResource[] }[]> {
  const goals = await db.goals.toArray();
  const results: { goal: DBGoal; resources: DBResource[] }[] = [];

  for (const goal of goals) {
    const edges = await db.edges
      .where('target_id').equals(goal.id)
      .filter(e => e.relationship === 'attached_to' && e.source_type === 'resource')
      .toArray();
    if (edges.length === 0) continue;
    const ids = edges.map(e => e.source_id);
    const resources = await db.resources.where('id').anyOf(ids).toArray();
    if (resources.length > 0) results.push({ goal, resources });
  }

  return results;
}

export function ResourcesView() {
  const goalsWithResources = useLiveQuery(() => getGoalsWithResources()) ?? [];

  return (
    <div className="max-w-[1000px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
      <div className="mb-6">
        <h2 className="font-headline text-2xl font-bold text-black mb-1">Resources</h2>
        <p className="text-sm text-gray-500">
          Structured document vault automatically tracked through mental traces.
        </p>
      </div>

      {goalsWithResources.length === 0 ? (
        <div className="text-center py-16 bg-[#f8f9fa] rounded-xl border border-dashed border-gray-200">
          <Folder size={36} className="text-gray-300 mx-auto mb-3 animate-pulse" />
          <p className="text-gray-800 font-semibold mb-1">No resources attached yet</p>
          <p className="text-xs text-gray-400 max-w-xs mx-auto">
            Attach links or files inside any goal's detail view to see them here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goalsWithResources.map(({ goal, resources }) => (
            <div key={goal.id} className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex items-center gap-1.5 text-[#4648d4] font-mono text-[9px] uppercase tracking-wide font-bold mb-3 bg-[#EEF2FF] px-2 py-0.5 rounded w-max">
                <Folder size={11} />
                <span>{goal.title}</span>
              </div>
              <div className="space-y-3">
                {resources.map((res) => (
                  <div key={res.id} className="p-3 bg-[#f8f9fa] rounded-xl border border-gray-150 flex items-center justify-between hover:border-black/25 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {res.type === 'figma' ? (
                        <span className="text-red-500 font-mono text-xs font-bold border border-red-200 bg-red-50 p-1 rounded shrink-0">F</span>
                      ) : (
                        <FileText size={16} className="text-gray-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate leading-snug">{res.title}</p>
                        <p className="text-[9px] font-mono text-gray-400 mt-0.5">{res.info}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
