import { useState, useEffect } from 'react';
import { Folder, FileText } from 'lucide-react';
import type { DBGoal, DBResource } from '../db/schema';

export function ResourcesView() {
  const [goalsWithResources, setGoalsWithResources] = useState<{ goal: DBGoal; resources: DBResource[] }[]>([]);

  useEffect(() => {
    const load = async () => {
      const [goals, resources] = await Promise.all([
        fetch('/api/goals').then(r => r.json()) as Promise<DBGoal[]>,
        fetch('/api/resources').then(r => r.json()) as Promise<DBResource[]>,
      ]);
      // Group resources by goal via fetching per-goal resources
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
                  <div key={r.id} className="flex items-center gap-2 text-sm text-gray-600">
                    <FileText size={12} className="text-gray-300 shrink-0" />
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-[#4648d4] hover:underline truncate">
                        {r.title}
                      </a>
                    ) : (
                      <span className="truncate">{r.title}</span>
                    )}
                    <span className="text-[10px] font-mono text-gray-300 shrink-0 ml-auto">{r.type}</span>
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
