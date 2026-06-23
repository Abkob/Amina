import React, { useState, useEffect, useRef } from 'react';
import {
  Target,
  Calendar,
  BookOpen,
  FolderOpen,
  Settings as SettingsIcon,
  HelpCircle,
  Archive,
  Plus,
  Search,
  Zap,
  Bell,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Square,
  CheckSquare,
  RefreshCw,
  FileText,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  Folder,
  ArrowRight,
  Info
} from 'lucide-react';
import { INITIAL_GOALS, INITIAL_EVENTS, INITIAL_NOTES } from './data';
import { Goal, CalendarEvent, ThoughtNote, CriticalPathItem } from './types';

export default function App() {
  // Shared state persisted in localStorage or fallback to defaults
  const [goals, setGoals] = useState<Goal[]>(() => {
    const saved = localStorage.getItem('amina_goals');
    return saved ? JSON.parse(saved) : INITIAL_GOALS;
  });

  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    const saved = localStorage.getItem('amina_events');
    return saved ? JSON.parse(saved) : INITIAL_EVENTS;
  });

  const [notes, setNotes] = useState<ThoughtNote[]>(() => {
    const saved = localStorage.getItem('amina_notes');
    return saved ? JSON.parse(saved) : INITIAL_NOTES;
  });

  const [activeNoteId, setActiveNoteId] = useState<string>(() => {
    const saved = localStorage.getItem('amina_active_note_id');
    return saved || 'note-1';
  });

  // Goal navigation detail view
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(() => {
    const saved = localStorage.getItem('amina_selected_goal_id');
    return saved !== 'null' && saved ? saved : null;
  });

  // Navigation tab
  const [currentTab, setCurrentTab] = useState<'Brain Dump' | 'Goals' | 'Schedule' | 'Journal' | 'Resources' | 'Settings'>(() => {
    const saved = localStorage.getItem('amina_current_tab');
    return (saved as any) || 'Goals';
  });

  // Active or Completed toggle for Goals dashboard
  const [goalsFilter, setGoalsFilter] = useState<'Active' | 'Completed'>('Active');

  // Selected calendar event for AI Explanation Drawer
  const [selectedEventId, setSelectedEventId] = useState<string | null>('evt-1');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(true);

  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // UI Interactive triggers
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);
  const [newGoalModalOpen, setNewGoalModalOpen] = useState<boolean>(false);
  const [newNoteModalOpen, setNewNoteModalOpen] = useState<boolean>(false);
  const [newEventModalOpen, setNewEventModalOpen] = useState<boolean>(false);

  // New Goal Form hook states
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState('Product Development');
  const [newGoalQuarter, setNewGoalQuarter] = useState('Q3 2024');
  const [newGoalStatus, setNewGoalStatus] = useState<'Safe' | 'Watch' | 'Risky'>('Safe');
  const [newGoalDesc, setNewGoalDesc] = useState('');

  // New Note Form hook states
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');

  // New Event Form hook states
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDay, setNewEventDay] = useState(1); // Tuesday
  const [newEventHour, setNewEventHour] = useState(10.0);
  const [newEventDuration, setNewEventDuration] = useState(2.0);
  const [newEventType, setNewEventType] = useState<'Focus' | 'Buffer' | 'Review' | 'Admin'>('Focus');
  const [newEventDesc, setNewEventDesc] = useState('');

  // Ref for focus editor selection annotation
  const [selectedTextSnippet, setSelectedTextSnippet] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // AI Scheduling simulation variable
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);

  // Save changes to localStorage
  useEffect(() => {
    localStorage.setItem('amina_goals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('amina_events', JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem('amina_notes', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('amina_active_note_id', activeNoteId);
  }, [activeNoteId]);

  useEffect(() => {
    localStorage.setItem('amina_selected_goal_id', String(selectedGoalId));
  }, [selectedGoalId]);

  useEffect(() => {
    localStorage.setItem('amina_current_tab', currentTab);
  }, [currentTab]);

  // Flash helper
  const triggerToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  const getActiveNote = () => {
    const note = notes.find(n => n.id === activeNoteId);
    return note || notes[0];
  };

  // Resets state back to initial seed data
  const handleResetData = () => {
    if (window.confirm('Are you sure you want to restore the application defaults? This will overwrite your custom items.')) {
      setGoals(INITIAL_GOALS);
      setEvents(INITIAL_EVENTS);
      setNotes(INITIAL_NOTES);
      setActiveNoteId('note-1');
      setSelectedGoalId(null);
      setCurrentTab('Goals');
      triggerToast('All default copilot assets successfully restored!', 'info');
    }
  };

  // Handles adding thoughts or notes from Brain Dump
  const handleCreateNote = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newNoteTitle.trim()) {
      triggerToast('Please provide a title for your thought log', 'error');
      return;
    }

    const newNote: ThoughtNote = {
      id: `note-${Date.now()}`,
      title: newNoteTitle,
      dateStr: `Today, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
      content: newNoteContent || 'Empty thought trace. Tap here to start typing...',
      extractedTasks: [],
      relevantDocs: []
    };

    setNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
    setNewNoteTitle('');
    setNewNoteContent('');
    setNewNoteModalOpen(false);
    triggerToast('New thought trace captured in mental warehouse!', 'success');
  };

  // Interactive binder: Attach to goal handler
  const handleApplyNoteSuggestedAction = (noteId: string) => {
    // Finds "Launch v2.0 Design System" and appends task
    setGoals(prevGoals =>
      prevGoals.map(goal => {
        if (goal.id === 'goal-1') {
          // If already has this AI task, don't duplicate
          const alreadyLinked = goal.aiTasks.some(t => t.title === 'Finish Sensor Report');
          const updatedAiTasks = alreadyLinked
            ? goal.aiTasks
            : [
                ...goal.aiTasks,
                {
                  id: `ait-${Date.now()}`,
                  title: 'Finish Sensor Report',
                  duration: 'Est. 1.25 hrs',
                  completed: false
                }
              ];
          return {
            ...goal,
            progress: Math.max(0, Math.floor((goal.progress + 75) / 2)), // update progress marginally
            aiTasks: updatedAiTasks
          };
        }
        return goal;
      })
    );

    setNotes(prevNotes =>
      prevNotes.map(n => {
        if (n.id === noteId && n.suggestedAction) {
          return {
            ...n,
            suggestedAction: {
              ...n.suggestedAction,
              applied: true
            }
          };
        }
        return n;
      })
    );

    triggerToast('Extracted task linked as sub-item in Design System goal!', 'success');
  };

  const handleIgnoreNoteSuggestedAction = (noteId: string) => {
    setNotes(prevNotes =>
      prevNotes.map(n => {
        if (n.id === noteId && n.suggestedAction) {
          return {
            ...n,
            suggestedAction: {
              ...n.suggestedAction,
              ignored: true
            }
          };
        }
        return n;
      })
    );
    triggerToast('Suggested action archived.', 'info');
  };

  // Handles checking off a primary checkbox on Dashboard
  const handleToggleGoalNextAction = (goalId: string) => {
    setGoals(prevGoals =>
      prevGoals.map(g => {
        if (g.id === goalId) {
          const completes = !g.nextAction.completed;
          let progressShift = completes ? 5 : -5;
          return {
            ...g,
            nextAction: { ...g.nextAction, completed: completes },
            progress: Math.min(100, Math.max(0, g.progress + progressShift))
          };
        }
        return g;
      })
    );
    triggerToast('Next Action checklist updated!', 'success');
  };

  // Handles updating AI deconstructed task checklist in Goal Detail
  const handleToggleAiDeconstructionTask = (goalId: string, taskId: string) => {
    setGoals(prevGoals =>
      prevGoals.map(g => {
        if (g.id === goalId) {
          const updatedTasks = g.aiTasks.map(t => {
            if (t.id === taskId) {
              return { ...t, completed: !t.completed };
            }
            return t;
          });

          // Recalculate progress based on task completions and checkpoints
          const completedCount = updatedTasks.filter(t => t.completed).length;
          const pctPerTask = 25 / (updatedTasks.length || 1);
          // Set progress to match baseline state plus completion premium
          const baseline = g.id === 'goal-1' ? 75 : 40;
          const calculatedProgress = Math.min(
            100,
            Math.max(0, Math.round(baseline + (completedCount * pctPerTask)))
          );

          return {
            ...g,
            aiTasks: updatedTasks,
            progress: calculatedProgress
          };
        }
        return g;
      })
    );
  };

  // Integrates task into scheduler right away from Goal Detail
  const handleScheduleAiDeconstruction = (goalId: string) => {
    // Add event "Design System: Component Sync" to Friday
    const newEvent: CalendarEvent = {
      id: `evt-${Date.now()}`,
      title: 'Design System: Comp Sync',
      type: 'Focus',
      dayIndex: 4, // Friday
      startHour: 10.0, // 10:00 AM
      durationHours: 2.0, // 2 hours
      timeStr: '10:00 - 12:00',
      description: 'Integrated directly from Design System AI Task recommendation. This block represents focus work on refactoring components.',
      connectedResource: {
        title: 'Component Library',
        source: 'Figma'
      },
      parentGoalId: goalId
    };

    setEvents(prev => {
      // Avoid duplication
      if (prev.some(e => e.title === newEvent.title)) return prev;
      return [...prev, newEvent];
    });

    triggerToast('Task integrated as structured focus block on Friday at 10:00 AM!', 'success');
    setCurrentTab('Schedule');
    setSelectedEventId(newEvent.id);
    setIsDrawerOpen(true);
  };

  // Handles editing thought content inline
  const handleUpdateNoteContent = (newContent: string) => {
    setNotes(prevNotes =>
      prevNotes.map(n => (n.id === activeNoteId ? { ...n, content: newContent } : n))
    );
  };

  // AI Scheduling simulation "Fix my Week"
  const handleFixMyWeek = () => {
    setIsOptimizing(true);
    triggerToast('AI analysis active. Resolving structural conflicts...', 'info');

    setTimeout(() => {
      // Re-map events to optimized slot
      setEvents(prevEvents =>
        prevEvents.map(evt => {
          if (evt.id === 'evt-3') {
            // "Read: Competitor Analysis" shift: Tuesday 11:30 instead of 11:00 to reduce conflict, or keep but polish description
            return {
              ...evt,
              startHour: 11.5,
              timeStr: '11:30 - 13:00',
              description: 'AI OPTIMIZED: Shifted by 30 mins to guarantee full cognitive recovery from morning focus sprint.'
            };
          }
          if (evt.id === 'evt-6') {
            // "Weekly Review" slot shift
            return {
              ...evt,
              startHour: 14.0, // Shift to 2:00 PM for deep breath buffer
              timeStr: '14:00 - 15:00',
              description: 'AI OPTIMIZED: Arranged strictly after administrative task closure, safeguarding focus limits.'
            };
          }
          return evt;
        })
      );
      setIsOptimizing(false);
      triggerToast('Weekly plan recalibrated! Focus parameters stabilized.', 'success');
    }, 1800);
  };

  // Creates new goal from modal
  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) {
      triggerToast('Please provide a title for your goal', 'error');
      return;
    }

    const newGoal: Goal = {
      id: `goal-${Date.now()}`,
      title: newGoalTitle,
      category: newGoalCategory,
      status: newGoalStatus,
      targetQuarter: newGoalQuarter,
      overdue: false,
      activityLevel: Math.floor(Math.random() * 3) + 2, // 2-4
      progress: 10,
      nextAction: {
        id: `act-${Date.now()}`,
        text: 'Initial strategy kickoff and scope definition.',
        completed: false
      },
      description: newGoalDesc || 'Goal description outlining major parameters and milestones.',
      criticalPath: [
        {
          id: `cp-${Date.now()}-1`,
          title: 'Scoping & Architecture',
          status: 'In Progress',
          description: 'Assess base dependencies and coordinate initial milestone list.'
        },
        {
          id: `cp-${Date.now()}-2`,
          title: 'Operational Implementation',
          status: 'Future',
          description: 'Refactor systems and write code templates.'
        }
      ],
      aiTasks: [
        { id: `ait-n-1`, title: 'Formulate timeline tasks', duration: 'Est. 1 hr', completed: false }
      ],
      resources: []
    };

    setGoals([...goals, newGoal]);
    setNewGoalTitle('');
    setNewGoalDesc('');
    setNewGoalModalOpen(false);
    triggerToast(`Goal "${newGoal.title}" created successfully!`, 'success');
  };

  // Creates new calendar event
  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) {
      triggerToast('Please provide a title for the event', 'error');
      return;
    }

    const duration = parseFloat(String(newEventDuration)) || 1.0;
    const hour = parseFloat(String(newEventHour)) || 9.0;

    const startH = Math.floor(hour);
    const startM = Math.round((hour - startH) * 60);
    const startMStr = startM === 0 ? '00' : String(startM);
    const ampm = startH < 12 ? 'AM' : 'PM';
    const displayHour = startH % 12 || 12;

    const endH = Math.floor(hour + duration);
    const endM = Math.round(((hour + duration) - endH) * 60);
    const endMStr = endM === 0 ? '00' : String(endM);
    const endampm = endH < 12 ? 'AM' : 'PM';
    const displayEndHour = endH % 12 || 12;

    const timeStr = `${displayHour}:${startMStr} ${ampm} - ${displayEndHour}:${endMStr} ${endampm}`;

    const newEvent: CalendarEvent = {
      id: `evt-${Date.now()}`,
      title: newEventTitle,
      type: newEventType,
      dayIndex: newEventDay,
      startHour: hour,
      durationHours: duration,
      timeStr: timeStr,
      description: newEventDesc || 'Custom scheduled block designed to support task execution.'
    };

    setEvents([...events, newEvent]);
    setNewEventTitle('');
    setNewEventDesc('');
    setNewEventModalOpen(false);
    triggerToast(`Scheduled "${newEvent.title}" on the calendar!`, 'success');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropMock = (e: React.DragEvent, goalId: string) => {
    e.preventDefault();
    const newRes: any = {
      id: `res-${Date.now()}`,
      title: 'Uploaded Document Spec.pdf',
      type: 'document',
      info: 'link added just now'
    };
    setGoals(prevGoals =>
      prevGoals.map(g => {
        if (g.id === goalId) {
          return {
            ...g,
            resources: [...g.resources, newRes]
          };
        }
        return g;
      })
    );
    triggerToast('Mock file resource attached to current goal!', 'success');
  };

  const handleManualAddResource = (goalId: string) => {
    const filename = prompt('Enter resource file reference or external link address:', 'https://figma.com/file/amina-os-v2');
    if (!filename) return;

    const isLink = filename.startsWith('http://') || filename.startsWith('https://');
    const newRes: any = {
      id: `res-${Date.now()}`,
      title: isLink ? 'Figma Specs Component Link' : filename,
      type: isLink ? 'figma' : 'document',
      info: 'link added just now'
    };

    setGoals(prevGoals =>
      prevGoals.map(g => {
        if (g.id === goalId) {
          return {
            ...g,
            resources: [...g.resources, newRes]
          };
        }
        return g;
      })
    );
    triggerToast('Resource asset successfully bound to goal hierarchy!', 'success');
  };

  // Navigation filtering
  const filteredGoals = goals.filter(g => {
    const queryMatch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                       g.category.toLowerCase().includes(searchQuery.toLowerCase());
    if (!queryMatch) return false;

    if (goalsFilter === 'Active') {
      return g.progress < 100;
    } else {
      return g.progress === 100;
    }
  });

  const activeGoal = goals.find(g => g.id === selectedGoalId) || goals[0];
  const activeNote = getActiveNote();
  const activeEvent = events.find(e => e.id === selectedEventId);

  // Statistics calculation
  const totalGoalsCount = goals.length;
  const onTrackCount = goals.filter(g => g.status === 'Safe').length;
  const needsAttentionCount = goals.filter(g => g.status === 'Watch').length;
  const atRiskCount = goals.filter(g => g.status === 'Risky').length;

  return (
    <div className="bg-canvas-bg text-on-surface font-sans antialiased min-h-screen flex selection:bg-ai-highlight-soft selection:text-primary">
      
      {/* Toast Alert Banner */}
      {feedbackMsg && (
        <div className="fixed top-20 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border border-black/10 bg-white animate-fade-in">
          {feedbackMsg.type === 'success' ? (
            <div className="w-2 h-2 rounded-full bg-status-safe animate-ping" />
          ) : feedbackMsg.type === 'info' ? (
            <div className="w-2 h-2 rounded-full bg-secondary-container animate-ping" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-status-urgent animate-ping" />
          )}
          <span className="text-xs font-semibold font-mono uppercase tracking-wider text-primary mr-1 bg-surface-container py-0.5 px-1.5 rounded">{feedbackMsg.type}</span>
          <p className="text-sm font-medium text-gray-800">{feedbackMsg.text}</p>
        </div>
      )}

      {/* Desktop Sidebar */}
      <nav id="desktop-sidebar" className="bg-sidebar-bg h-screen w-[260px] fixed left-0 top-0 flex flex-col p-4 hidden md:flex z-50 transition-all duration-300">
        {/* Brand */}
        <div className="mb-6 px-1 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-secondary-container to-purple-800 flex items-center justify-center text-white font-headline font-bold text-lg shadow-inner">
            A
          </div>
          <div>
            <h1 className="font-headline text-lg font-bold text-white tracking-tight leading-tight">Amina OS</h1>
            <p className="font-mono text-[10px] text-gray-400 uppercase tracking-widest">Personal Copilot</p>
          </div>
        </div>

        {/* Primary Action */}
        <button
          id="new-thought-btn"
          onClick={() => {
            if (currentTab === 'Goals') {
              setNewGoalModalOpen(true);
            } else if (currentTab === 'Schedule') {
              setNewEventModalOpen(true);
            } else {
              setNewNoteModalOpen(true);
            }
          }}
          className="w-full bg-white text-sidebar-bg font-sans font-semibold text-xs py-2.5 rounded-lg mb-6 flex items-center justify-center gap-2 hover:bg-gray-100 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
        >
          <Plus size={15} />
          <span>New {currentTab === 'Goals' ? 'Goal' : currentTab === 'Schedule' ? 'Block' : 'Thought'}</span>
        </button>

        {/* Navigation Links */}
        <div className="flex-1 flex flex-col gap-1.5">
          <button
            id="nav-braindump"
            onClick={() => { setSelectedGoalId(null); setCurrentTab('Brain Dump'); }}
            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all duration-150 ${
              currentTab === 'Brain Dump'
                ? 'text-white bg-gray-800 font-bold border-l-4 border-secondary-container'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
            }`}
          >
            <BookOpen size={16} className={currentTab === 'Brain Dump' ? 'text-secondary-fixed-dim' : ''} />
            <span>Brain Dump</span>
          </button>

          <button
            id="nav-goals"
            onClick={() => { setCurrentTab('Goals'); }}
            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all duration-150 ${
              currentTab === 'Goals'
                ? 'text-white bg-gray-800 font-bold border-l-4 border-secondary-container'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
            }`}
          >
            <Target size={16} className={currentTab === 'Goals' ? 'text-secondary-fixed-dim' : ''} />
            <span>Goals</span>
          </button>

          <button
            id="nav-schedule"
            onClick={() => { setSelectedGoalId(null); setCurrentTab('Schedule'); }}
            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all duration-150 ${
              currentTab === 'Schedule'
                ? 'text-white bg-gray-800 font-bold border-l-4 border-secondary-container'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
            }`}
          >
            <Calendar size={16} className={currentTab === 'Schedule' ? 'text-secondary-fixed-dim' : ''} />
            <span>Schedule</span>
          </button>

          <button
            id="nav-resources"
            onClick={() => { setSelectedGoalId(null); setCurrentTab('Resources'); }}
            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all duration-150 ${
              currentTab === 'Resources'
                ? 'text-white bg-gray-800 font-bold border-l-4 border-secondary-container'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
            }`}
          >
            <FolderOpen size={16} className={currentTab === 'Resources' ? 'text-secondary-fixed-dim' : ''} />
            <span>Resources</span>
          </button>

          <button
            id="nav-settings"
            onClick={() => { setSelectedGoalId(null); setCurrentTab('Settings'); }}
            className={`flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-wider rounded-lg transition-all duration-150 ${
              currentTab === 'Settings'
                ? 'text-white bg-gray-800 font-bold border-l-4 border-secondary-container'
                : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
            }`}
          >
            <SettingsIcon size={16} className={currentTab === 'Settings' ? 'text-secondary-fixed-dim' : ''} />
            <span>Settings</span>
          </button>
        </div>

        {/* Footer Links */}
        <div className="flex flex-col gap-1 mt-auto pt-4 border-t border-gray-800">
          <button
            onClick={() => triggerToast('Amina Copilot diagnostic reporting initialized.', 'info')}
            className="flex items-center gap-3 px-3 py-2 text-xs font-mono text-gray-400 hover:text-white transition-colors"
          >
            <HelpCircle size={15} />
            <span>Help</span>
          </button>
          <button
            onClick={handleResetData}
            className="flex items-center gap-3 px-3 py-2 text-xs font-mono text-gray-400 hover:text-status-warning transition-colors"
          >
            <Archive size={15} />
            <span>Reset Defaults</span>
          </button>
          
          {/* User profile identifier at sidebar bottom */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 mt-2 bg-gray-900/50 rounded-lg">
            <div className="relative w-7 h-7 rounded-lg overflow-hidden shrink-0 border border-gray-700 bg-gray-800 flex items-center justify-center">
              <span className="font-mono text-xs text-white font-bold">U</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-white truncate leading-tight">ab2.kobaissi</p>
              <p className="text-[9px] font-mono text-gray-500 truncate leading-tight">Premium User</p>
            </div>
          </div>
        </div>
      </nav>

      {/* Top Navigation Bar: Desktop only */}
      <header id="desktop-header" className="fixed top-0 right-0 left-0 md:left-[260px] h-16 z-40 bg-white/90 backdrop-blur-md hidden md:flex justify-between items-center px-6 border-b border-gray-100">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-headline text-lg font-black text-primary tracking-tight">Amina</span>
            <div className="bg-ai-highlight-soft border border-secondary-fixed-dim/40 px-1.5 py-0.5 rounded text-[9px] font-mono uppercase text-secondary font-bold">OS 2.0</div>
          </div>
          <nav className="flex items-center gap-6">
            <button
              onClick={() => { setSelectedGoalId(null); setCurrentTab('Brain Dump'); }}
              className={`font-mono text-xs uppercase tracking-wider pb-1 transition-all ${
                currentTab === 'Brain Dump'
                  ? 'text-primary font-bold border-b-2 border-primary'
                  : 'text-gray-400 hover:text-primary'
              }`}
            >
              Focus
            </button>
            <button
              onClick={() => { setCurrentTab('Goals'); }}
              className={`font-mono text-xs uppercase tracking-wider pb-1 transition-all ${
                currentTab === 'Goals' || currentTab === 'Resources' || currentTab === 'Settings'
                  ? 'text-primary font-bold border-b-2 border-primary'
                  : 'text-gray-400 hover:text-primary'
              }`}
            >
              Reflect
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {/* Search Box */}
          <div className="relative group hidden lg:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Filter mental map..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#f3f4f5] border-none rounded-full py-1.5 pl-9 pr-4 font-mono text-[11px] text-primary placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 transition-all w-40 group-focus-within:w-56"
            />
          </div>

          <button
            onClick={() => {
              triggerToast('Synchronizing copilot assets with neural engines...', 'info');
              setTimeout(() => {
                triggerToast('All notes, goals, and logs completely synchronized.', 'success');
              }, 1000);
            }}
            className="font-mono text-[10px] uppercase tracking-wider text-primary border border-gray-200 px-3.5 py-1.5 rounded-full hover:bg-gray-50 transition-colors cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <RefreshCw size={11} className="animate-spin-slow" />
            <span>Sync AI</span>
          </button>

          <button
            onClick={() => triggerToast('Amina OS Diagnostic logs are nominal (latency: 14ms).', 'info')}
            className="text-gray-400 hover:text-primary transition-colors flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100"
          >
            <Zap size={15} />
          </button>

          <button
            onClick={() => setIsNotificationOpen(!isNotificationOpen)}
            className="text-gray-400 hover:text-primary transition-colors flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 relative"
          >
            <Bell size={15} />
            <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-status-urgent rounded-full border border-white animate-pulse"></span>
          </button>

          {/* User Email & Avatar indicator */}
          <div className="flex items-center gap-2 pl-2 border-l border-gray-100">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuC77RLeDDakGJQ4MP9wYcxIvZx0LhA3x49A5xlJOg4S4uEo34dcUMSBQVhKcZBFlyy4DyGXswu_nmLlGrM96KKrsDwJqdiwgn3Fq-1eo360fT94FzZEXJWyGw3kA5xy1tcXh-Gg4OaNLhI4M59l6zGRFM5KFSYJoyowOybjI-zdIKlvmZsMT3OpWwBsr7ftzsvCJZ2rsyvmpgtTinuxohWed8GXUyi1k1-OEHrRZdXUVXtQTu_RRoElUV-UE_b0WSUfslNnagddlw"
              alt="Amina OS Status"
              className="w-8 h-8 rounded-full border border-gray-100 object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </header>

      {/* Main Content Layout container */}
      <main className="flex-1 w-full md:pl-[260px] pt-4 md:pt-[76px] pb-24 md:pb-8 min-h-screen overflow-x-hidden">
        
        {/* TAB 1: BRAIN DUMP / FOCUS SCREEN (Screen 2) */}
        {currentTab === 'Brain Dump' && (
          <div className="max-w-[1100px] mx-auto px-4 md:px-10 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
            {/* Left Drawer of Notes in Brain Dump */}
            <div className="lg:col-span-3 flex flex-col gap-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-gray-400 uppercase tracking-widest">Thought Traces</span>
                <button
                  onClick={() => setNewNoteModalOpen(true)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                  title="New Thought Log"
                >
                  <Plus size={15} />
                </button>
              </div>
              <div className="flex flex-col gap-2 max-h-[180px] lg:max-h-[500px] overflow-y-auto pr-1">
                {notes.map(n => (
                  <button
                    key={n.id}
                    onClick={() => setActiveNoteId(n.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      n.id === activeNoteId
                        ? 'bg-white border-black shadow-card'
                        : 'bg-surface hover:bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[9px] font-mono text-gray-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary-container"></span>
                      <span>{n.dateStr.split(' • ')[0]}</span>
                    </div>
                    <p className="text-xs font-bold text-gray-900 truncate">{n.title}</p>
                    <p className="text-[10px] text-gray-500 line-clamp-2 mt-1">{n.content}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Middle Big Editor / Document details */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-col h-full min-h-[450px]">
              <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3">
                <div>
                  <span className="font-mono text-[10px] text-secondary font-bold tracking-wide uppercase bg-ai-highlight-soft px-2 py-0.5 rounded">Neural Log Entry</span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <h2 className="font-headline text-xl font-bold text-primary">{activeNote.title}</h2>
                  </div>
                  <p className="font-mono text-[10px] text-gray-400 mt-1">{activeNote.dateStr}</p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Delete this thought trace?')) {
                      setNotes(notes.filter(n => n.id !== activeNoteId));
                      setActiveNoteId(notes[0]?.id || '');
                      triggerToast('Thought trace discarded.', 'info');
                    }
                  }}
                  className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded text-gray-400 transition-colors"
                  title="Discard note"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Distraction free writing space */}
              <div className="flex-1 flex flex-col relative">
                <textarea
                  ref={editorRef}
                  value={activeNote.content}
                  onChange={(e) => handleUpdateNoteContent(e.target.value)}
                  onSelect={(e: any) => {
                    const snip = e.target.value.substring(e.target.selectionStart, e.target.selectionEnd);
                    if (snip && snip.length > 3) {
                      setSelectedTextSnippet(snip);
                    } else {
                      setSelectedTextSnippet(null);
                    }
                  }}
                  className="w-full flex-1 border-none focus:ring-0 p-0 text-gray-800 leading-relaxed font-sans placeholder:text-gray-300 resize-none min-h-[250px] outline-none text-sm"
                  placeholder="Tap here to document trace lines. Amina OS parses tasks, context milestones, and resource connections dynamically..."
                />

                {/* Simulated Floating Tooltip Highlight Recommendation (From screenshot) */}
                {activeNote.suggestedAction && !activeNote.suggestedAction.applied && !activeNote.suggestedAction.ignored && (
                  <div className="mt-4 p-4 rounded-xl bg-white border border-secondary-container/30 shadow-lg animate-fade-in relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-secondary-container"></div>
                    <div className="flex items-center gap-1.5 text-secondary text-[10px] font-mono uppercase tracking-wider font-bold mb-2">
                      <Sparkles size={11} className="text-secondary" />
                      <span>Suggested Action</span>
                    </div>
                    <p className="text-xs text-gray-800 font-semibold mb-3">{activeNote.suggestedAction.text}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApplyNoteSuggestedAction(activeNote.id)}
                        className="bg-primary text-white text-[10px] font-mono uppercase py-1.5 px-3.5 rounded-lg font-bold hover:bg-opacity-90 active:scale-95 transition-all"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => handleIgnoreNoteSuggestedAction(activeNote.id)}
                        className="bg-surface hover:bg-gray-100 text-gray-500 text-[10px] font-mono uppercase py-1.5 px-3.5 rounded-lg active:scale-95 transition-all"
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                )}

                {/* Mini notification about selection highlight helper */}
                {selectedTextSnippet && (
                  <div className="absolute bottom-2 left-2 bg-primary text-white p-2 rounded-lg text-[10px] font-mono shadow-md animate-fade-in flex items-center gap-2">
                    <Sparkles size={10} className="text-yellow-400" />
                    <span>Create goal action from Selection?</span>
                    <button
                      onClick={() => {
                        setNewGoalTitle(`Action: ${selectedTextSnippet}`);
                        setNewGoalModalOpen(true);
                      }}
                      className="bg-secondary-container text-white px-2 py-0.5 rounded leading-tight hover:opacity-90"
                    >
                      Kickstart Goal
                    </button>
                    <button onClick={() => setSelectedTextSnippet(null)} className="text-gray-400 hover:text-white">
                      <X size={10} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Rail: CONTEXT & INSIGHTS (Screen 2) */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <div className="bg-surface rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 text-primary font-mono text-[10px] uppercase tracking-wider font-bold mb-4">
                  <Sparkles size={13} className="text-secondary-container" />
                  <span>Context &amp; Insights</span>
                </div>

                {/* Extracted Tasks (Rendered intelligently from note objects) */}
                <div className="mb-4">
                  <span className="font-mono text-[9px] text-gray-400 uppercase tracking-widest block mb-2">Parsed Tasks</span>
                  {activeNote.extractedTasks.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No tasks extracted yet. Copilot analyzes notes in real time.</p>
                  ) : (
                    activeNote.extractedTasks.map((t, idx) => (
                      <div key={idx} className="bg-white rounded-xl p-3 border border-gray-200/60 shadow-sm flex flex-col gap-1.5 hover:border-gray-300">
                        <div className="flex items-center gap-2 text-xs text-gray-800 font-semibold">
                          <CheckCircle2 size={13} className="text-secondary-container shrink-0" />
                          <span>{t.text}</span>
                        </div>
                        <div className="flex justify-between items-center text-[9px] font-mono text-red-500 bg-red-50 border border-red-100/65 py-0.5 px-1.5 rounded w-max">
                          <span>{t.due}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Relevant Documents */}
                <div>
                  <span className="font-mono text-[9px] text-gray-400 uppercase tracking-widest block mb-2 font-semibold">Associated Assets</span>
                  {activeNote.relevantDocs.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No files referenced. Write document names like file.pdf to trace.</p>
                  ) : (
                    activeNote.relevantDocs.map((doc, idx) => (
                      <div key={idx} className="bg-white rounded-xl p-3 border border-gray-200/60 shadow-sm flex items-center gap-3 hover:border-gray-300">
                        <FileText size={16} className="text-gray-500 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-800 font-semibold truncate leading-tight">{doc.title}</p>
                          <p className="text-[9px] font-mono text-gray-400 truncate mt-1">{doc.edited}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Neural network hint box */}
              <div className="bg-ai-highlight-soft rounded-xl p-4 border border-secondary/10 text-xs">
                <p className="font-bold text-secondary mb-1">Amina Mind-Link Helper</p>
                <p className="text-gray-600 leading-normal">Typing action-driven sentences automatically generates recommended targets. Selection fragments allow mapping text into custom goals instantly.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GOALS DASHBOARD (Screen 1) */}
        {currentTab === 'Goals' && !selectedGoalId && (
          <div className="max-w-[1000px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="font-headline text-2xl font-bold text-primary mb-1 leading-tight">Goals</h2>
                <p className="text-sm text-gray-500 max-w-xl">Bird's-eye view of your current trajectories. Keep your primary objectives in focus.</p>
              </div>

              <div className="flex items-center gap-3">
                {/* Active or Completed Toggle */}
                <div className="flex items-center gap-1.5 bg-[#f3f4f5] rounded-full p-1 border border-gray-200">
                  <button
                    onClick={() => setGoalsFilter('Active')}
                    className={`px-3 py-1 font-mono text-xs uppercase tracking-wider rounded-full shadow-sm cursor-pointer transition-all ${
                      goalsFilter === 'Active'
                        ? 'bg-white text-primary font-bold shadow-sm'
                        : 'text-gray-400 hover:text-primary'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setGoalsFilter('Completed')}
                    className={`px-3 py-1 font-mono text-xs uppercase tracking-wider rounded-full cursor-pointer transition-all ${
                      goalsFilter === 'Completed'
                        ? 'bg-white text-primary font-bold shadow-sm'
                        : 'text-gray-400 hover:text-primary'
                    }`}
                  >
                    Completed
                  </button>
                </div>

                {/* Floating Plus action */}
                <button
                  onClick={() => setNewGoalModalOpen(true)}
                  className="bg-primary text-white w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-md hover:scale-[1.03] transition-all active:scale-[0.98]"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>

            {/* Dashboard Overview Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-surface rounded-xl p-4 border border-gray-200 shadow-card">
                <p className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-1.5 font-bold">Total Goals</p>
                <p className="font-headline text-2xl font-bold text-primary">{totalGoalsCount}</p>
              </div>
              <div className="bg-surface rounded-xl p-4 border border-gray-200 shadow-card">
                <p className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-1.5 font-bold">On Track</p>
                <p className="font-headline text-2xl font-bold text-status-safe">{onTrackCount}</p>
              </div>
              <div className="bg-surface rounded-xl p-4 border border-gray-200 shadow-card">
                <p className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-1.5 font-bold">Needs Attention</p>
                <p className="font-headline text-2xl font-bold text-status-warning">{needsAttentionCount}</p>
              </div>
              <div className="bg-surface rounded-xl p-4 border border-gray-200 shadow-card">
                <p className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-1.5 font-bold">At Risk</p>
                <p className="font-headline text-2xl font-bold text-status-urgent">{atRiskCount}</p>
              </div>
            </div>

            {/* Goals Grid */}
            {filteredGoals.length === 0 ? (
              <div className="text-center py-16 bg-surface rounded-xl border border-dashed border-gray-200">
                <Target size={36} className="text-gray-300 mx-auto mb-3 animate-pulse" />
                <p className="text-gray-800 font-semibold mb-1">No goals match selection filter</p>
                <p className="text-xs text-gray-400 max-w-xs mx-auto mb-4">You can capture a brand-new strategic goal of your own by taping the launch indicator below.</p>
                <button
                  onClick={() => setNewGoalModalOpen(true)}
                  className="bg-primary text-white text-xs font-mono py-2 px-4 rounded-xl font-bold shadow-sm"
                >
                  Initialize New Goal
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredGoals.map((g, idx) => {
                  {/* Status coloring calculations */}
                  const statusColor = g.status === 'Safe' ? 'bg-status-safe' : g.status === 'Watch' ? 'bg-status-warning' : 'bg-status-urgent';
                  const textColor = g.status === 'Safe' ? 'text-status-safe' : g.status === 'Watch' ? 'text-status-warning' : 'text-status-urgent';

                  {/* Circle strokes setup */}
                  const radiusOuter = 40;
                  const circumOuter = 2 * Math.PI * radiusOuter;
                  const strokeOffsetOuter = circumOuter * (1 - g.progress / 100);

                  const radiusInner = 32;
                  const circumInner = 2 * Math.PI * radiusInner;
                  // Map active rating (1 to 5) to circumference ratio
                  const ratingMap = g.activityLevel / 5;
                  const strokeOffsetInner = circumInner * (1 - ratingMap);

                  return (
                    <div
                      key={g.id}
                      onClick={() => setSelectedGoalId(g.id)}
                      className="bg-white rounded-xl p-5 border border-gray-100 hover:border-gray-200 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group cursor-pointer flex flex-col h-full"
                    >
                      {/* Top colored highlight line */}
                      <div className={`absolute top-0 left-0 w-full h-1 ${statusColor}`}></div>

                      <div className="flex justify-between items-start mb-4">
                        <div className="bg-surface border border-gray-100 px-2 py-0.5 rounded text-[10px] font-mono font-bold text-gray-600 flex items-center gap-1.5 uppercase tracking-wide">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`}></span>
                          <span>{g.status}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Archive goal "${g.title}"?`)) {
                              setGoals(goals.filter(item => item.id !== g.id));
                              triggerToast('Goal archived.', 'info');
                            }
                          }}
                          className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <h3 className="font-headline text-base font-bold text-gray-900 group-hover:text-secondary-container transition-colors mb-1 leading-snug">{g.title}</h3>
                      <p className="font-mono text-[10px] text-gray-400 mb-6 flex items-center gap-1">
                        <Calendar size={11} className="text-gray-400" />
                        <span>{g.targetQuarter}</span>
                        {g.overdue && <span className="text-status-urgent font-bold ml-1 font-mono uppercase tracking-wider text-[9px]">(Overdue)</span>}
                      </p>

                      <div className="flex items-center justify-between mt-auto mb-6">
                        {/* Dynamic Double Circular Progress Ring */}
                        <div className="relative w-16 h-16 shrink-0">
                          <svg className="w-full h-full -rotate-90 origin-center" viewBox="0 0 100 100">
                            {/* Outer grey background circle */}
                            <circle
                              cx="50"
                              cy="50"
                              r={radiusOuter}
                              fill="transparent"
                              stroke="#e1e3e4"
                              strokeWidth="6"
                            />
                            {/* Inner grey background circle */}
                            <circle
                              cx="50"
                              cy="50"
                              r={radiusInner}
                              fill="transparent"
                              stroke="#edeeef"
                              strokeWidth="4"
                            />
                            {/* Activity Level - Inner Ring (light blue fixed color) */}
                            <circle
                              cx="50"
                              cy="50"
                              r={radiusInner}
                              fill="transparent"
                              stroke="#c0c1ff"
                              strokeWidth="4"
                              strokeDasharray={circumInner}
                              strokeDashoffset={strokeOffsetInner}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                            />
                            {/* Finalization Progress - Outer Ring (Status based color) */}
                            <circle
                              cx="50"
                              cy="50"
                              r={radiusOuter}
                              fill="transparent"
                              stroke={g.status === 'Safe' ? '#10B981' : g.status === 'Watch' ? '#F59E0B' : '#EF4444'}
                              strokeWidth="6"
                              strokeDasharray={circumOuter}
                              strokeDashoffset={strokeOffsetOuter}
                              strokeLinecap="round"
                              style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-gray-900 font-bold">
                            {g.progress}%
                          </div>
                        </div>

                        {/* Activity Level indicator bar */}
                        <div className="text-right pl-4">
                          <p className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-1.5 font-bold">Activity Level</p>
                          <div className="flex gap-1 justify-end items-end h-4">
                            {[1, 2, 3, 4, 5].map((lvl) => (
                              <div
                                key={lvl}
                                className={`w-1 rounded-full transition-all ${
                                  lvl <= g.activityLevel
                                    ? g.status === 'Safe' ? 'bg-secondary h-4' : g.status === 'Watch' ? 'bg-status-warning h-3.5' : 'bg-status-urgent h-3'
                                    : 'bg-gray-200 h-1.5'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Next Action checklist */}
                      <div className="border-t border-gray-100 pt-4" onClick={(e) => e.stopPropagation()}>
                        <p className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-2 font-bold">Next Action</p>
                        <div
                          onClick={() => handleToggleGoalNextAction(g.id)}
                          className="flex items-start gap-2.5 bg-surface p-2 rounded-lg cursor-pointer hover:bg-gray-150 transition-colors"
                        >
                          <button className="shrink-0 mt-0.5 text-gray-400 hover:text-primary transition-colors">
                            {g.nextAction.completed ? (
                              <CheckSquare size={14} className="text-secondary" />
                            ) : (
                              <Square size={14} />
                            )}
                          </button>
                          <p className={`text-xs text-gray-700 leading-normal ${g.nextAction.completed ? 'line-through text-gray-400' : ''}`}>
                            {g.nextAction.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: GOAL TIMELINE / DETAIL VIEW (Screen 4) */}
        {currentTab === 'Goals' && selectedGoalId && (
          <div className="max-w-[1000px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
            {/* Back action */}
            <button
              onClick={() => setSelectedGoalId(null)}
              className="group mb-5 font-mono text-xs uppercase tracking-wider text-gray-400 hover:text-primary flex items-center gap-1.5 cursor-pointer"
            >
              <ChevronLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
              <span>Back into Goals Matrix</span>
            </button>

            {/* Goal detailed summary header */}
            <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-gray-100 pb-6">
              <div>
                <div className="flex items-center gap-2 text-gray-400 font-mono text-[10px] uppercase tracking-wider mb-2 font-bold">
                  <Folder size={12} className="text-gray-400" />
                  <span>{activeGoal.category}</span>
                </div>
                <h1 className="font-headline text-2xl font-black text-gray-900 leading-tight">{activeGoal.title}</h1>
                <p className="text-xs text-gray-500 mt-2 max-w-xl">{activeGoal.description}</p>
              </div>

              {/* Status card overlay matching screenshot */}
              <div className="flex items-center gap-4 bg-white rounded-xl p-4 border border-gray-100 shadow-ambient shrink-0">
                <div className="relative w-14 h-14">
                  <svg className="w-full h-full -rotate-90 origin-center text-[#e1e3e4]" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="transparent"
                      stroke={activeGoal.status === 'Safe' ? '#10B981' : activeGoal.status === 'Watch' ? '#F59E0B' : '#EF4444'}
                      strokeWidth="8"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 * (1 - activeGoal.progress / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-gray-900">
                    {activeGoal.progress}%
                  </div>
                </div>
                <div>
                  <div className={`font-headline text-base font-bold text-gray-900 flex items-center gap-1.5`}>
                    <span className={`w-2 h-2 rounded-full ${activeGoal.status === 'Safe' ? 'bg-status-safe' : activeGoal.status === 'Watch' ? 'bg-status-warning' : 'bg-status-urgent'}`} />
                    <span>{activeGoal.status}</span>
                  </div>
                  <div className="font-mono text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                    <Calendar size={11} />
                    <span>Due {activeGoal.targetQuarter}</span>
                  </div>
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Timeline Critical Path */}
              <div className="lg:col-span-2 flex flex-col gap-5">
                <h2 className="font-headline text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <Target size={16} className="text-primary" />
                  <span>Critical Path</span>
                </h2>

                <div className="relative pl-6 border-l-2 border-gray-150 space-y-6 pb-2 ml-2">
                  {activeGoal.criticalPath.map((step) => {
                    const isCompleted = step.status === 'Completed';
                    const isInProgress = step.status === 'In Progress';

                    let dotClass = 'bg-gray-200 ring-4 ring-gray-100';
                    if (isCompleted) dotClass = 'bg-status-safe ring-4 ring-status-safe/20';
                    if (isInProgress) dotClass = 'bg-secondary ring-4 ring-secondary/25';

                    return (
                      <div key={step.id} className="relative group">
                        {/* Milestone dot hook */}
                        <div className="absolute -left-[31px] top-1.5 bg-white p-0.5 rounded-full z-10">
                          <div className={`w-3 h-3 rounded-full ${dotClass}`}></div>
                        </div>

                        <div className={`bg-surface rounded-xl p-4 border shadow-sm transition-all ${
                          isInProgress ? 'border-secondary/25 shadow-card' : 'border-gray-150'
                        } ${isCompleted ? 'opacity-70' : ''}`}>
                          <div className="flex justify-between items-start mb-1.5">
                            <h3 className={`text-xs font-mono font-bold tracking-wide uppercase ${isCompleted ? 'line-through text-gray-400' : 'text-primary'}`}>
                              {step.title}
                            </h3>
                            <span className={`font-mono text-[9px] uppercase tracking-wider py-0.5 px-1.5 rounded-md ${
                              isCompleted ? 'bg-emerald-50 text-status-safe font-bold' : isInProgress ? 'bg-secondary/10 text-secondary font-bold' : 'bg-gray-100 text-gray-400'
                            }`}>
                              {step.status}
                            </span>
                          </div>
                          
                          <p className={`text-xs text-gray-500 leading-normal ${isCompleted ? 'line-through text-gray-400' : ''}`}>
                            {step.description}
                          </p>

                          {step.tags && step.tags.length > 0 && (
                            <div className="flex gap-2.5 mt-2.5">
                              {step.tags.map(tag => (
                                <span key={tag} className="text-[9px] font-mono uppercase tracking-wider bg-gray-200 px-2 py-0.5 rounded text-gray-500">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: AI & Resources */}
              <div className="lg:col-span-1 flex flex-col gap-6">
                
                {/* AI Splitting Tool / AI Deconstruction */}
                <section className="bg-ai-highlight-soft rounded-xl p-5 border border-secondary-container/10 shadow-ambient relative overflow-hidden flex flex-col h-full">
                  <div className="absolute top-0 right-0 p-3 opacity-15">
                    <Sparkles size={36} className="text-secondary" />
                  </div>

                  <h2 className="font-headline text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <Sparkles size={14} className="text-secondary" />
                    <span>AI Deconstruction</span>
                  </h2>
                  <p className="text-xs text-gray-600 leading-relaxed mb-4">
                    The block represents heavy workload parameters. Amina suggests splitting the milestones to maintain focus momentum.
                  </p>

                  {/* Deconstructed sub-tasks Checklist */}
                  <div className="space-y-2.5 mb-6">
                    {activeGoal.aiTasks.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No micro-milestones configured by the neural parsing unit.</p>
                    ) : (
                      activeGoal.aiTasks.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => handleToggleAiDeconstructionTask(activeGoal.id, t.id)}
                          className="bg-white hover:bg-gray-50 rounded-lg p-3 border border-gray-150 flex items-start gap-3 cursor-pointer select-none"
                        >
                          <button className="text-gray-400 hover:text-secondary shrink-0 mt-0.5">
                            {t.completed ? (
                              <CheckCircle2 size={15} className="text-secondary" />
                            ) : (
                              <Square size={15} />
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-semibold text-gray-800 leading-tight ${t.completed ? 'line-through text-gray-400' : ''}`}>{t.title}</p>
                            <p className="text-[9px] font-mono text-gray-400 mt-1">{t.duration}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Schedule integration banner */}
                  <div className="bg-white rounded-lg p-3 border border-gray-250 mt-auto shadow-sm">
                    <div className="font-mono text-[9px] text-secondary mb-1 uppercase tracking-widest font-bold">Schedule Integration</div>
                    <p className="text-[11px] text-gray-500 leading-normal mb-3">Fits perfectly into your "Deep Work" calendar slot this Friday morning.</p>
                    <button
                      onClick={() => handleScheduleAiDeconstruction(activeGoal.id)}
                      className="w-full bg-primary text-white font-mono text-[10px] uppercase font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 hover:opacity-95 active:scale-95 transition-all"
                    >
                      <Calendar size={12} />
                      <span>Apply to Schedule</span>
                    </button>
                  </div>
                </section>

                {/* Drop Zone Upload Files & link metadata */}
                <section
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropMock(e, activeGoal.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-headline text-sm font-bold text-gray-900 flex items-center gap-1.5">
                      <FolderOpen size={14} className="text-gray-500" />
                      <span>Resources</span>
                    </h2>
                    
                    <button
                      onClick={() => handleManualAddResource(activeGoal.id)}
                      className="text-[9px] font-mono uppercase bg-surface hover:bg-gray-100 text-gray-500 py-1 px-2.5 rounded border border-gray-200"
                    >
                      Attach Link
                    </button>
                  </div>

                  {/* Drop container */}
                  <div className="border-2 border-dashed border-gray-200 hover:border-black/35 rounded-xl p-8 text-center bg-surface hover:bg-white transition-all cursor-pointer flex flex-col items-center justify-center gap-2">
                    <Upload className="text-gray-400" size={24} />
                    <p className="text-xs font-semibold text-gray-700">Drag &amp; drop specs here</p>
                    <p className="text-[10px] text-gray-400 max-w-[170px] leading-relaxed mx-auto">Append Figma spec-sheets, Notion logs, or guidelines into goal database.</p>
                  </div>

                  {/* Associated dynamic links */}
                  {activeGoal.resources.length > 0 && (
                    <div className="mt-4 space-y-2 animate-fade-in">
                      {activeGoal.resources.map((res) => (
                        <div key={res.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-150 hover:border-gray-200 shadow-sm">
                          {res.type === 'figma' ? (
                            <span className="text-red-500 shrink-0 font-bold font-mono text-xs border border-red-200 bg-red-50 p-1 rounded">F</span>
                          ) : (
                            <FileText size={16} className="text-gray-400 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{res.title}</p>
                            <p className="text-[9px] font-mono text-gray-400 truncate mt-1 uppercase tracking-widest">{res.info}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SCHEDULE / WEEKLY AI CALENDAR (Screen 3) */}
        {currentTab === 'Schedule' && (
          <div className="max-w-[1100px] mx-auto px-4 md:px-10 py-6 h-full flex flex-col overflow-hidden animate-fade-in">
            {/* Header / Week selection */}
            <div className="flex justify-between items-end mb-6 shrink-0">
              <div>
                <h2 className="font-headline text-2xl font-bold text-primary">This Week</h2>
                <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mt-1">Oct 23 - Oct 29</p>
              </div>

              <div className="flex items-center gap-3">
                {/* AI optimizer action */}
                <button
                  onClick={handleFixMyWeek}
                  disabled={isOptimizing}
                  className="p-2 px-3 bg-ai-highlight-soft hover:bg-secondary-fixed-dim/20 text-secondary border border-secondary-fixed-dim rounded-lg hover:shadow-sm font-sans font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles size={13} className={isOptimizing ? 'animate-spin' : 'animate-pulse'} />
                  <span>{isOptimizing ? 'Recalculating...' : 'Fix my Week'}</span>
                </button>

                <div className="flex gap-1 border border-gray-200 rounded-lg p-0.5 bg-surface">
                  <button
                    onClick={() => triggerToast('Previous week schedule retrieved.', 'info')}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => triggerToast('Next week schedule initialized.', 'info')}
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-600 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Main Calendar View content wrapping events */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Calendar Area Grid */}
              <div className="lg:col-span-8 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm flex flex-col relative">
                
                {/* Day Headers */}
                <div className="grid grid-cols-8 border-b border-gray-150 bg-gray-50 shrink-0 text-center text-xs">
                  <div className="p-3 border-r border-gray-150/40 font-mono text-[9px] text-gray-400 uppercase tracking-wider flex items-center justify-center">
                    GMT-7
                  </div>
                  {['Mon 23', 'Tue 24', 'Wed 25', 'Thu 26', 'Fri 27', 'Sat 28', 'Sun 29'].map((day, dIdx) => {
                    const isToday = dIdx === 1; // Tuesday is today
                    return (
                      <div key={day} className={`p-2.5 border-r border-gray-150/40 relative flex flex-col justify-center ${isToday ? 'bg-ai-highlight-soft/20' : ''}`}>
                        <span className={`text-[10px] font-mono uppercase tracking-widest block font-bold ${isToday ? 'text-secondary' : 'text-gray-400'}`}>
                          {day.split(' ')[0]}
                        </span>
                        <span className={`text-base font-bold font-headline mt-0.5 inline-block mx-auto leading-8 text-primary ${
                          isToday ? 'bg-secondary text-white rounded-full w-8 h-8 flex items-center justify-center shadow-sm' : ''
                        }`}>
                          {day.split(' ')[1]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Hour-indexed Scrollable calendar container */}
                <div className="overflow-y-auto max-h-[480px] bg-white relative pr-px">
                  {/* Background gridlines */}
                  <div className="absolute inset-0 pointer-events-none z-0 min-h-[960px]">
                    {/* Horizontal hour markers */}
                    {Array.from({ length: 16 }).map((_, i) => {
                      const absoluteHour = 8 + i; // Start from 8 AM to 11 PM
                      const ampm = absoluteHour < 12 ? 'AM' : absoluteHour === 12 ? 'PM' : 'PM';
                      const displayH = absoluteHour <= 12 ? absoluteHour : absoluteHour - 12;

                      return (
                        <div key={i} className="absolute left-[62px] right-0 border-t border-gray-100 flex items-center" style={{ top: `${i * 60}px`, height: '60px' }}>
                          <span className="absolute -left-[54px] top-0 -translate-y-1/2 font-mono text-[9px] text-gray-400 w-11 text-right block pr-1">
                            {displayH} {ampm}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Red/Blue Current Time Indicator line on Friday at 9:30 AM */}
                  <div className="absolute left-0 right-0 z-10 flex items-center pointer-events-none" style={{ top: '90px' }}> {/* 9:30 is 1.5 hrs after 8:00 AM kickoff, so 1.5 * 60 = 90px */}
                    <div className="w-[60px] text-right pr-2.5 font-mono text-[9px] text-secondary font-bold">9:30</div>
                    <div className="flex-1 border-t-2 border-secondary relative">
                      <div className="absolute -left-1 -top-[5px] w-2.5 h-2.5 rounded-full bg-secondary"></div>
                    </div>
                  </div>

                  {/* Relative Events Layout block */}
                  <div className="absolute inset-0 z-20 min-h-[960px] ml-[62px] grid grid-cols-7 pointer-events-none">
                    
                    {/* Rendered Events */}
                    {events.map((evt) => {
                      const isSelected = evt.id === selectedEventId;
                      // Mapping 8:00 AM center as 0px top. 1 hour = 60px
                      const topOffset = (evt.startHour - 8) * 60;
                      const heightPx = evt.durationHours * 60;

                      // Status styles
                      let borderStyle = 'border-gray-200 bg-surface text-gray-800';
                      let barStyle = 'bg-gray-400';
                      if (evt.type === 'Focus') {
                        borderStyle = 'border-secondary-fixed-dim bg-[#e1e0ff]/30 text-primary';
                        barStyle = 'bg-secondary';
                      } else if (evt.type === 'Review') {
                        borderStyle = 'border-status-safe/30 bg-emerald-50/15 text-primary';
                        barStyle = 'bg-status-safe';
                      } else if (evt.type === 'Admin') {
                        borderStyle = 'border-status-warning/30 bg-status-warning/5 text-primary';
                        barStyle = 'bg-status-warning';
                      } else if (evt.type === 'Buffer') {
                        borderStyle = 'border-gray-300 border-dashed bg-white text-gray-500';
                        barStyle = 'bg-gray-300';
                      }

                      return (
                        <div
                          key={evt.id}
                          className="relative pointer-events-auto h-full"
                          style={{ gridColumnStart: evt.dayIndex + 1 }}
                        >
                          <div
                            onClick={(e) => {
                              setSelectedEventId(evt.id);
                              setIsDrawerOpen(true);
                              e.stopPropagation();
                            }}
                            className={`absolute left-1 right-1 rounded-lg border p-2 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col ${borderStyle} ${
                              isSelected ? 'ring-2 ring-primary bg-white' : ''
                            }`}
                            style={{ top: `${topOffset}px`, height: `${heightPx}px` }}
                          >
                            <div className={`w-1 absolute left-0 top-0 bottom-0 ${barStyle}`} />
                            <div className="flex justify-between items-start mb-0.5 min-w-0">
                              <span className="font-mono text-[8px] uppercase tracking-wider bg-gray-100 font-bold px-1 rounded truncate leading-tight">
                                {evt.type}
                              </span>
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEventId(evt.id);
                                  setIsDrawerOpen(true);
                                }}
                                className="text-gray-400 hover:text-secondary opacity-50 group-hover:opacity-100"
                              >
                                <Info size={11} />
                              </button>
                            </div>
                            <h3 className="text-[11px] font-bold text-gray-900 truncate tracking-tight">{evt.title}</h3>
                            <p className="font-mono text-[8px] text-gray-400 truncate mt-0.5">{evt.timeStr}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Side: Glassmorphic AI drawer or preview details */}
              <div className="lg:col-span-4 flex flex-col h-full">
                {isDrawerOpen && activeEvent ? (
                  <aside className="bg-white/95 backdrop-blur-md rounded-xl border border-gray-200 p-5 shadow-ambient animate-fade-in relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
                      <div className="flex items-center gap-1.5 text-secondary">
                        <Sparkles size={14} className="animate-pulse" />
                        <h3 className="font-headline text-sm font-bold text-primary uppercase tracking-wide">AI Reasoning</h3>
                      </div>
                      <button
                        onClick={() => setIsDrawerOpen(false)}
                        className="p-1 hover:bg-gray-100 rounded text-gray-400"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div className="bg-surface rounded-xl p-4 border border-gray-150 shadow-sm relative overflow-hidden">
                        <h4 className="font-headline text-sm font-black text-gray-900 mb-1.5">{activeEvent.title}</h4>
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            activeEvent.type === 'Focus'
                              ? 'bg-secondary/10 text-secondary'
                              : activeEvent.type === 'Review'
                              ? 'bg-emerald-50 text-status-safe'
                              : 'bg-status-warning/10 text-status-warning'
                          }`}>
                            {activeEvent.type} Goal
                          </span>
                          <span className="font-mono text-[9px] text-gray-400">{activeEvent.timeStr}</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed mb-4">{activeEvent.description}</p>

                        {/* Connected Resources inside side-drawer */}
                        {activeEvent.connectedResource && (
                          <div className="border-t border-gray-100 pt-3.5 mt-3">
                            <h5 className="font-mono text-[9px] text-gray-400 uppercase tracking-widest mb-1.5 font-bold">Connected Resource</h5>
                            <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white border border-gray-150 hover:bg-gray-50 cursor-pointer">
                              <FileText size={14} className="text-gray-400" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-primary font-bold truncate leading-tight">{activeEvent.connectedResource.title}</p>
                                <p className="text-[9px] font-mono text-gray-400 truncate mt-0.5">{activeEvent.connectedResource.source}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2.5">
                        <button
                          onClick={() => {
                            triggerToast('Proposed scheduled action validated and saved.', 'success');
                            setIsDrawerOpen(false);
                          }}
                          className="flex-1 py-2 bg-primary text-white rounded-lg text-xs font-mono uppercase font-bold hover:opacity-95 active:scale-95 transition-all shadow-sm"
                        >
                          Accept Slot
                        </button>
                        <button
                          onClick={() => {
                            // reschedule event dynamically by 1 hour (simulate action)
                            setEvents(prev =>
                              prev.map(e => (e.id === activeEvent.id ? { ...e, startHour: e.startHour + 1, timeStr: `${Math.floor(e.startHour + 1)}:00 - ${Math.floor(e.startHour + 1 + e.durationHours)}:00` } : e))
                            );
                            triggerToast('Block shifted down to reserve mental buffers.', 'info');
                          }}
                          className="flex-1 py-2 border border-gray-200 text-primary bg-white rounded-lg text-xs font-mono uppercase hover:bg-gray-50 active:scale-95 transition-all"
                        >
                          Reschedule
                        </button>
                      </div>
                    </div>
                  </aside>
                ) : (
                  <div className="bg-ai-highlight-soft rounded-xl p-5 border border-dashed border-secondary/20 text-center text-xs">
                    <Sparkles size={24} className="text-secondary mx-auto mb-2.5 animate-pulse" />
                    <p className="font-bold text-secondary mb-1">Interactive Scheduler Guidance</p>
                    <p className="text-gray-600 leading-normal mb-3">
                      Tap any block inside the schedule grid to activate Amina OS reasoning profiles. The assistant explains slot assignments instantly.
                    </p>
                    <button
                      onClick={() => {
                        setSelectedEventId(events[0]?.id || null);
                        setIsDrawerOpen(true);
                      }}
                      className="bg-primary hover:bg-opacity-90 text-white text-[10px] uppercase font-mono py-1.5 px-3 rounded-lg"
                    >
                      Amina Analytics
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: RESOURCES DIRECTORY */}
        {currentTab === 'Resources' && (
          <div className="max-w-[1000px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
            <div className="mb-6">
              <h2 className="font-headline text-2xl font-bold text-primary mb-1 leading-tight">Resources</h2>
              <p className="text-sm text-gray-500">Structured document vault automatically tracked through mental traces.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {goals.map((g) => {
                if (g.resources.length === 0) return null;
                return (
                  <div key={g.id} className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 flex flex-col hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-1.5 text-secondary font-mono text-[9px] uppercase tracking-wide font-bold mb-3 bg-ai-highlight-soft px-2 py-0.5 rounded w-max">
                      <Folder size={11} />
                      <span>{g.title}</span>
                    </div>

                    <div className="space-y-3">
                      {g.resources.map((res) => (
                        <div key={res.id} className="p-3 bg-surface rounded-xl border border-gray-150 flex items-center justify-between hover:border-black/25">
                          <div className="flex items-center gap-3 min-w-0">
                            {res.type === 'figma' ? (
                              <span className="text-red-500 font-mono text-xs font-bold border border-red-200 bg-red-50 p-1 rounded shrink-0">F</span>
                            ) : (
                              <FileText size={16} className="text-gray-500 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-800 truncate leading-snug">{res.title}</p>
                              <p className="text-[9px] font-mono text-gray-400 mt-0.5">{res.info}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 6: SETTINGS */}
        {currentTab === 'Settings' && (
          <div className="max-w-[700px] mx-auto px-4 md:px-10 py-6 animate-fade-in">
            <div className="mb-8 border-b border-gray-100 pb-4">
              <h2 className="font-headline text-2xl font-black text-primary mb-1">Amina OS Preferences</h2>
              <p className="text-sm text-gray-500">Configure personal co-pilot workspace triggers, prompt models, and localStorage databases.</p>
            </div>

            <div className="space-y-6">
              {/* Profile Config CARD */}
              <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
                <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-primary mb-3">Copilot Metadata</h3>
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 rounded-full border overflow-hidden grow-0 shrink-0">
                    <img
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuC77RLeDDakGJQ4MP9wYcxIvZx0LhA3x49A5xlJOg4S4uEo34dcUMSBQVhKcZBFlyy4DyGXswu_nmLlGrM96KKrsDwJqdiwgn3Fq-1eo360fT94FzZEXJWyGw3kA5xy1tcXh-Gg4OaNLhI4M59l6zGRFM5KFSYJoyowOybjI-zdIKlvmZsMT3OpWwBsr7ftzsvCJZ2rsyvmpgtTinuxohWed8GXUyi1k1-OEHrRZdXUVXtQTu_RRoElUV-UE_b0WSUfslNnagddlw"
                      alt="Amina OS Status"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">Amina DeepMind AI Engine</p>
                    <p className="text-xs text-gray-400 mt-1">Status: Nominal (2.4.0 active API binds) | latency: 13ms</p>
                    <button
                      onClick={() => triggerToast('Amina self-diagnosis complete. Focus indexes optimized.', 'success')}
                      className="text-[10px] font-mono uppercase bg-primary hover:bg-opacity-95 text-white font-bold py-1 px-2.5 rounded mt-3.5"
                    >
                      Diagnose Engine
                    </button>
                  </div>
                </div>
              </div>

              {/* Developer Utilities CARD */}
              <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm">
                <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-primary mb-3">Diagnostic Tools</h3>
                <div className="space-y-4">
                  <div className="p-3 bg-surface rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-gray-700">Clear localStorage matrix</p>
                      <p className="text-gray-400 mt-0.5">Flush custom notes, edited scheduler variables, and checklist states to pristine seed defaults.</p>
                    </div>
                    <button
                      onClick={handleResetData}
                      className="text-[10px] font-mono uppercase bg-status-urgent hover:bg-opacity-95 text-white font-bold py-1 px-3.5 rounded"
                    >
                      Factory Refactor
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Slide-out diagnostic/notification bar */}
      {isNotificationOpen && (
        <div className="fixed top-16 right-4 w-72 bg-white/95 backdrop-blur shadow-2xl rounded-xl border border-gray-200/90 p-4 z-50 animate-fade-in text-xs">
          <div className="flex justify-between items-center mb-3 text-primary font-bold uppercase font-mono tracking-wider border-b border-gray-100 pb-2">
            <span>Neural Notifications</span>
            <button onClick={() => setIsNotificationOpen(false)} className="text-gray-400 hover:text-black">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
            <div className="p-2 border border-secondary/15 rounded bg-ai-highlight-soft flex gap-2">
              <Sparkles size={14} className="text-secondary shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-primary">Extracted milestone alert</p>
                <p className="text-gray-500 mt-0.5">"Finish Sensor Report" extracted from Morning Thoughts note is waiting integration.</p>
              </div>
            </div>
            <div className="p-2 border border-red-150 bg-red-50/20 rounded flex gap-2 text-primary">
              <AlertTriangle size={14} className="text-status-urgent shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="font-bold text-gray-800">Milestone overdue parameters</p>
                <p className="text-gray-500 mt-0.5">"Migrate Personal Data to NAS" has surpassed its primary Aug 30 deadline matrix.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW GOAL MODAL FORM */}
      {newGoalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 max-w-md w-full p-6 shadow-2xl animate-fade-in relative">
            <button
              onClick={() => setNewGoalModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-primary"
            >
              <X size={16} />
            </button>
            <h3 className="font-headline text-lg font-black text-gray-900 border-b border-gray-100 pb-2 mb-4">Initialize Goal Trace</h3>

            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Goal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Launch v2.0 Design System"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Category</label>
                  <select
                    value={newGoalCategory}
                    onChange={(e) => setNewGoalCategory(e.target.value)}
                    className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none bg-white"
                  >
                    <option value="Product Development">Product Dev</option>
                    <option value="Languages">Languages</option>
                    <option value="DevOps & Storage">DevOps</option>
                    <option value="Health & Fitness">Fitness</option>
                    <option value="Strategy Planning">Strategy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Target Deadline</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Q3 2024 or Oct 15"
                    value={newGoalQuarter}
                    onChange={(e) => setNewGoalQuarter(e.target.value)}
                    className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Health Status</label>
                  <select
                    value={newGoalStatus}
                    onChange={(e: any) => setNewGoalStatus(e.target.value)}
                    className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none bg-white"
                  >
                    <option value="Safe">Safe (On track)</option>
                    <option value="Watch">Watch (Needs check)</option>
                    <option value="Risky">Risky (At risk)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Brief Scope Description</label>
                <textarea
                  placeholder="Establish key credentials guidelines and milestone checklists..."
                  value={newGoalDesc}
                  onChange={(e) => setNewGoalDesc(e.target.value)}
                  className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none resize-none h-20"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setNewGoalModalOpen(false)}
                  className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-surface hover:bg-gray-150 text-gray-500 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-primary text-white font-bold"
                >
                  Kickstart Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW NOTE MODAL FORM */}
      {newNoteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 max-w-md w-full p-6 shadow-2xl animate-fade-in relative">
            <button
              onClick={() => setNewNoteModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-primary"
            >
              <X size={16} />
            </button>
            <h3 className="font-headline text-lg font-black text-gray-900 border-b border-gray-100 pb-2 mb-4">Capture Thought Trace</h3>

            <form onSubmit={handleCreateNote} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Idea Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Afternoon Synthesis Logs"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Thought Content</label>
                <textarea
                  required
                  placeholder="Write whatever flows in your headspace..."
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none resize-none h-44"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setNewNoteModalOpen(false)}
                  className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-surface hover:bg-gray-150 text-gray-500 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-primary text-white font-bold"
                >
                  Commit Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW CALENDAR EVENT MODAL FORM */}
      {newEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-200 max-w-md w-full p-6 shadow-2xl animate-fade-in relative">
            <button
              onClick={() => setNewEventModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-primary"
            >
              <X size={16} />
            </button>
            <h3 className="font-headline text-lg font-black text-gray-900 border-b border-gray-100 pb-2 mb-4">Schedule Planning block</h3>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Block Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Finalize specs iteration"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Week Day</label>
                  <select
                    value={newEventDay}
                    onChange={(e: any) => setNewEventDay(Number(e.target.value))}
                    className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none bg-white"
                  >
                    <option value={0}>Monday</option>
                    <option value={1}>Tuesday</option>
                    <option value={2}>Wednesday</option>
                    <option value={3}>Thursday</option>
                    <option value={4}>Friday</option>
                    <option value={5}>Saturday</option>
                    <option value={6}>Sunday</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Block Type</label>
                  <select
                    value={activeNoteId}
                    onChange={(e: any) => setNewEventType(e.target.value)}
                    className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none bg-white"
                  >
                    <option value="Focus">Focus Deep Work</option>
                    <option value="Buffer">Slack Buffer Time</option>
                    <option value="Review">Document Review</option>
                    <option value="Admin">Admin Review</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Hour slots (24h Index)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="8"
                    max="22"
                    required
                    placeholder="e.g. 10.5 for 10:30"
                    value={newEventHour}
                    onChange={(e) => setNewEventHour(Number(e.target.value))}
                    className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Duration slots (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="6"
                    required
                    placeholder="e.g. 1.25 for 1h15m"
                    value={newEventDuration}
                    onChange={(e) => setNewEventDuration(Number(e.target.value))}
                    className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2 focus:ring-1 focus:ring-black outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1 font-bold">Proposed Description</label>
                <textarea
                  placeholder="Review component naming layouts and document redundancy..."
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="w-full text-xs font-sans rounded-lg border border-gray-200 p-2.5 focus:ring-1 focus:ring-black outline-none resize-none h-16"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3">
                <button
                  type="button"
                  onClick={() => setNewEventModalOpen(false)}
                  className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-surface hover:bg-gray-150 text-gray-500 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="font-mono text-[10px] uppercase py-2 px-4 rounded-lg bg-primary text-white font-bold"
                >
                  Commit Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Navigation for Mobile Devices */}
      <nav id="mobile-navigation" className="bg-white/95 backdrop-blur-lg fixed bottom-0 w-full z-50 md:hidden rounded-t-2xl shadow-ambient border-t border-gray-150 flex justify-around items-center px-4 py-2 pb-safe">
        
        <button
          onClick={() => { setSelectedGoalId(null); setCurrentTab('Brain Dump'); }}
          className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all focus:scale-95 ${
            currentTab === 'Brain Dump' ? 'text-secondary-container bg-ai-highlight-soft' : 'text-gray-400'
          }`}
        >
          <BookOpen size={18} />
          <span className="font-mono text-[9px] uppercase tracking-wider mt-1.5 font-bold">Capture</span>
        </button>

        <button
          onClick={() => { setCurrentTab('Goals'); }}
          className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all focus:scale-95 ${
            currentTab === 'Goals' ? 'text-secondary-container bg-ai-highlight-soft' : 'text-gray-400'
          }`}
        >
          <Target size={18} />
          <span className="font-mono text-[9px] uppercase tracking-wider mt-1.5 font-bold">Goals</span>
        </button>

        <button
          onClick={() => { setSelectedGoalId(null); setCurrentTab('Schedule'); }}
          className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all focus:scale-95 ${
            currentTab === 'Schedule' ? 'text-secondary-container bg-ai-highlight-soft' : 'text-gray-400'
          }`}
        >
          <Calendar size={18} />
          <span className="font-mono text-[9px] uppercase tracking-wider mt-1.5 font-bold">Schedule</span>
        </button>

        <button
          onClick={() => { setSelectedGoalId(null); setCurrentTab('Settings'); }}
          className={`flex flex-col items-center justify-center p-2.5 rounded-xl transition-all focus:scale-95 ${
            currentTab === 'Settings' ? 'text-secondary-container bg-ai-highlight-soft' : 'text-gray-400'
          }`}
        >
          <SettingsIcon size={18} />
          <span className="font-mono text-[9px] uppercase tracking-wider mt-1.5 font-bold">Settings</span>
        </button>
      </nav>
    </div>
  );
}
