import { useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  FlaskConical,
  FolderOpen,
  MoreHorizontal,
  Settings as SettingsIcon,
  Share2,
  Tags,
  Target,
  Timer,
  Zap,
  FileText,
  GanttChart,
  Gauge,
} from 'lucide-react';
import { useAppStore, type Tab } from '../store/useAppStore';

const PRIMARY_TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'Copilot', label: 'Copilot', Icon: Zap },
  { id: 'Brain Dump', label: 'Capture', Icon: BookOpen },
  { id: 'Goals', label: 'Goals', Icon: Target },
  { id: 'Work', label: 'Work', Icon: Timer },
  { id: 'Schedule', label: 'Schedule', Icon: CalendarDays },
];

const MORE_TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'Resources', label: 'Resources', Icon: FolderOpen },
  { id: 'Graph', label: 'Graph', Icon: Share2 },
  { id: 'Topics', label: 'Topics', Icon: Tags },
  { id: 'Journal', label: 'Journal', Icon: FileText },
  { id: 'Gantt', label: 'Gantt', Icon: GanttChart },
  { id: 'Usage', label: 'Usage Manager', Icon: Gauge },
  { id: 'Testing', label: 'Testing', Icon: FlaskConical },
  { id: 'Settings', label: 'Settings', Icon: SettingsIcon },
];

export function MobileNav() {
  const { currentTab, setCurrentTab, setFocusedResourceId } = useAppStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_TABS.some(tab => tab.id === currentTab);

  const go = (id: Tab) => {
    if (id === 'Resources') setFocusedResourceId(null);
    setCurrentTab(id);
    setMoreOpen(false);
  };

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-x-3 bottom-[76px] z-50 rounded-2xl border border-gray-200 bg-white/98 p-2 shadow-2xl backdrop-blur-lg md:hidden">
          <div className="grid grid-cols-2 gap-1">
            {MORE_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-left transition-all active:scale-95 ${
                  currentTab === id ? 'bg-[#EEF2FF] text-[#6063ee]' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 z-50 flex w-full items-center justify-around rounded-t-2xl border-t border-gray-150 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-lg md:hidden">
        {PRIMARY_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => go(id)}
            aria-label={`Open ${label}`}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl p-2 transition-all active:scale-95 ${
              currentTab === id
                ? 'bg-[#EEF2FF] text-[#6063ee]'
                : 'text-gray-400'
            }`}
          >
            <Icon size={18} />
            <span className="mt-1.5 max-w-full truncate font-mono text-[8px] font-bold uppercase tracking-wider">{label}</span>
          </button>
        ))}
        <button
          onClick={() => setMoreOpen(open => !open)}
          aria-label="Open more pages"
          aria-expanded={moreOpen}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl p-2 transition-all active:scale-95 ${
            moreActive || moreOpen ? 'bg-[#EEF2FF] text-[#6063ee]' : 'text-gray-400'
          }`}
        >
          <MoreHorizontal size={18} />
          <span className="mt-1.5 max-w-full truncate font-mono text-[8px] font-bold uppercase tracking-wider">More</span>
        </button>
      </nav>
    </>
  );
}
