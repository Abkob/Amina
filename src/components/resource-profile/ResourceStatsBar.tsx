import type { ResourceStats } from '../../db/schema';

function fmtMinutes(mins: number): string {
  if (mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days  = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30)  return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8)  return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function StatCard({
  label,
  value,
  skeleton,
  testId,
}: {
  label: string;
  value: string;
  skeleton?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="font-mono text-[8px] uppercase tracking-widest text-gray-400">{label}</p>
      {skeleton
        ? <div data-testid="stat-skeleton" className="h-5 w-16 animate-pulse rounded bg-gray-100" />
        : <p data-testid={testId} className="text-lg font-bold text-gray-900 leading-none">{value}</p>
      }
    </div>
  );
}

export function ResourceStatsBar({ stats }: { stats: ResourceStats | null }) {
  const skeleton = stats === null;
  return (
    <div className="grid grid-cols-2 gap-3 px-8 py-4 sm:grid-cols-4">
      <StatCard
        label="Time Invested"
        value={skeleton ? '' : fmtMinutes(stats!.total_minutes)}
        skeleton={skeleton}
        testId="time-value"
      />
      <StatCard
        label="Referenced In"
        value={skeleton ? '' : String(stats!.reference_count)}
        skeleton={skeleton}
        testId="reference-count-value"
      />
      <StatCard
        label="Goals Touched"
        value={skeleton ? '' : String(stats!.goals_count)}
        skeleton={skeleton}
        testId="goals-count-value"
      />
      <StatCard
        label="Last Engaged"
        value={skeleton ? '' : (stats!.last_engaged ? fmtRelative(stats!.last_engaged) : '—')}
        skeleton={skeleton}
        testId="last-engaged-value"
      />
    </div>
  );
}
