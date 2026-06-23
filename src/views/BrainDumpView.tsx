import { useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Plus, Trash2, Sparkles, CheckCircle2, FileText, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppStore } from '../store/useAppStore';
import { ClassificationPopup } from '../modals/ClassificationPopup';
import { NeedsImplementationBadge } from '../components/NeedsImplementationBadge';
import { db } from '../db/db';
import { updateNoteContent, deleteNote, applyNoteSuggestedAction, ignoreNoteSuggestedAction } from '../db/queries/notes';
import { createTask } from '../db/queries/tasks';
import { parseExtractedTasks, parseRelevantDocs } from '../db/schema';

// ─── TipTap editor ────────────────────────────────────────────────────────────
function NoteEditor() {
  const { activeNoteId, setActiveNoteId, triggerOOPopup, openNewGoalModal, triggerToast, showConfirm } = useAppStore();

  const notes      = useLiveQuery(() => db.notes.orderBy('created_at').reverse().toArray()) ?? [];
  const activeNote = useLiveQuery(() => activeNoteId ? db.notes.get(activeNoteId) : undefined, [activeNoteId]);

  const [selectedSnippet, setSelectedSnippet] = useState<string | null>(null);
  const suppressOORef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Tap here to document trace lines. Amina OS parses tasks, context milestones, and resource connections dynamically…',
        emptyEditorClass: 'before:content-[attr(data-placeholder)] before:text-gray-300 before:float-left before:h-0 before:pointer-events-none',
      }),
    ],
    content: activeNote?.content ?? '',
    editorProps: {
      attributes: {
        class: 'w-full min-h-[250px] outline-none text-sm text-gray-800 leading-relaxed font-sans focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => {
      if (suppressOORef.current) return;
      const text = editor.getText();
      if (activeNote?.id) updateNoteContent(activeNote.id, text);

      const lines = text.split('\n');
      const lastLine = lines[lines.length - 1].trim();
      if (lastLine === 'OO') {
        const context = lines.slice(0, -1).join('\n').trim();
        if (context.length > 5) {
          suppressOORef.current = true;
          triggerOOPopup(context.slice(-200));
          setTimeout(() => { suppressOORef.current = false; }, 500);
        }
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (to > from) {
        const text = editor.state.doc.textBetween(from, to, ' ');
        setSelectedSnippet(text.length >= 4 ? text : null);
      } else {
        setSelectedSnippet(null);
      }
    },
  }, [activeNote?.id]);

  if (editor && activeNote && editor.getText() !== activeNote.content && !editor.isFocused) {
    editor.commands.setContent(activeNote.content ?? '');
  }

  const handleDelete = () => {
    if (!activeNote) return;
    showConfirm('Delete this thought trace?', async () => {
      await deleteNote(activeNote.id);
      const remaining = notes.filter(n => n.id !== activeNote.id);
      if (remaining[0]) setActiveNoteId(remaining[0].id);
      triggerToast('Thought trace discarded.', 'info');
    });
  };

  const handleApply = async () => {
    if (!activeNote?.suggested_action_text) return;

    const activeGoals = await db.goals.filter(g => !g.archived_at).sortBy('created_at');
    const targetGoal = activeGoals[0];
    if (!targetGoal) {
      triggerToast('No active goals to link this task to.', 'error');
      return;
    }

    await applyNoteSuggestedAction(activeNote.id, targetGoal.id);

    const existing = await db.tasks
      .filter(t => t.goal_id === targetGoal.id && t.title === activeNote.suggested_action_text)
      .first();

    if (!existing) {
      await createTask({
        goal_id: targetGoal.id, parent_task_id: null,
        title: activeNote.suggested_action_text!,
        description: `Extracted from note: ${activeNote.title}`,
        status: 'todo', priority: 'medium', kind: 'ai_generated',
        critical_path_status: null, tags_json: '[]', due_date: null,
        estimated_duration: 'Est. 1 hr', estimated_minutes: null, completed: false, position: 999,
      });
    }

    triggerToast(`Task linked to "${targetGoal.title}"!`, 'success');
  };

  const handleIgnore = async () => {
    if (!activeNote) return;
    await ignoreNoteSuggestedAction(activeNote.id);
    triggerToast('Suggested action archived.', 'info');
  };

  if (!activeNote) return null;

  return (
    <div className="lg:col-span-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col h-full min-h-[450px]">
      <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3">
        <div>
          <span className="font-mono text-[10px] text-[#4648d4] font-bold tracking-wide uppercase bg-[#EEF2FF] px-2 py-0.5 rounded">
            Neural Log Entry
          </span>
          <h2 className="font-headline text-xl font-bold text-black mt-1.5">{activeNote.title}</h2>
          <p className="font-mono text-[10px] text-gray-400 mt-1">{activeNote.date_str}</p>
        </div>
        <button onClick={handleDelete} className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded text-gray-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 flex flex-col relative">
        <EditorContent editor={editor} className="flex-1" />

        <AnimatePresence>
          {activeNote.suggested_action_text &&
            !activeNote.suggested_action_applied &&
            !activeNote.suggested_action_ignored && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                className="mt-4 p-4 rounded-xl bg-white border border-[#6063ee]/30 shadow-lg relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-[#6063ee]" />
                <div className="flex items-center gap-1.5 text-[#4648d4] text-[10px] font-mono uppercase tracking-wider font-bold mb-2">
                  <Sparkles size={11} />
                  <span>Suggested Action</span>
                  <NeedsImplementationBadge className="ml-auto" />
                </div>
                <p className="text-xs text-gray-800 font-semibold mb-3">{activeNote.suggested_action_text}</p>
                <div className="flex gap-2">
                  <button onClick={handleApply} className="bg-black text-white text-[10px] font-mono uppercase py-1.5 px-3.5 rounded-lg font-bold hover:bg-opacity-90 active:scale-95 transition-all">
                    Apply
                  </button>
                  <button onClick={handleIgnore} className="bg-[#f3f4f5] hover:bg-gray-100 text-gray-500 text-[10px] font-mono uppercase py-1.5 px-3.5 rounded-lg active:scale-95 transition-all">
                    Ignore
                  </button>
                </div>
              </motion.div>
            )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedSnippet && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="absolute bottom-2 left-2 bg-black text-white p-2 rounded-lg text-[10px] font-mono shadow-md flex items-center gap-2"
            >
              <Sparkles size={10} className="text-yellow-400" />
              <span>Create goal action from Selection?</span>
              <button
                onClick={() => { openNewGoalModal(`Action: ${selectedSnippet.slice(0, 60)}`); setSelectedSnippet(null); }}
                className="bg-[#6063ee] text-white px-2 py-0.5 rounded leading-tight hover:opacity-90"
              >
                Kickstart Goal
              </button>
              <button onClick={() => setSelectedSnippet(null)} className="text-gray-400 hover:text-white">
                <X size={10} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Context Rail ─────────────────────────────────────────────────────────────
function ContextRail() {
  const { activeNoteId } = useAppStore();
  const activeNote = useLiveQuery(() => activeNoteId ? db.notes.get(activeNoteId) : undefined, [activeNoteId]);

  const extractedTasks = parseExtractedTasks(activeNote?.extracted_tasks_json ?? '[]');
  const relevantDocs   = parseRelevantDocs(activeNote?.relevant_docs_json ?? '[]');

  return (
    <div className="lg:col-span-3 flex flex-col gap-4">
      <div className="bg-[#f8f9fa] rounded-xl p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-black font-mono text-[10px] uppercase tracking-wider font-bold mb-4">
          <Sparkles size={13} className="text-[#6063ee]" />
          <span>Context &amp; Insights</span>
          <NeedsImplementationBadge className="ml-auto" />
        </div>

        <div className="mb-4">
          <span className="font-mono text-[9px] text-gray-400 uppercase tracking-widest block mb-2">Parsed Tasks</span>
          {extractedTasks.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No tasks extracted yet.</p>
          ) : (
            <div className="space-y-2">
              {extractedTasks.map((t, i) => (
                <div key={i} className="bg-white rounded-xl p-3 border border-gray-200/60 shadow-sm flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs text-gray-800 font-semibold">
                    <CheckCircle2 size={13} className="text-[#6063ee] shrink-0" />
                    <span>{t.text}</span>
                  </div>
                  <span className="text-[9px] font-mono text-red-500 bg-red-50 border border-red-100 py-0.5 px-1.5 rounded w-max">{t.due}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="font-mono text-[9px] text-gray-400 uppercase tracking-widest block mb-2 font-semibold">Associated Assets</span>
          {relevantDocs.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No files referenced.</p>
          ) : (
            <div className="space-y-2">
              {relevantDocs.map((doc, i) => (
                <div key={i} className="bg-white rounded-xl p-3 border border-gray-200/60 shadow-sm flex items-center gap-3">
                  <FileText size={16} className="text-gray-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-800 font-semibold truncate leading-tight">{doc.title}</p>
                    <p className="text-[9px] font-mono text-gray-400 truncate mt-1">{doc.edited}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-[#EEF2FF] rounded-xl p-4 border border-[#4648d4]/10 text-xs">
        <p className="font-bold text-[#4648d4] mb-1 flex items-center gap-2">
          <span>Amina Mind-Link Helper</span>
          <NeedsImplementationBadge />
        </p>
        <p className="text-gray-600 leading-normal">
          Type <strong>OO</strong> at the end of a line to classify your thought. Select text to instantly map it to a goal.
        </p>
      </div>
    </div>
  );
}

// ─── Main BrainDump View ─────────────────────────────────────────────────────
export function BrainDumpView() {
  const { activeNoteId, setActiveNoteId, openNewNoteModal, isOOPopupOpen } = useAppStore();
  const notes = useLiveQuery(() => db.notes.orderBy('created_at').reverse().toArray()) ?? [];

  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-10 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
      <div className="lg:col-span-3 flex flex-col gap-3">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[10px] text-gray-400 uppercase tracking-widest">Thought Traces</span>
          <button onClick={openNewNoteModal} className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors">
            <Plus size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveNoteId(n.id)}
              className={`text-left p-3 rounded-xl border transition-all ${
                n.id === activeNoteId ? 'bg-white border-black shadow-card' : 'bg-[#f8f9fa] hover:bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 text-[9px] font-mono text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6063ee]" />
                <span>{n.date_str.split(' • ')[0]}</span>
              </div>
              <p className="text-xs font-bold text-gray-900 truncate">{n.title}</p>
              <p className="text-[10px] text-gray-500 line-clamp-2 mt-1">{n.content}</p>
            </button>
          ))}
        </div>
      </div>

      <NoteEditor />
      <ContextRail />

      {isOOPopupOpen && <ClassificationPopup />}
    </div>
  );
}
