export interface CriticalPathItem {
  id: string;
  title: string;
  status: 'Completed' | 'In Progress' | 'Future';
  description: string;
  tags?: string[];
}

export interface AIDeconstructedTask {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
}

export interface Resource {
  id: string;
  title: string;
  type: 'figma' | 'document' | 'other';
  info: string;
}

export interface Goal {
  id: string;
  title: string;
  category: string;
  status: 'Safe' | 'Watch' | 'Risky';
  targetQuarter: string;
  overdue: boolean;
  activityLevel: number; // 1 to 5 rating
  progress: number; // percentage
  nextAction: {
    id: string;
    text: string;
    completed: boolean;
  };
  criticalPath: CriticalPathItem[];
  aiTasks: AIDeconstructedTask[];
  resources: Resource[];
  description: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  type: 'Focus' | 'Buffer' | 'Review' | 'Admin';
  dayIndex: number; // 0 = Mon, 1 = Tue, 2 = Wed, 3 = Thu, 4 = Fri, 5 = Sat, 6 = Sun
  startHour: number; // e.g. 10.0 (10:00 AM) or 11.5 (11:30 AM)
  durationHours: number; // e.g. 2.0 or 1.5
  timeStr: string;
  description: string;
  connectedResource?: {
    title: string;
    source: string;
  };
  parentGoalId?: string;
}

export interface ThoughtNote {
  id: string;
  title: string;
  content: string;
  dateStr: string;
  suggestedAction?: {
    text: string;
    actionText: string;
    applied: boolean;
    ignored: boolean;
  };
  extractedTasks: { text: string; due: string }[];
  relevantDocs: { title: string; edited: string }[];
}
