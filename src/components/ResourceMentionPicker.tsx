import { useEffect, useRef, useState } from 'react';
import { BookOpen, Database, FileText, Globe, Lightbulb, Link, Package, Users, X } from 'lucide-react';
import { getAllResources } from '../db/queries/resources';
import type { DBResource, ResourceType } from '../db/schema';

const TYPE_META: Record<ResourceType, { icon: React.ElementType; color: string; label: string }> = {
  paper:    { icon: BookOpen,   color: 'text-violet-500',  label: 'Paper'   },
  person:   { icon: Users,      color: 'text-blue-500',    label: 'Person'  },
  dataset:  { icon: Database,   color: 'text-emerald-500', label: 'Dataset' },
  concept:  { icon: Lightbulb,  color: 'text-amber-500',   label: 'Concept' },
  link:     { icon: Globe,      color: 'text-sky-500',     label: 'Link'    },
  figma:    { icon: Link,       color: 'text-pink-500',    label: 'Figma'   },
  document: { icon: FileText,   color: 'text-gray-400',    label: 'Doc'     },
  other:    { icon: Package,    color: 'text-gray-400',    label: 'Other'   },
};

function ResourceTypeIcon({ type, size = 13 }: { type: ResourceType; size?: number }) {
  const { icon: Icon, color } = TYPE_META[type] ?? TYPE_META.other;
  return <Icon size={size} className={`shrink-0 ${color}`} />;
}

export { ResourceTypeIcon };

// ─── Chip shown after a resource is selected ──────────────────────────────────
export function ResourceMentionChip({
  resource,
  onRemove,
}: {
  resource: DBResource & { edge_id?: string };
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4648d4]/20 bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-medium text-[#4648d4]">
      <ResourceTypeIcon type={resource.type} size={10} />
      <span className="max-w-[140px] truncate">{resource.title}</span>
      {onRemove && (
        <button
          onMouseDown={e => { e.preventDefault(); onRemove(); }}
          className="text-[#4648d4]/40 hover:text-red-400 transition-colors"
        >
          <X size={9} />
        </button>
      )}
    </span>
  );
}

// ─── Floating picker dropdown ─────────────────────────────────────────────────
export function ResourceMentionPicker({
  query,
  onSelect,
  onClose,
  className = '',
}: {
  query: string;
  onSelect: (resource: DBResource) => void;
  onClose: () => void;
  className?: string;
}) {
  const [resources, setResources] = useState<DBResource[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllResources().then(setResources).catch(() => {});
  }, []);

  const filtered = resources.filter(r =>
    r.title.toLowerCase().includes(query.toLowerCase()) ||
    r.type.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  useEffect(() => { setHighlighted(0); }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
      if (e.key === 'Enter' && filtered[highlighted]) { e.preventDefault(); onSelect(filtered[highlighted]); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filtered, highlighted, onSelect, onClose]);

  if (filtered.length === 0 && !query) return null;

  return (
    <div
      ref={listRef}
      className={`z-50 rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden min-w-[260px] ${className}`}
    >
      {filtered.length === 0 ? (
        <div className="px-4 py-3 text-xs text-gray-400 italic">No resources match "{query}"</div>
      ) : (
        filtered.map((r, i) => (
          <button
            key={r.id}
            onMouseDown={e => { e.preventDefault(); onSelect(r); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
              i === highlighted ? 'bg-[#EEF2FF]' : 'hover:bg-gray-50'
            }`}
          >
            <ResourceTypeIcon type={r.type} size={14} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-800 truncate">{r.title}</p>
              {r.info && <p className="text-[10px] text-gray-400 truncate">{r.info}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-px font-mono text-[8px] text-gray-400 uppercase">
              {TYPE_META[r.type]?.label ?? r.type}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

// ─── Hook: attach to a textarea — detects @, shows picker, manages selections ─
export function useResourceMentions() {
  const [query, setQuery]           = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [mentionStart, setMentionStart] = useState(0);
  const [pending, setPending]       = useState<DBResource[]>([]);

  function onTextChange(value: string, cursorPos: number) {
    const textBefore = value.slice(0, cursorPos);
    const match = textBefore.match(/@([\w\s]*)$/);
    if (match) {
      setQuery(match[1]);
      setMentionStart(cursorPos - match[0].length);
      setShowPicker(true);
    } else {
      setShowPicker(false);
      setQuery('');
    }
  }

  function selectResource(resource: DBResource, draftRef: { value: string; set: (v: string) => void }, cursorPos: number) {
    // Strip the @query text from the draft
    const before = draftRef.value.slice(0, mentionStart);
    const after  = draftRef.value.slice(cursorPos);
    draftRef.set(before + after);
    // Add to pending list (dedup)
    setPending(prev => prev.find(r => r.id === resource.id) ? prev : [...prev, resource]);
    setShowPicker(false);
    setQuery('');
  }

  function removePending(resourceId: string) {
    setPending(prev => prev.filter(r => r.id !== resourceId));
  }

  function clearPending() { setPending([]); }

  return { query, showPicker, pending, onTextChange, selectResource, removePending, clearPending, setShowPicker };
}
