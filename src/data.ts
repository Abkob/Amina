import { Goal, CalendarEvent, ThoughtNote } from './types';

export const INITIAL_GOALS: Goal[] = [
  {
    id: 'goal-1',
    title: 'Launch v2.0 Design System',
    category: 'Product Development',
    status: 'Safe',
    targetQuarter: 'Q3 2024',
    overdue: false,
    activityLevel: 4,
    progress: 75,
    nextAction: {
      id: 'act-1',
      text: 'Review component naming conventions with dev team.',
      completed: false,
    },
    description: 'Establish consistent design tokens, UI widgets, and extensive documentation across both standard and mobile devices.',
    criticalPath: [
      {
        id: 'cp-1',
        title: 'Token Audit & Normalization',
        status: 'Completed',
        description: 'Consolidate redundant color and typography variables across web and mobile.',
        tags: ['Tokens', 'Audit']
      },
      {
        id: 'cp-2',
        title: 'Core Component Refactor',
        status: 'In Progress',
        description: 'Rebuild primary navigation, buttons, and form inputs using new structural tokens.',
        tags: ['Buttons', 'Inputs']
      },
      {
        id: 'cp-3',
        title: 'Documentation & Guidelines',
        status: 'Future',
        description: 'Draft usage guidelines and conflict resolution protocols for engineering.',
        tags: ['Docs']
      }
    ],
    aiTasks: [
      {
        id: 'ait-1',
        title: 'Refactor Buttons & FABs',
        duration: 'Est. 2 hrs',
        completed: false
      },
      {
        id: 'ait-2',
        title: 'Standardize Form Inputs',
        duration: 'Est. 1.5 hrs',
        completed: false
      },
      {
        id: 'ait-3',
        title: 'Update Navigation Shells',
        duration: 'Est. 3 hrs',
        completed: false
      }
    ],
    resources: [
      {
        id: 'res-1',
        title: 'Figma: Component Library',
        type: 'figma',
        info: 'link added 2d ago'
      }
    ]
  },
  {
    id: 'goal-2',
    title: 'Complete Spanish A2 Certification',
    category: 'Languages',
    status: 'Watch',
    targetQuarter: 'Oct 15',
    overdue: false,
    activityLevel: 2,
    progress: 40,
    nextAction: {
      id: 'act-2',
      text: 'Schedule 3 practice sessions for this week.',
      completed: false,
    },
    description: 'Passing intermediate Level A2 exam including oral competency, dynamic scenario response, and syntax evaluation.',
    criticalPath: [
      {
        id: 'cp-2-1',
        title: 'Vocabulary Drills & Anki',
        status: 'Completed',
        description: 'Review common intermediate-tier verb conjugations and direct object pronoun layouts.'
      },
      {
        id: 'cp-2-2',
        title: 'Weekly Speaking Practice',
        status: 'In Progress',
        description: '30-minute structured dialogues with tutor focusing on active daily scenarios.'
      },
      {
        id: 'cp-2-3',
        title: 'Official Oral Assessment',
        status: 'Future',
        description: 'Register and complete official certification board online oral trial.'
      }
    ],
    aiTasks: [
      {
        id: 'ait-2-1',
        title: 'Conjugate 50 Irregular Verbs',
        duration: 'Est. 1 hr',
        completed: false
      },
      {
        id: 'ait-2-2',
        title: 'Read short story aloud',
        duration: 'Est. 1.5 hrs',
        completed: false
      }
    ],
    resources: [
      {
        id: 'res-2-1',
        title: 'Spanish A2 Learning Plan',
        type: 'document',
        info: 'link added 1w ago'
      }
    ]
  },
  {
    id: 'goal-3',
    title: 'Migrate Personal Data to NAS',
    category: 'DevOps & Storage',
    status: 'Risky',
    targetQuarter: 'Aug 30',
    overdue: true,
    activityLevel: 1,
    progress: 20,
    nextAction: {
      id: 'act-3',
      text: 'Purchase 2x 8TB drives for RAID setup.',
      completed: false,
    },
    description: 'Safely aggregate distributed user files across various devices and sync onto redundancy-based hardware server.',
    criticalPath: [
      {
        id: 'cp-3-1',
        title: 'Network Hardware Sizing',
        status: 'Completed',
        description: 'Finalize optimal server parameters, router compatibility, and hard drive density options.'
      },
      {
        id: 'cp-3-2',
        title: 'Network Storage Provisioning',
        status: 'In Progress',
        description: 'Configure RAID-1 array on the local server disks to hold baseline system images.'
      },
      {
        id: 'cp-3-3',
        title: 'Automatic Sync Pipelines',
        status: 'Future',
        description: 'Set up cron utility scripts to automatically pull workspace states on Sundays.'
      }
    ],
    aiTasks: [
      {
        id: 'ait-3-1',
        title: 'Research RAID Configurations',
        duration: 'Est. 2 hrs',
        completed: false
      },
      {
        id: 'ait-3-2',
        title: 'Test remote SSH connectivity',
        duration: 'Est. 1 hr',
        completed: false
      }
    ],
    resources: [
      {
        id: 'res-3-1',
        title: 'NAS Hardware SpecSheet',
        type: 'document',
        info: 'link added 3d ago'
      }
    ]
  },
  {
    id: 'goal-4',
    title: 'Run Half Marathon',
    category: 'Health & Fitness',
    status: 'Safe',
    targetQuarter: 'Nov 12',
    overdue: false,
    activityLevel: 4,
    progress: 60,
    nextAction: {
      id: 'act-4',
      text: 'Long run: 12 miles this Sunday.',
      completed: false,
    },
    description: 'Achieve distance milestones with structured pacing program, diet management, and dynamic zone-2 cardio training.',
    criticalPath: [
      {
        id: 'cp-4-1',
        title: 'Baseline Building Block',
        status: 'Completed',
        description: 'Complete initial 8-week steady training window maintaining 15 miles/week volume.'
      },
      {
        id: 'cp-4-2',
        title: 'Interval Sprint Surge',
        status: 'In Progress',
        description: 'Add lactate threshold speed components on track mornings focusing on form.'
      },
      {
        id: 'cp-4-3',
        title: 'The Tapering Protocol',
        status: 'Future',
        description: 'Lower weekly volume by 40% while keeping high energy outputs standard.'
      }
    ],
    aiTasks: [
      {
        id: 'ait-4-1',
        title: 'Review lactic recovery timers',
        duration: 'Est. 45 mins',
        completed: false
      },
      {
        id: 'ait-4-2',
        title: 'Adjust nutrition spreadsheet',
        duration: 'Est. 30 mins',
        completed: false
      }
    ],
    resources: [
      {
        id: 'res-4-1',
        title: 'Garmin Sync Workspace',
        type: 'other',
        info: 'link added 1d ago'
      }
    ]
  }
];

export const INITIAL_EVENTS: CalendarEvent[] = [
  {
    id: 'evt-1',
    title: 'Deep Work: Q4 Strategy',
    type: 'Focus',
    dayIndex: 0, // Monday
    startHour: 10.0, // 10:00 AM
    durationHours: 2.0, // 2 hours
    timeStr: '10:00 - 12:00',
    description: 'Placed here to ensure steady progress before Friday review. You typically have high focus during this window.',
    connectedResource: {
      title: 'Q4 Planning Doc',
      source: 'Notion'
    },
    parentGoalId: 'goal-1'
  },
  {
    id: 'evt-2',
    title: 'Email & Slack Catch-up',
    type: 'Buffer',
    dayIndex: 1, // Tuesday
    startHour: 8.0, // 8:00 AM
    durationHours: 1.0, // 1 hour
    timeStr: '8:00 - 9:00',
    description: 'Structured low-focus period to coordinate item priority across teams and address critical inbox markers.'
  },
  {
    id: 'evt-3',
    title: 'Read: Competitor Analysis',
    type: 'Review',
    dayIndex: 1, // Tuesday
    startHour: 11.0, // 11:00 AM
    durationHours: 1.5, // 1.5 hours
    timeStr: '11:00 - 12:30',
    description: 'Scheduled right after lunch. Reading is a lower-cognitive load task suitable for this energy trough.',
    parentGoalId: 'goal-1'
  },
  {
    id: 'evt-4',
    title: 'Draft Product Specs',
    type: 'Focus',
    dayIndex: 1, // Tuesday
    startHour: 14.0, // 2:00 PM
    durationHours: 2.0, // 2 hours
    timeStr: '14:00 - 16:00',
    description: 'Blocked out to utilize late-afternoon secondary focus surge. Aligns with your "Launch v2.0 Design System" goal.',
    connectedResource: {
      title: 'Component Specs Draft',
      source: 'Figma'
    },
    parentGoalId: 'goal-1'
  },
  {
    id: 'evt-5',
    title: 'Q4 Strategy: Data Modeling',
    type: 'Focus',
    dayIndex: 2, // Wednesday
    startHour: 9.0, // 9:00 AM
    durationHours: 3.0, // 3 hours
    timeStr: '9:00 - 12:00',
    description: 'Deep architectural block focusing on visual entity relationship structures, relational scaling index, and keys setup.',
    parentGoalId: 'goal-1'
  },
  {
    id: 'evt-6',
    title: 'Weekly Review',
    type: 'Admin',
    dayIndex: 4, // Friday
    startHour: 13.0, // 1:00 PM
    durationHours: 1.0, // 1 hour
    timeStr: '13:00 - 14:00',
    description: 'Standard end-of-week compilation of completed objectives, upcoming scheduling shifts, and task lists sorting.'
  }
];

export const INITIAL_NOTES: ThoughtNote[] = [
  {
    id: 'note-1',
    title: 'Morning Thoughts',
    dateStr: 'Today, Oct 24 • 09:41 AM',
    content: `Starting the day with a quick review of yesterday's notes. The right now is wrapping up the Q3 deliverables before the review block. Need to finish the sensor report by Friday. This feels critical to communicate project state clearly.`,
    suggestedAction: {
      text: 'Attach to Goal: Sensor Project',
      actionText: 'Apply to Goal: Launch v2.0 Design System',
      applied: false,
      ignored: false,
    },
    extractedTasks: [
      { text: 'Finish Sensor Report', due: 'DUE FRIDAY' }
    ],
    relevantDocs: [
      { title: 'Sensor Project Specs.pdf', edited: 'Last edited 2 days ago' }
    ]
  },
  {
    id: 'note-2',
    title: 'Project Deployment Log',
    dateStr: 'Oct 22 • 04:15 PM',
    content: `Successfully ran the deployment script. We had major issues with environment variable bindings in container runtimes. Let's document this with the team before next launch iteration.`,
    extractedTasks: [
      { text: 'Update Deployment variables doc', due: 'DUE OCTOBER 28' }
    ],
    relevantDocs: [
      { title: 'Container Config Checklist.md', edited: 'Last edited 5 days ago' }
    ]
  }
];
