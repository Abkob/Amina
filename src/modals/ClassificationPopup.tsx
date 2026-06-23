import { Sparkles, X, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppStore } from '../store/useAppStore';
import { db } from '../db/db';
import { linkNoteToGoal } from '../db/queries/notes';

function scoreGoal(goalTitle: string, goalCategory: string, contextText: string): number {
  const context = contextText.toLowerCase();
  const words = (goalTitle + ' ' + goalCategory).toLowerCase().split(/\s+/);
  const hits = words.filter((w) => w.length > 3 && context.includes(w)).length;
  return Math.min(99, 30 + hits * 18 + Math.round(Math.random() * 12));
}

export function ClassificationPopup() {
  const { ooContextText, activeNoteId, closeOOPopup, openNewGoalModal, triggerToast } = useAppStore();
  const goals = useLiveQuery(() => db.goals.toArray()) ?? [];

  const ranked = goals
    .map((g) => ({ ...g, confidence: scoreGoal(g.title, g.category, ooContextText) }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  const handleConfirm = async (goalId: string, goalTitle: string, confidence: number) => {
    if (activeNoteId) {
      await linkNoteToGoal(activeNoteId, goalId, confidence);
    }
    triggerToast(`Thought classified → "${goalTitle}"`, 'success');
    closeOOPopup();
  };

  const snippet = ooContextText.slice(-120);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-end justify-center pb-10 px-4 md:items-center md:pb-0">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-auto w-full max-w-md bg-white/90 backdrop-blur-xl border border-gray-200 rounded-2xl shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[#4648d4]">
            <Sparkles size={16} className="animate-pulse" />
            <span className="font-headline text-sm font-bold text-black uppercase tracking-wide">Classify Entry</span>
          </div>
          <button onClick={closeOOPopup} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X size={14} /></button>
        </div>

        <div className="bg-[#EEF2FF] rounded-lg p-3 mb-4 border border-[#4648d4]/10">
          <p className="font-mono text-[10px] text-[#4648d4] uppercase tracking-wider mb-1 font-bold">Detected Context</p>
          <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">…{snippet}</p>
        </div>

        <p className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-2 font-bold">Suggested Goals</p>
        <div className="space-y-2 mb-4">
          {ranked.map((g) => (
            <button
              key={g.id}
              onClick={() => handleConfirm(g.id, g.title, g.confidence)}
              className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl hover:border-[#6063ee]/40 hover:bg-[#EEF2FF]/40 transition-all group text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-gray-900 truncate">{g.title}</p>
                <p className="text-[10px] font-mono text-gray-400 mt-0.5">{g.category}</p>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <span className="font-mono text-[11px] font-bold text-[#4648d4] bg-[#EEF2FF] px-1.5 py-0.5 rounded">{g.confidence}%</span>
                <ArrowRight size={12} className="text-gray-300 group-hover:text-[#4648d4] transition-colors" />
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { openNewGoalModal(ooContextText.split('\n')[0].slice(0, 60)); closeOOPopup(); }}
            className="flex-1 py-2 border border-gray-200 text-black bg-white rounded-lg text-[10px] font-mono uppercase hover:bg-gray-50 active:scale-95 transition-all"
          >
            Create New Goal
          </button>
          <button
            onClick={closeOOPopup}
            className="flex-1 py-2 bg-black text-white rounded-lg text-[10px] font-mono uppercase hover:opacity-90 active:scale-95 transition-all"
          >
            Dismiss
          </button>
        </div>
      </motion.div>
    </div>
  );
}
