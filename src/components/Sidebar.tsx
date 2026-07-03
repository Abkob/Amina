import { BookOpen, Target, FolderOpen, Settings as SettingsIcon, HelpCircle, Plus, BarChart2, Zap, ScrollText, Share2, Tags, CalendarDays, FlaskConical } from 'lucide-react';
import { useAppStore, type Tab } from '../store/useAppStore';

const NAV: { id: Tab; label: string; Icon: React.ElementType; highlight?: boolean }[] = [
  { id: 'Copilot',    label: 'Copilot',    Icon: Zap,          highlight: true },
  // Brain Dump + Journal are merged into one Capture destination (CaptureView
  // segmented switch); both Tab ids still work for deep links.
  { id: 'Brain Dump', label: 'Capture',    Icon: BookOpen },
  { id: 'Goals',      label: 'Goals',      Icon: Target },
  { id: 'Resources',  label: 'Resources',  Icon: FolderOpen },
  { id: 'Gantt',      label: 'Gantt',      Icon: BarChart2 },
  { id: 'Graph',      label: 'Graph',      Icon: Share2 },
  { id: 'Topics',     label: 'Topics',     Icon: Tags },
  { id: 'Schedule',   label: 'Schedule',   Icon: CalendarDays },
  { id: 'Settings',   label: 'Settings',   Icon: SettingsIcon },
  { id: 'Testing',    label: 'Testing',    Icon: FlaskConical },
];

export function Sidebar() {
  const { currentTab, setCurrentTab, setFocusedResourceId, openNewGoalModal, openNewNoteModal } = useAppStore();

  const handleNew = () => {
    if (currentTab === 'Goals') openNewGoalModal();
    else openNewNoteModal();
  };

  const newLabel = currentTab === 'Goals' ? 'New Goal' : 'New Thought';

  return (
    <nav className="bg-sidebar-bg h-screen w-[260px] fixed left-0 top-0 flex flex-col p-4 hidden md:flex z-50">
      <div className="mb-6 px-1 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6063ee] to-purple-800 flex items-center justify-center text-white font-headline font-bold text-lg">M</div>
        <div>
          <h1 className="font-headline text-lg font-bold text-white tracking-tight leading-tight">Marina OS</h1>
          <p className="font-mono text-[10px] text-gray-400 uppercase tracking-widest">Personal Copilot</p>
        </div>
      </div>

      <button
        onClick={handleNew}
        className="w-full bg-white text-[#111827] font-sans font-semibold text-xs py-2.5 rounded-lg mb-6 flex items-center justify-center gap-2 hover:bg-gray-100 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
      >
        <Plus size={15} />
        <span>{newLabel}</span>
      </button>

      <div className="flex-1 flex flex-col gap-1.5">
        {NAV.map(({ id, label, Icon, highlight }) => (
          <button
            key={id}
            onClick={() => { if (id === 'Resources') setFocusedResourceId(null); setCurrentTab(id); }}
            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all duration-150 ${
              currentTab === id
                ? 'text-white bg-gray-800 font-bold border-l-4 border-[#6063ee]'
                : highlight
                  ? 'text-indigo-300 hover:bg-indigo-900/40 hover:text-indigo-100 border border-indigo-500/20 bg-indigo-500/5'
                  : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
            }`}
          >
            <Icon size={16} className={currentTab === id ? 'text-[#c0c1ff]' : highlight && currentTab !== id ? 'text-indigo-400' : ''} />
            <span>{label}</span>
            {highlight && currentTab !== id && (
              <span className="ml-auto text-[8px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold tracking-wider">AI</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1 mt-auto pt-4 border-t border-gray-800">
        <button
          onClick={() => setCurrentTab('Testing')}
          className="flex items-center gap-3 px-3 py-2 text-xs font-mono text-gray-400 hover:text-white transition-colors"
          title="Open the Testing workbench — live system status and pipeline diagnostics"
        >
          <HelpCircle size={15} />
          <span>Diagnostics</span>
        </button>
        <div className="flex items-center gap-2.5 px-3 py-2.5 mt-2 bg-gray-900/50 rounded-lg">
          <div className="w-7 h-7 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
            <span className="font-mono text-xs text-white font-bold">U</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-white truncate leading-tight">ab2.kobaissi</p>
            <p className="text-[9px] font-mono text-gray-500 truncate leading-tight">Premium User</p>
          </div>
        </div>
      </div>
    </nav>
  );
}
