import { ModalFrame } from './ModalFrame';
import { useAppStore } from '../store/useAppStore';

export function ConfirmModal() {
  const { confirmOpen, confirmMessage, confirmOnOk, closeConfirm } = useAppStore();
  if (!confirmOpen) return null;

  const handleOk = () => {
    confirmOnOk?.();
    closeConfirm();
  };

  return (
    <ModalFrame
      onClose={closeConfirm}
      titleId="confirm-modal-title"
      zClassName="z-[60]"
      overlayClassName="bg-black/50"
      className="bg-white rounded-xl border border-gray-200 shadow-2xl max-w-sm w-full p-6"
    >
      <h2 id="confirm-modal-title" className="sr-only">Confirm action</h2>
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
    </ModalFrame>
  );
}
