import { BookOpen, Target, Calendar, FolderOpen, Settings as SettingsIcon } from 'lucide-react';
import { useAppStore, type Tab } from '../store/useAppStore';

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: 'Brain Dump', label: 'Capture',   Icon: BookOpen },
  { id: 'Goals',      label: 'Goals',     Icon: Target },
  { id: 'Schedule',   label: 'Schedule',  Icon: Calendar },
  { id: 'Resources',  label: 'Resources', Icon: FolderOpen },
  { id: 'Settings',   label: 'Settings',  Icon: SettingsIcon },
];

export function MobileNav() {
  const { currentTab, setCurrentTab, setFocusedResourceId } = useAppStore();

  return (
    <nav className="bg-white/95 backdrop-blur-lg fixed bottom-0 w-full z-50 md:hidden rounded-t-2xl shadow-lg border-t border-gray-150 flex justify-around items-center px-4 py-2">
      {TABS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => { if (id === 'Resources') setFocusedResourceId(null); setCurrentTab(id); }}
          className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all active:scale-95 ${
            currentTab === id
              ? 'text-[#6063ee] bg-[#EEF2FF]'
              : 'text-gray-400'
          }`}
        >
          <Icon size={18} />
          <span className="font-mono text-[9px] uppercase tracking-wider mt-1.5 font-bold">{label}</span>
        </button>
      ))}
    </nav>
  );
}
