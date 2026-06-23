import { motion } from 'motion/react';
import { useAppStore } from '../store/useAppStore';

export function ConfirmModal() {
  const { confirmOpen, confirmMessage, confirmOnOk, closeConfirm } = useAppStore();
  if (!confirmOpen) return null;

  const handleOk = () => {
    confirmOnOk?.();
    closeConfirm();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-sm w-full p-6"
      >
        <p className="text-sm font-semibold text-gray-800 leading-relaxed mb-6">{confirmMessage}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={closeConfirm}
            className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-[#f8f9fa] hover:bg-gray-100 text-gray-500 font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleOk}
            className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-black text-white font-bold hover:opacity-90"
          >
            Confirm
          </button>
        </div>
      </motion.div>
    </div>
  );
}
