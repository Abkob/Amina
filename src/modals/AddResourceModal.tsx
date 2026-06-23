import { useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { createResource, detectResourceType } from '../db/queries/resources';

export function AddResourceModal() {
  const { closeAddResourceModal, addResourceGoalId, triggerToast } = useAppStore();
  const [input, setInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) {
      triggerToast('Please provide a URL or filename', 'error');
      return;
    }
    if (!addResourceGoalId) return;

    const type = detectResourceType(input.trim());
    const isLink = input.startsWith('http://') || input.startsWith('https://');

    await createResource({
      title: isLink ? (type === 'figma' ? 'Figma Specs Component Link' : 'External Resource Link') : input.trim(),
      url:   isLink ? input.trim() : null,
      type,
      info:  'added just now',
    }, addResourceGoalId);

    triggerToast('Resource asset bound to goal hierarchy!', 'success');
    closeAddResourceModal();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white rounded-xl border border-gray-200 max-w-sm w-full p-6 shadow-2xl relative"
      >
        <button onClick={closeAddResourceModal} className="absolute top-4 right-4 text-gray-400 hover:text-black"><X size={16} /></button>
        <h3 className="font-headline text-base font-black text-gray-900 border-b border-gray-100 pb-2 mb-4">Attach Resource</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">URL or Filename</label>
            <input type="text" required placeholder="https://figma.com/file/… or spec.pdf" value={input} onChange={(e) => setInput(e.target.value)}
              className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none" autoFocus />
            <p className="text-[9px] font-mono text-gray-400 mt-1">
              Figma URLs auto-tagged • Any http link = external • Filename = document
            </p>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={closeAddResourceModal} className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-[#f8f9fa] hover:bg-gray-100 text-gray-500 font-semibold">Cancel</button>
            <button type="submit" className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-black text-white font-bold">Attach</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
