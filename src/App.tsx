import { AnimatePresence, motion } from 'motion/react';
import { useAppStore } from './store/useAppStore';

// Layout
import { Sidebar }   from './components/Sidebar';
import { Header }    from './components/Header';
import { MobileNav } from './components/MobileNav';
import { Toast }     from './components/Toast';

// Views
import { BrainDumpView }    from './views/BrainDumpView';
import { GoalsDashboard }   from './views/GoalsDashboard';
import { GoalDetail }       from './views/GoalDetail';
import { ScheduleView }     from './views/ScheduleView';
import { ResourcesView }    from './views/ResourcesView';
import { SettingsView }     from './views/SettingsView';

// Modals
import { NewGoalWizard }    from './modals/NewGoalWizard';
import { NewNoteModal }     from './modals/NewNoteModal';
import { NewEventModal }    from './modals/NewEventModal';
import { AddResourceModal } from './modals/AddResourceModal';
import { ConfirmModal }     from './components/ConfirmModal';

export default function App() {
  const {
    currentTab, selectedGoalId,
    newGoalModalOpen, newNoteModalOpen, newEventModalOpen, addResourceModalOpen,
    confirmOpen,
  } = useAppStore();

  const renderContent = () => {
    if (currentTab === 'Brain Dump') return <BrainDumpView />;
    if (currentTab === 'Goals') {
      return selectedGoalId ? <GoalDetail /> : <GoalsDashboard />;
    }
    if (currentTab === 'Schedule')  return <ScheduleView />;
    if (currentTab === 'Resources') return <ResourcesView />;
    if (currentTab === 'Settings')  return <SettingsView />;
    return null;
  };

  return (
    <div className="bg-canvas-bg text-on-surface font-sans antialiased min-h-screen flex selection:bg-[#EEF2FF] selection:text-black">
      {/* Global overlays */}
      <Toast />

      {/* Sidebar (desktop) */}
      <Sidebar />

      {/* Header + notification panel (desktop) */}
      <Header />

      {/* Main content */}
      <main className="flex-1 w-full md:pl-[260px] pt-4 md:pt-[76px] pb-24 md:pb-8 min-h-screen overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab + (selectedGoalId ?? '')}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* ─── Modals ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {newGoalModalOpen     && <NewGoalModal />}
        {newNoteModalOpen     && <NewNoteModal />}
        {newEventModalOpen    && <NewEventModal />}
        {addResourceModalOpen && <AddResourceModal />}
        {confirmOpen          && <ConfirmModal />}
      </AnimatePresence>
    </div>
  );
}
