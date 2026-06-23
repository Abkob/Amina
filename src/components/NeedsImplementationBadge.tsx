export function NeedsImplementationBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider text-amber-700 ${className}`}
    >
      Needs implementation
    </span>
  );
}
