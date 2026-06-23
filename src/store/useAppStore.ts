import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Tab = 'Brain Dump' | 'Goals' | 'Schedule' | 'Resources' | 'Settings';

export interface ToastMsg {
  id: number;
  text: string;
  type: 'success' | 'info' | 'error';
}

interface AppStore {
  // ─── Navigation (persisted) ───────────────────────────────────────────────
  currentTab:      Tab;
  selectedGoalId:  string | null;
  activeNoteId:    string;
  goalsFilter:     'Active' | 'Completed';
  searchQuery:     string;

  // ─── Schedule UI (persisted) ──────────────────────────────────────────────
  selectedEventId: string | null;
  isDrawerOpen:    boolean;

  // ─── Ephemeral UI ─────────────────────────────────────────────────────────
  isOptimizing:    boolean;
  toast:           ToastMsg | null;
  isNotificationOpen: boolean;

  // ─── Modals ───────────────────────────────────────────────────────────────
  newGoalModalOpen:     boolean;
  newNoteModalOpen:     boolean;
  newEventModalOpen:    boolean;
  addResourceModalOpen: boolean;
  addResourceGoalId:    string | null;
  goalTitlePrefill:     string;

  // ─── Brain Dump OO trigger ────────────────────────────────────────────────
  isOOPopupOpen: boolean;
  ooContextText: string;

  // ─── Setters ──────────────────────────────────────────────────────────────
  setCurrentTab:        (tab: Tab) => void;
  setSelectedGoalId:    (id: string | null) => void;
  setActiveNoteId:      (id: string) => void;
  setGoalsFilter:       (f: 'Active' | 'Completed') => void;
  setSearchQuery:       (q: string) => void;
  setSelectedEventId:   (id: string | null) => void;
  setIsDrawerOpen:      (open: boolean) => void;
  setIsOptimizing:      (v: boolean) => void;
  setIsNotificationOpen:(open: boolean) => void;

  // ─── Toast ────────────────────────────────────────────────────────────────
  triggerToast: (text: string, type?: ToastMsg['type']) => void;
  clearToast:   () => void;

  // ─── Modal controls ───────────────────────────────────────────────────────
  openNewGoalModal:     (titlePrefill?: string) => void;
  closeNewGoalModal:    () => void;
  openNewNoteModal:     () => void;
  closeNewNoteModal:    () => void;
  openNewEventModal:    () => void;
  closeNewEventModal:   () => void;
  openAddResourceModal: (goalId: string) => void;
  closeAddResourceModal:() => void;

  // ─── OO popup ─────────────────────────────────────────────────────────────
  triggerOOPopup: (contextText: string) => void;
  closeOOPopup:   () => void;

  // ─── Confirm dialog ───────────────────────────────────────────────────────
  confirmOpen:    boolean;
  confirmMessage: string;
  confirmOnOk:    (() => void) | null;
  showConfirm:    (message: string, onOk: () => void) => void;
  closeConfirm:   () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // ─── Initial UI state ────────────────────────────────────────────────
      currentTab:      'Goals',
      selectedGoalId:  null,
      activeNoteId:    'note-1',
      goalsFilter:     'Active',
      searchQuery:     '',

      selectedEventId: 'evt-1',
      isDrawerOpen:    true,

      isOptimizing:       false,
      toast:              null,
      isNotificationOpen: false,

      newGoalModalOpen:     false,
      newNoteModalOpen:     false,
      newEventModalOpen:    false,
      addResourceModalOpen: false,
      addResourceGoalId:    null,
      goalTitlePrefill:     '',

      isOOPopupOpen: false,
      ooContextText: '',

      confirmOpen:    false,
      confirmMessage: '',
      confirmOnOk:    null,

      // ─── Setters ──────────────────────────────────────────────────────────
      setCurrentTab:         (tab)  => set({ currentTab: tab, selectedGoalId: null }),
      setSelectedGoalId:     (id)   => set({ selectedGoalId: id }),
      setActiveNoteId:       (id)   => set({ activeNoteId: id }),
      setGoalsFilter:        (f)    => set({ goalsFilter: f }),
      setSearchQuery:        (q)    => set({ searchQuery: q }),
      setSelectedEventId:    (id)   => set({ selectedEventId: id }),
      setIsDrawerOpen:       (open) => set({ isDrawerOpen: open }),
      setIsOptimizing:       (v)    => set({ isOptimizing: v }),
      setIsNotificationOpen: (open) => set({ isNotificationOpen: open }),

      // ─── Toast ────────────────────────────────────────────────────────────
      triggerToast: (text, type = 'success') => {
        const id = Date.now();
        set({ toast: { id, text, type } });
        setTimeout(() => {
          set((s) => (s.toast?.id === id ? { toast: null } : {}));
        }, 4000);
      },
      clearToast: () => set({ toast: null }),

      // ─── Modal controls ───────────────────────────────────────────────────
      openNewGoalModal:      (titlePrefill = '') =>
        set({ newGoalModalOpen: true, goalTitlePrefill: titlePrefill }),
      closeNewGoalModal:     () => set({ newGoalModalOpen: false, goalTitlePrefill: '' }),
      openNewNoteModal:      () => set({ newNoteModalOpen: true }),
      closeNewNoteModal:     () => set({ newNoteModalOpen: false }),
      openNewEventModal:     () => set({ newEventModalOpen: true }),
      closeNewEventModal:    () => set({ newEventModalOpen: false }),
      openAddResourceModal:  (goalId) =>
        set({ addResourceModalOpen: true, addResourceGoalId: goalId }),
      closeAddResourceModal: () =>
        set({ addResourceModalOpen: false, addResourceGoalId: null }),

      // ─── OO popup ─────────────────────────────────────────────────────────
      triggerOOPopup: (contextText) => set({ isOOPopupOpen: true, ooContextText: contextText }),
      closeOOPopup:   ()            => set({ isOOPopupOpen: false, ooContextText: '' }),

      showConfirm:  (message, onOk) => set({ confirmOpen: true, confirmMessage: message, confirmOnOk: onOk }),
      closeConfirm: ()              => set({ confirmOpen: false, confirmMessage: '', confirmOnOk: null }),
    }),
    {
      name: 'amina-os-ui-v3',
      // Only persist navigation + schedule drawer state
      partialize: (state) => ({
        currentTab:      state.currentTab,
        activeNoteId:    state.activeNoteId,
        selectedGoalId:  state.selectedGoalId,
        selectedEventId: state.selectedEventId,
        isDrawerOpen:    state.isDrawerOpen,
        goalsFilter:     state.goalsFilter,
      }),
    }
  )
);
