import { useAppStore } from '../store/useAppStore';
import { resetAndSeed } from '../db/seed';

export function SettingsView() {
  const { triggerToast, showConfirm } = useAppStore();

  const handleReset = () => {
    showConfirm('Reset all data to defaults? This will overwrite your custom items.', async () => {
      await resetAndSeed();
      triggerToast('All default copilot assets successfully restored!', 'info');
    });
  };

  return (
    <div className="max-w-[700px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
      <div className="mb-8 border-b border-gray-100 pb-4">
        <h2 className="font-headline text-2xl font-black text-black mb-1">Amina OS Preferences</h2>
        <p className="text-sm text-gray-500">
          Configure personal co-pilot workspace triggers, prompt models, and storage.
        </p>
      </div>

      <div className="space-y-6">
        {/* Copilot Metadata */}
        <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black mb-3">Copilot Metadata</h3>
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-full border overflow-hidden shrink-0">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC77RLeDDakGJQ4MP9wYcxIvZx0LhA3x49A5xlJOg4S4uEo34dcUMSBQVhKcZBFlyy4DyGXswu_nmLlGrM96KKrsDwJqdiwgn3Fq-1eo360fT94FzZEXJWyGw3kA5xy1tcXh-Gg4OaNLhI4M59l6zGRFM5KFSYJoyowOybjI-zdIKlvmZsMT3OpWwBsr7ftzsvCJZ2rsyvmpgtTinuxohWed8GXUyi1k1-OEHrRZdXUVXtQTu_RRoElUV-UE_b0WSUfslNnagddlw"
                alt="Amina AI"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Amina DeepMind AI Engine</p>
              <p className="text-xs text-gray-400 mt-1">Status: Nominal (v3.0 + Dexie DB) | Latency: 13ms</p>
              <button
                onClick={() => triggerToast('Amina self-diagnosis complete. Focus indexes optimized.', 'success')}
                className="text-[10px] font-mono uppercase bg-black hover:opacity-90 text-white font-bold py-1 px-2.5 rounded mt-3.5"
              >
                Diagnose Engine
              </button>
            </div>
          </div>
        </div>

        {/* Diagnostic Tools */}
        <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-black mb-3">Diagnostic Tools</h3>
          <div className="p-3 bg-[#f8f9fa] rounded-lg flex items-center justify-between text-xs">
            <div>
              <p className="font-bold text-gray-700">Reset IndexedDB</p>
              <p className="text-gray-400 mt-0.5">
                Clears all Dexie tables (goals, tasks, notes, resources, events, edges) and re-seeds defaults.
              </p>
            </div>
            <button
              onClick={handleReset}
              className="text-[10px] font-mono uppercase bg-[#EF4444] hover:opacity-90 text-white font-bold py-1 px-3.5 rounded shrink-0 ml-4"
            >
              Factory Refactor
            </button>
          </div>
        </div>

        {/* Tech Stack */}
        <div className="bg-[#EEF2FF] border border-[#4648d4]/10 p-5 rounded-xl">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#4648d4] mb-3">Tech Stack</h3>
          <div className="space-y-2 text-xs text-gray-600">
            {[
              ['UI',        'React 19 + Vite 6 + TypeScript'],
              ['Styling',   'Tailwind CSS v4'],
              ['State',     'Zustand 5 (UI state only)'],
              ['Database',  'Dexie.js v4 (IndexedDB) — graph-ready schema'],
              ['Editor',    'TipTap (StarterKit + Placeholder)'],
              ['Animations','Framer Motion (motion/react)'],
              ['Icons',     'Lucide React'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-[#4648d4] font-bold w-24 shrink-0">{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
