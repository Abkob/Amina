const KEYWORD_SEEDS: Record<string, string[]> = {
  'design':    ['Create wireframes', 'Run component audit', 'Design system review', 'Export assets', 'Accessibility pass'],
  'develop':   ['Unit test coverage', 'Code review', 'Set up CI/CD', 'Deploy to staging', 'Update docs'],
  'research':  ['User interviews', 'Competitive analysis', 'Survey analysis', 'Synthesize findings', 'Present insights'],
  'plan':      ['Define scope', 'Stakeholder alignment', 'Risk register', 'Create timeline', 'Resource allocation'],
  'launch':    ['Beta testing', 'Go-to-market plan', 'Analytics setup', 'Feedback collection', 'Post-launch retro'],
  'migrat':    ['Audit existing state', 'Data mapping', 'Rollback plan', 'Dry-run migration', 'Cutover'],
  'review':    ['Gather feedback', 'Document findings', 'Performance benchmarks', 'Update roadmap', 'Retrospective'],
  'test':      ['Test plan', 'Edge cases inventory', 'Regression suite', 'Load test', 'UAT session'],
  'setup':     ['Environment config', 'Dependency audit', 'Access controls', 'Smoke test', 'Documentation'],
  'build':     ['Architecture design', 'Component scaffold', 'Integration tests', 'Error handling', 'Monitoring'],
  'content':   ['Outline structure', 'First draft', 'Peer review', 'SEO pass', 'Publish & promote'],
  'analys':    ['Data collection', 'Clean dataset', 'Exploratory analysis', 'Key insight summary', 'Share findings'],
};

const CATEGORY_SEEDS: Record<string, string[]> = {
  'Work':     ['Define scope', 'Stakeholder alignment', 'Draft next steps', 'Review deliverables', 'Share status update'],
  'Personal': ['Clarify outcome', 'Break into next actions', 'Schedule focus time', 'Gather references', 'Review progress'],
  'Health':   ['Baseline assessment', 'Training plan draft', 'Recovery protocol', 'Progress check-in', 'Habit review'],
  'Learning': ['Practice session', 'Review notes', 'Knowledge check', 'Create study plan', 'Summarize takeaways'],
  'Home':     ['Inventory current state', 'Purchase checklist', 'Setup plan', 'Maintenance review', 'Backup plan'],
  'Money':    ['Budget review', 'Compare options', 'Update tracker', 'Risk check', 'Decision summary'],
  'Creative': ['Outline concept', 'First draft', 'Asset pass', 'Feedback review', 'Publish prep'],
  'Admin':    ['Inbox review', 'Document update', 'Schedule review', 'Follow-up list', 'Clean up backlog'],
};

const FALLBACKS = [
  'Define acceptance criteria',
  'Stakeholder sign-off',
  'Write documentation',
  'QA pass',
  'Team retrospective',
  'Schedule review meeting',
  'Assign ownership',
];

export function generateSuggestions(
  goalTitle: string,
  category: string,
  milestoneTitle: string,
  inputText: string,
  existing: string[],
): string[] {
  const context = [goalTitle, milestoneTitle, inputText].join(' ').toLowerCase();
  const used = new Set(existing.map(s => s.toLowerCase().trim()));
  const candidates = new Set<string>();

  for (const [kw, tasks] of Object.entries(KEYWORD_SEEDS)) {
    if (context.includes(kw)) {
      tasks.forEach(t => { if (!used.has(t.toLowerCase())) candidates.add(t); });
    }
  }

  (CATEGORY_SEEDS[category] ?? []).forEach(t => {
    if (!used.has(t.toLowerCase())) candidates.add(t);
  });

  if (candidates.size < 3) {
    FALLBACKS.forEach(t => { if (!used.has(t.toLowerCase())) candidates.add(t); });
  }

  return [...candidates].slice(0, 4);
}
