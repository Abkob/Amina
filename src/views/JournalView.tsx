import { useState } from 'react';
import { ChevronDown, ChevronRight, Circle, RefreshCw, Trash2 } from 'lucide-react';
import { useJournalEntries, useJournalLinks, useInvalidate, type DBJournalEntry, type DBJournalLink } from '../api/hooks';
import { useAppStore } from '../store/useAppStore';
import { apiFetch, apiPost } from '../utils/apiFetch';
import { ProposalsPanel } from '../components/ProposalsPanel';

const MOOD_EMOJI: Record<string, string> = {
  great: '😄', good: '🙂', neutral: '😐', bad: '😕', terrible: '😞',
};

function StatusDot({ status }: { status: DBJournalEntry['ingestion_status'] }) {
  const color =
    status === 'processed'    ? 'bg-green-400' :
    status === 'failed' || status === 'needs_review' ? 'bg-red-400' :
    'bg-amber-400 animate-pulse';
  const label =
    status === 'processed'   ? 'Processed' :
    status === 'failed'      ? 'Failed' :
    status === 'needs_review' ? 'Needs review' :
    'Processing…';
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">{label}</span>
    </span>
  );
}

function EntryLinks({ entryId }: { entryId: string }) {
  const { data: links } = useJournalLinks(entryId);
  if (!links?.length) return <p className="text-xs text-gray-500 italic">No linked entities detected.</p>;
  return (
    <table className="w-full text-[11px] font-mono border-collapse mt-1">
      <thead>
        <tr className="text-gray-500 text-left">
          <th className="pb-1 pr-3 font-normal">Type</th>
          <th className="pb-1 pr-3 font-normal">Entity</th>
          <th className="pb-1 pr-3 font-normal">Relationship</th>
          <th className="pb-1 font-normal">Confidence</th>
        </tr>
      </thead>
      <tbody>
        {(links as DBJournalLink[]).map(l => (
          <tr key={l.id} className="border-t border-gray-800">
            <td className="py-1 pr-3 text-indigo-300">{l.target_type}</td>
            <td className="py-1 pr-3 text-gray-300 truncate max-w-[180px]">
              {l.target_title ?? `${l.target_id.slice(0, 8)}…`}
            </td>
            <td className="py-1 pr-3 text-gray-400">{l.relationship}</td>
            <td className="py-1 text-gray-400">{(l.confidence * 100).toFixed(0)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EntryCard({ entry }: { entry: DBJournalEntry }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidate();
  const { triggerToast } = useAppStore();

  const snippet = entry.summary ?? entry.raw_text.slice(0, 150);
  const mood = entry.mood ? (MOOD_EMOJI[entry.mood] ?? entry.mood) : null;
  const isTerminalError = entry.ingestion_status === 'failed' || entry.ingestion_status === 'needs_review';

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/journal/${entry.id}/ingest`, { method: 'POST' });
      invalidate.journal();
      triggerToast('Retrying AI ingestion…', 'success');
    } catch {
      triggerToast('Retry failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy || !confirm('Delete this journal entry? This will remove all linked facts and work sessions.')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/journal/${entry.id}`, { method: 'DELETE' });
      invalidate.journal();
      triggerToast('Entry deleted', 'success');
    } catch {
      triggerToast('Delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-900/30 transition-colors"
      >
        <span className="mt-0.5 text-gray-600 shrink-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono font-bold text-white">{entry.entry_date}</span>
            {mood && <span className="text-base leading-none">{mood}</span>}
            <StatusDot status={entry.ingestion_status} />
          </div>
          <p className="text-sm text-gray-400 leading-relaxed line-clamp-2">{snippet}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
          {isTerminalError && (
            <button
              onClick={handleRetry}
              disabled={busy}
              title="Retry AI ingestion"
              className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-400/10 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={busy}
            title="Delete entry"
            className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-40"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-4">
          <div>
            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1.5">Raw Entry</p>
            <pre className="font-mono text-xs text-gray-300 bg-gray-900/60 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">{entry.raw_text}</pre>
          </div>

          {entry.summary && (
            <div>
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1.5">AI Summary</p>
              <p className="text-sm text-gray-300 leading-relaxed">{entry.summary}</p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-mono text-gray-500 uppercase tracking-wider mb-1.5">Linked Entities</p>
            <EntryLinks entryId={entry.id} />
          </div>
        </div>
      )}
    </div>
  );
}

export function JournalView() {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { data: entries, isLoading } = useJournalEntries();
  const invalidate = useInvalidate();
  const { triggerToast } = useAppStore();

  const handleSubmit = async () => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await apiPost('/api/journal', { raw_text: text.trim(), entry_date: today });
      setText('');
      invalidate.journal();
      triggerToast('Journal entry saved — AI is processing…', 'success');
    } catch (err) {
      triggerToast(`Failed to save: ${String(err)}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold text-white mb-1">Journal</h1>
        <p className="text-sm text-gray-500">Write what you worked on — the AI extracts tasks, facts, and links automatically.</p>
      </div>

      {/* Composer */}
      <div className="bg-surface rounded-xl border border-gray-700 p-4 space-y-3">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What did you work on today? (e.g. 'Spent 45 minutes on the ECG paper draft…')"
          rows={4}
          className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-600 resize-none outline-none leading-relaxed"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-gray-600">Cmd+Enter to submit</span>
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || submitting}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {submitting ? 'Saving…' : 'Save Entry'}
          </button>
        </div>
      </div>

      {/* AI Proposals */}
      <ProposalsPanel />

      {/* Entry list */}
      <div className="space-y-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-surface rounded-xl border border-gray-800 animate-pulse" />
          ))
        ) : !entries?.length ? (
          <div className="text-center py-16 text-gray-600">
            <Circle size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No journal entries yet. Write your first one above.</p>
          </div>
        ) : (
          entries.map(entry => <EntryCard key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
