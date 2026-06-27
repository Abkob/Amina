import { useRef, useState } from 'react';
import { Lightbulb, Plus } from 'lucide-react';

export function ResourceLogComposer({
  onSubmit,
}: {
  onSubmit: (content: string, isInsight: boolean) => Promise<void>;
}) {
  const [draft,     setDraft]     = useState('');
  const [insight,   setInsight]   = useState(false);
  const [busy,      setBusy]      = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await onSubmit(content, insight);
      setDraft('');
      textareaRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const empty = !draft.trim();

  return (
    <div className={`rounded-xl border p-4 transition-colors ${insight
      ? 'border-amber-200 bg-amber-50/60'
      : 'border-gray-200 bg-gray-50'
    }`}>
      {/* Mode toggle */}
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => setInsight(false)}
          className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest transition-colors ${
            !insight ? 'bg-[#4648d4] text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
        >
          Progress note
        </button>
        <button
          onClick={() => setInsight(true)}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[9px]
            uppercase tracking-widest transition-colors ${
            insight ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
          }`}
          aria-label="insight"
        >
          <Lightbulb size={9} />
          Key insight
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(); }}
        rows={3}
        placeholder={insight
          ? 'Key insight, quote, or takeaway from this resource… (Ctrl+Enter)'
          : 'Progress note, reading status, or observation… (Ctrl+Enter)'
        }
        className={`w-full resize-none rounded-lg border px-3 py-2 text-sm text-gray-800
          outline-none transition-colors ${
          insight
            ? 'border-amber-200 bg-white focus:border-amber-400'
            : 'border-gray-200 bg-white focus:border-[#4648d4]'
        } placeholder:text-gray-300`}
      />

      <div className="mt-2 flex justify-end">
        <button
          onClick={submit}
          disabled={empty || busy}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-[10px]
            font-bold uppercase tracking-widest text-white transition-opacity
            hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
            insight ? 'bg-amber-500' : 'bg-[#4648d4]'
          }`}
          aria-label={insight ? 'save insight' : 'Log'}
        >
          <Plus size={11} />
          {busy ? 'Saving…' : insight ? 'Save insight' : 'Log'}
        </button>
      </div>
    </div>
  );
}
