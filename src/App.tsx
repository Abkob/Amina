import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
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
import { TaskFocusView }    from './views/TaskFocusView';
import { ScheduleView }     from './views/ScheduleView';
import { ResourcesView }    from './views/ResourcesView';
import { SettingsView }     from './views/SettingsView';

// Modals
import { NewGoalWizard }    from './modals/NewGoalWizard';
import { NewNoteModal }     from './modals/NewNoteModal';
import { NewEventModal }    from './modals/NewEventModal';
import { AddResourceModal } from './modals/AddResourceModal';
import { ConfirmModal }     from './components/ConfirmModal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      retry: 1,
    },
  },
});

function AppInner() {
  const {
    currentTab, selectedGoalId, focusedTaskId,
    setSelectedGoalId, setFocusedTaskId,
    newGoalModalOpen, newNoteModalOpen, newEventModalOpen, addResourceModalOpen,
    confirmOpen,
  } = useAppStore();

  // Validate that persisted selectedGoalId still exists
  useEffect(() => {
    if (!selectedGoalId) return;
    let cancelled = false;
    fetch(`/api/goals/${selectedGoalId}`)
      .then(r => { if (!cancelled && r.status === 404) setSelectedGoalId(null); })
      .catch(() => { if (!cancelled) setSelectedGoalId(null); });
    return () => { cancelled = true; };
  }, [selectedGoalId, setSelectedGoalId]);

  // Validate that persisted focusedTaskId still exists and belongs to the selected goal
  useEffect(() => {
    if (!selectedGoalId || !focusedTaskId) return;
    let cancelled = false;
    fetch(`/api/tasks/${focusedTaskId}`)
      .then(r => r.json())
      .then((task) => { if (!cancelled && (!task || task.goal_id !== selectedGoalId)) setFocusedTaskId(null); })
      .catch(() => { if (!cancelled) setFocusedTaskId(null); });
    return () => { cancelled = true; };
  }, [selectedGoalId, focusedTaskId, setFocusedTaskId]);

  const renderContent = () => {
    if (currentTab === 'Brain Dump') return <BrainDumpView />;
    if (currentTab === 'Goals') {
      if (!selectedGoalId) return <GoalsDashboard />;
      return focusedTaskId ? <TaskFocusView /> : <GoalDetail />;
    }
    if (currentTab === 'Schedule')  return <ScheduleView />;
    if (currentTab === 'Resources') return <ResourcesView />;
    if (currentTab === 'Settings')  return <SettingsView />;
    return null;
  };

  return (
    <div className="bg-canvas-bg text-on-surface font-sans antialiased min-h-screen flex selection:bg-[#EEF2FF] selection:text-black">
      <Toast />
      <Sidebar />
      <Header />
      <main className="flex-1 w-full md:pl-[260px] pt-4 md:pt-[76px] pb-24 md:pb-8 min-h-screen overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab + (selectedGoalId ?? '') + (focusedTaskId ?? '')}
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
      <MobileNav />
      <AnimatePresence>
        {newGoalModalOpen     && <NewGoalWizard />}
        {newNoteModalOpen     && <NewNoteModal />}
        {newEventModalOpen    && <NewEventModal />}
        {addResourceModalOpen && <AddResourceModal />}
        {confirmOpen          && <ConfirmModal />}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
