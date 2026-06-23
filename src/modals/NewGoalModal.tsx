import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAppStore } from '../store/useAppStore';
import { createGoal } from '../db/queries/goals';
import { createTask } from '../db/queries/tasks';

export function NewGoalModal() {
  const { closeNewGoalModal, triggerToast, goalTitlePrefill, goalCategories } = useAppStore();
  const categoryOptions = goalCategories.length > 0 ? goalCategories : ['General'];

  const [title,    setTitle]    = useState(goalTitlePrefill);
  const [category, setCategory] = useState(categoryOptions[0]);
  const [quarter,  setQuarter]  = useState('');
  const [status,   setStatus]   = useState<'Safe' | 'Watch' | 'Risky'>('Safe');
  const [desc,     setDesc]     = useState('');

  useEffect(() => {
    const options = goalCategories.length > 0 ? goalCategories : ['General'];
    if (!options.includes(category)) setCategory(options[0]);
  }, [goalCategories, category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      triggerToast('Please provide a title for your goal', 'error');
      return;
    }

    const targetDeadline = quarter.trim() || null;
    const goalId = await createGoal({
      title:          title.trim(),
      description:    desc || (targetDeadline
        ? `Goal targeting ${targetDeadline}.`
        : 'Goal with finish estimated from tasks and subtasks.'),
      category,
      status,
      progress:       10,
      deadline:       targetDeadline,
      overdue:        false,
      activity_level: Math.floor(Math.random() * 3) + 2,
    });

    // Seed initial tasks
    await createTask({
      goal_id: goalId, parent_task_id: null,
      title: 'Initial strategy kickoff and scope definition.',
      description: '', status: 'todo', priority: 'high', kind: 'next_action',
      critical_path_status: null, tags_json: '[]', due_date: null,
      estimated_duration: null, completed: false, position: -1,
    });

    await createTask({
      goal_id: goalId, parent_task_id: null,
      title: 'Scoping & Architecture', description: 'Assess base dependencies and coordinate initial milestone list.',
      status: 'in_progress', priority: 'medium', kind: 'critical_path',
      critical_path_status: 'In Progress', tags_json: '[]', due_date: null,
      estimated_duration: null, completed: false, position: 0,
    });

    await createTask({
      goal_id: goalId, parent_task_id: null,
      title: 'Implementation', description: 'Execute the core milestones and refactor as needed.',
      status: 'todo', priority: 'medium', kind: 'critical_path',
      critical_path_status: 'Future', tags_json: '[]', due_date: null,
      estimated_duration: null, completed: false, position: 1,
    });

    await createTask({
      goal_id: goalId, parent_task_id: null,
      title: 'Formulate timeline tasks', description: '',
      status: 'todo', priority: 'medium', kind: 'ai_generated',
      critical_path_status: null, tags_json: '[]', due_date: null,
      estimated_duration: 'Est. 1 hr', completed: false, position: 0,
    });

    triggerToast(`Goal "${title.trim()}" created!`, 'success');
    closeNewGoalModal();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white rounded-xl border border-gray-200 max-w-md w-full p-6 shadow-2xl relative"
      >
        <button onClick={closeNewGoalModal} className="absolute top-4 right-4 text-gray-400 hover:text-black"><X size={16} /></button>
        <h3 className="font-headline text-lg font-black text-gray-900 border-b border-gray-100 pb-2 mb-4">Initialize Goal Trace</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Goal Name</label>
            <input type="text" required placeholder="e.g. Launch v2.0 Design System" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Umbrella</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none bg-white">
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Target Deadline (optional)</label>
              <input type="text" placeholder="Optional, e.g. Q3 2026" value={quarter} onChange={(e) => setQuarter(e.target.value)}
                className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Health Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as 'Safe' | 'Watch' | 'Risky')}
              className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none bg-white">
              <option value="Safe">Safe (On track)</option>
              <option value="Watch">Watch (Needs attention)</option>
              <option value="Risky">Risky (At risk)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Brief Scope Description</label>
            <textarea placeholder="Establish key credentials guidelines and milestone checklists…" value={desc} onChange={(e) => setDesc(e.target.value)}
              className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none resize-none h-20" />
          </div>
          <div className="flex gap-2 justify-end pt-3">
            <button type="button" onClick={closeNewGoalModal} className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-[#f8f9fa] hover:bg-gray-100 text-gray-500 font-semibold">Cancel</button>
            <button type="submit" className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-black text-white font-bold">Kickstart Goal</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
