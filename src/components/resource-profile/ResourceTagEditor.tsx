import { useState, useRef } from 'react';
import { X } from 'lucide-react';

export function ResourceTagEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const t = draft.trim();
    if (!t || tags.includes(t)) { setDraft(''); return; }
    onChange([...tags, t]);
    setDraft('');
  };

  const remove = (tag: string) => onChange(tags.filter(t => t !== tag));

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 px-8 py-3 border-b border-gray-100 bg-white cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5
            font-mono text-[10px] text-gray-600"
        >
          {tag}
          <button
            onMouseDown={e => { e.preventDefault(); remove(tag); }}
            aria-label={`remove ${tag}`}
            className="text-gray-400 hover:text-red-400 transition-colors"
          >
            <X size={9} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
          if (e.key === 'Backspace' && !draft && tags.length) remove(tags[tags.length - 1]);
        }}
        placeholder={tags.length === 0 ? 'Add tags (Enter to add)…' : '+'}
        className="min-w-[80px] flex-1 bg-transparent font-mono text-[10px] text-gray-600
          outline-none placeholder:text-gray-300"
      />
    </div>
  );
}
