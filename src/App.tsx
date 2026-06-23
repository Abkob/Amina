import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { db } from './db/db';
import { syncGoalMetricsFromTasks } from './db/queries/tasks';
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

export default function App() {
  const {
    currentTab, selectedGoalId, focusedTaskId,
    setSelectedGoalId, setFocusedTaskId,
    newGoalModalOpen, newNoteModalOpen, newEventModalOpen, addResourceModalOpen,
    confirmOpen,
  } = useAppStore();

  useEffect(() => {
    let cancelled = false;

    db.goals.toArray()
      .then(async (goals) => {
        if (cancelled) return;
        await Promise.all(goals.map(goal => syncGoalMetricsFromTasks(goal.id)));
      })
      .catch(() => {
        // Non-blocking: views still compute live metrics from tasks.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedGoalId) return;
    let cancelled = false;

    db.goals.get(selectedGoalId)
      .then((goal) => {
        if (!cancelled && !goal) setSelectedGoalId(null);
      })
      .catch(() => {
        if (!cancelled) setSelectedGoalId(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGoalId, setSelectedGoalId]);

  useEffect(() => {
    if (!selectedGoalId || !focusedTaskId) return;
    let cancelled = false;

    db.tasks.get(focusedTaskId)
      .then((task) => {
        if (!cancelled && (!task || task.goal_id !== selectedGoalId)) setFocusedTaskId(null);
      })
      .catch(() => {
        if (!cancelled) setFocusedTaskId(null);
      });

    return () => {
      cancelled = true;
    };
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

      {/* Mobile bottom nav */}
      <MobileNav />

      {/* ─── Modals ─────────────────────────────────────────────────── */}
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
