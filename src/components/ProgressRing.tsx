interface ProgressRingProps {
  progress: number;       // 0-100 finalization %
  activityLevel: number;  // 1-5
  status: 'Safe' | 'Watch' | 'Risky';
  size?: 'sm' | 'md';    // sm = 64px (card), md = 56px (detail)
}

const STATUS_COLOR = {
  Safe:  '#10B981',
  Watch: '#F59E0B',
  Risky: '#EF4444',
};

export function ProgressRing({ progress, activityLevel, status, size = 'sm' }: ProgressRingProps) {
  const dim = size === 'sm' ? 64 : 56;

  // Outer ring (finalization/progress)
  const rO = 40, circO = 2 * Math.PI * rO;
  const dashOffsetO = circO * (1 - progress / 100);

  // Inner ring (activity level)
  const rI = 32, circI = 2 * Math.PI * rI;
  const dashOffsetI = circI * (1 - activityLevel / 5);

  return (
    <div className="relative shrink-0" style={{ width: dim, height: dim }}>
      <svg className="w-full h-full -rotate-90 origin-center" viewBox="0 0 100 100">
        {/* Outer track */}
        <circle cx="50" cy="50" r={rO} fill="transparent" stroke="#e1e3e4" strokeWidth="6" />
        {/* Inner track */}
        <circle cx="50" cy="50" r={rI} fill="transparent" stroke="#edeeef" strokeWidth="4" />
        {/* Inner activity ring */}
        <circle
          cx="50" cy="50" r={rI}
          fill="transparent"
          stroke="#c0c1ff"
          strokeWidth="4"
          strokeDasharray={circI}
          strokeDashoffset={dashOffsetI}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
        {/* Outer progress ring */}
        <circle
          cx="50" cy="50" r={rO}
          fill="transparent"
          stroke={STATUS_COLOR[status]}
          strokeWidth="6"
          strokeDasharray={circO}
          strokeDashoffset={dashOffsetO}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-gray-900 font-bold">
        {progress}%
      </div>
    </div>
  );
}
