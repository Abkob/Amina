import type { ResourceLog } from '../../db/schema';
import type { ResourceReference } from '../../db/queries/resources';

const WEEKS = 12;

function weekKey(iso: string): string {
  const d = new Date(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function mondaysBefore(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(mon);
    d.setDate(mon.getDate() - i * 7);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function shortLabel(isoWeek: string) {
  return new Date(isoWeek).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ResourceActivityChart({
  logs,
  refs,
}: {
  logs: ResourceLog[];
  refs: ResourceReference[];
}) {
  const weeks = mondaysBefore(WEEKS);

  const logCounts: Record<string, number> = {};
  const refCounts: Record<string, number> = {};
  weeks.forEach(w => { logCounts[w] = 0; refCounts[w] = 0; });

  for (const l of logs) {
    const k = weekKey(l.created_at);
    if (k in logCounts) logCounts[k]++;
  }
  for (const r of refs) {
    const k = weekKey(r.created_at);
    if (k in refCounts) refCounts[k]++;
  }

  const maxVal = Math.max(1, ...weeks.map(w => (logCounts[w] ?? 0) + (refCounts[w] ?? 0)));
  const totalLogs = logs.length;
  const totalRefs = refs.length;

  const W = 560, H = 90;
  const pad = { left: 4, right: 4, top: 6, bottom: 20 };
  const chartH = H - pad.top - pad.bottom;
  const barWidth = (W - pad.left - pad.right) / weeks.length;
  const gap = 3;

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-gray-400">
          Activity — last 12 weeks
        </p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-mono text-[9px] text-gray-400">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#4648d4]" />
            {totalLogs} log{totalLogs !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1 font-mono text-[9px] text-gray-400">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" />
            {totalRefs} ref{totalRefs !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {totalLogs + totalRefs === 0 ? (
        <p className="py-4 text-center text-xs text-gray-300 italic">No activity yet</p>
      ) : (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
          {weeks.map((w, i) => {
            const l = logCounts[w] ?? 0;
            const r = refCounts[w] ?? 0;
            const x = pad.left + i * barWidth + gap / 2;
            const bw = barWidth - gap;

            const refH = r > 0 ? Math.max(3, (r / maxVal) * chartH) : 0;
            const logH = l > 0 ? Math.max(3, (l / maxVal) * chartH) : 0;
            const refY = pad.top + chartH - refH;
            const logY = refY - logH;

            return (
              <g key={w}>
                {refH > 0 && <rect x={x} y={refY} width={bw} height={refH} rx={2} fill="#34d399" fillOpacity={0.85} />}
                {logH > 0 && <rect x={x} y={logY} width={bw} height={logH} rx={2} fill="#4648d4" fillOpacity={0.85} />}
                {(i % 3 === 0 || i === weeks.length - 1) && (
                  <text x={x + bw / 2} y={H - 2} textAnchor="middle" fontSize={7} fill="#9ca3af" fontFamily="monospace">
                    {shortLabel(w)}
                  </text>
                )}
                {(l + r) > 0 && <title>{shortLabel(w)}: {l} log{l !== 1 ? 's' : ''}, {r} ref{r !== 1 ? 's' : ''}</title>}
              </g>
            );
          })}
          <line x1={pad.left} y1={pad.top + chartH} x2={W - pad.right} y2={pad.top + chartH}
            stroke="#e5e7eb" strokeWidth={1} />
        </svg>
      )}
    </div>
  );
}
