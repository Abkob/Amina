import { Search, RefreshCw, Zap, Bell, X, Sparkles, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { NeedsImplementationBadge } from './NeedsImplementationBadge';

export function Header() {
  const {
    currentTab, setCurrentTab,
    searchQuery, setSearchQuery,
    isNotificationOpen, setIsNotificationOpen,
    triggerToast,
  } = useAppStore();

  return (
    <>
      <header className="fixed top-0 right-0 left-0 md:left-[260px] h-16 z-40 bg-white/90 backdrop-blur-md hidden md:flex justify-between items-center px-6 border-b border-gray-100">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-headline text-lg font-black text-black tracking-tight">Amina</span>
            <div className="bg-[#EEF2FF] border border-[#c0c1ff]/40 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase text-[#4648d4] font-bold">
              OS 2.0
            </div>
          </div>
          <nav className="flex items-center gap-6">
            <button
              onClick={() => setCurrentTab('Brain Dump')}
              className={`font-mono text-xs uppercase tracking-wider pb-1 transition-all ${
                currentTab === 'Brain Dump'
                  ? 'text-black font-bold border-b-2 border-black'
                  : 'text-gray-400 hover:text-black'
              }`}
            >
              Focus
            </button>
            <button
              onClick={() => setCurrentTab('Goals')}
              className={`font-mono text-xs uppercase tracking-wider pb-1 transition-all ${
                ['Goals', 'Resources', 'Settings'].includes(currentTab)
                  ? 'text-black font-bold border-b-2 border-black'
                  : 'text-gray-400 hover:text-black'
              }`}
            >
              Reflect
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* Search */}
          <div className="relative group hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Filter mental map…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#f3f4f5] border-none rounded-full py-1.5 pl-9 pr-4 font-mono text-[11px] text-black placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 transition-all w-40 group-focus-within:w-56"
            />
          </div>

          <button
            onClick={() => {
              triggerToast('Synchronizing copilot assets with neural engines…', 'info');
              setTimeout(() => triggerToast('All notes, goals, and logs synchronized.', 'success'), 1000);
            }}
            className="font-mono text-[10px] uppercase tracking-wider text-black border border-gray-200 px-3.5 py-1.5 rounded-full hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <RefreshCw size={11} />
            <span>Sync AI</span>
            <NeedsImplementationBadge className="hidden xl:inline-flex" />
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => triggerToast('Amina OS Diagnostic logs nominal (latency: 14ms).', 'info')}
              className="text-gray-400 hover:text-black transition-colors flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100"
            >
              <Zap size={15} />
            </button>
            <NeedsImplementationBadge className="hidden xl:inline-flex" />
          </div>

          <button
            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            className="text-gray-400 hover:text-black transition-colors flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 relative"
          >
            <Bell size={15} />
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#EF4444] rounded-full border border-white animate-pulse" />
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-gray-100">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuC77RLeDDakGJQ4MP9wYcxIvZx0LhA3x49A5xlJOg4S4uEo34dcUMSBQVhKcZBFlyy4DyGXswu_nmLlGrM96KKrsDwJqdiwgn3Fq-1eo360fT94FzZEXJWyGw3kA5xy1tcXh-Gg4OaNLhI4M59l6zGRFM5KFSYJoyowOybjI-zdIKlvmZsMT3OpWwBsr7ftzsvCJZ2rsyvmpgtTinuxohWed8GXUyi1k1-OEHrRZdXUVXtQTu_RRoElUV-UE_b0WSUfslNnagddlw"
              alt="user"
              className="w-8 h-8 rounded-full border border-gray-100 object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </header>

      {/* Notification Panel */}
      {isNotificationOpen && (
        <div className="fixed top-16 right-4 w-72 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-gray-200 p-4 z-50 animate-fade-in text-xs">
          <div className="flex justify-between items-center gap-2 mb-3 text-black font-bold uppercase font-mono tracking-wider border-b border-gray-100 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span>Neural Notifications</span>
              <NeedsImplementationBadge />
            </div>
            <button onClick={() => setIsNotificationOpen(false)} className="text-gray-400 hover:text-black">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
            <div className="p-2 border border-[#6063ee]/15 rounded bg-[#EEF2FF] flex gap-2">
              <Sparkles size={14} className="text-[#4648d4] shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-black">"Finish Sensor Report" extracted</p>
                <p className="text-gray-500 mt-0.5">From Morning Thoughts note — waiting integration into Design System goal.</p>
              </div>
            </div>
            <div className="p-2 border border-red-100 bg-red-50/20 rounded flex gap-2">
              <AlertTriangle size={14} className="text-[#EF4444] shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="font-bold text-gray-800">Overdue milestone</p>
                <p className="text-gray-500 mt-0.5">"Migrate Personal Data to NAS" surpassed Aug 30 deadline.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
