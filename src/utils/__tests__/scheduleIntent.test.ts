import { describe, expect, it } from 'vitest';
import {
  hasExplicitSchedulePlanIntent,
  hasEstimateOrRoutineIntent,
  hasTaskConfigurationIntent,
  wantsOverdueTaskList,
  wantsScheduleDayView,
} from '../../../server/services/scheduleIntent.js';

describe('hasExplicitSchedulePlanIntent', () => {
  it('does not treat diagnostic schedule questions as plan requests', () => {
    expect(hasExplicitSchedulePlanIntent('check my Tuesday schedule and break it down')).toBe(false);
    expect(hasExplicitSchedulePlanIntent('check schedule tomorrow with indicators')).toBe(false);
    expect(hasExplicitSchedulePlanIntent('analyze my week with indications')).toBe(false);
    expect(hasExplicitSchedulePlanIntent('show my capacity and how much each task takes')).toBe(false);
    expect(hasExplicitSchedulePlanIntent('show me a schedule')).toBe(false);
    expect(hasExplicitSchedulePlanIntent(
      'lay out all my scheduled tasks of the week in terms of due dates',
    )).toBe(false);
    expect(hasExplicitSchedulePlanIntent('Smart review my entire schedule and audit every task')).toBe(false);
    expect(hasExplicitSchedulePlanIntent('Perform a proactive smart review of my entire planning system, then propose reviewable task breakdowns')).toBe(false);
  });

  it('allows explicit requests for a new schedule', () => {
    expect(hasExplicitSchedulePlanIntent('plan my week')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('make me a new schedule for Tuesday')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('fit my tasks in before Friday')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('suggest a schedule for tomorrow')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('plan tmrw')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('move all my Tuesday tasks between Wednesday and Thursday')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('move all mt tuesday task between wednesday and thirsday')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('Fix Incomplete Schedule 2h Resis and check whats missing and what to do I want this to be done on thursday around 7am')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('schedule all my Fix Courses tasks to next Monday and update their due dates accordingly')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('set them in the next monday calendar starting 9 am')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('fix errors make it for friday')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('bioprinting make it for today at 2 pm')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('incomplete courses make it for saturday at 11 am')).toBe(true);
    expect(hasExplicitSchedulePlanIntent('smart review my schedule and reschedule anything that will not fit')).toBe(true);
    expect(hasExplicitSchedulePlanIntent(
      'lay out my tasks by due dates, then reschedule the ones that will not fit',
    )).toBe(true);
  });
});

describe('task configuration intent', () => {
  const exactRegression = 'the finish 60 questiosn needs around 60 hours make it 2 hours a day over the whole month push the deadline to aug 30';

  it('keeps compound estimate, routine, and deadline commands out of the generic planner', () => {
    expect(hasTaskConfigurationIntent(exactRegression)).toBe(true);
    expect(hasEstimateOrRoutineIntent(exactRegression)).toBe(true);
  });

  it('does not mistake an ordinary schedule layout request for task configuration', () => {
    expect(hasTaskConfigurationIntent('plan my week around my meetings')).toBe(false);
    expect(hasEstimateOrRoutineIntent('move all Tuesday tasks to Friday')).toBe(false);
  });
});

describe('wantsScheduleDayView', () => {
  it('detects diagnostic day schedule requests', () => {
    expect(wantsScheduleDayView('check my tuesday schedule')).toBe(true);
    expect(wantsScheduleDayView('show me my shcueke for teusday')).toBe(true);
    expect(wantsScheduleDayView('look into today like a calendar')).toBe(true);
    expect(wantsScheduleDayView('whats for tmrw')).toBe(true);
    expect(wantsScheduleDayView("what's for tmr")).toBe(true);
    expect(wantsScheduleDayView('what due next monday')).toBe(true);
    expect(wantsScheduleDayView("what's scheduled next monday")).toBe(true);
  });

  it('does not collapse whole-schedule or multi-day reviews into one day', () => {
    expect(wantsScheduleDayView('Analyze my current schedule right now')).toBe(false);
    expect(wantsScheduleDayView('whats for next week break down the due dates of everything day by day')).toBe(false);
    expect(wantsScheduleDayView('show my entire week')).toBe(false);
    expect(wantsScheduleDayView('review the next 7 days')).toBe(false);
  });

  it('does not trigger for explicit planning requests', () => {
    expect(wantsScheduleDayView('plan my tuesday schedule')).toBe(false);
    expect(wantsScheduleDayView('make me a new schedule')).toBe(false);
    expect(wantsScheduleDayView('I want this task to be done on thursday around 7am')).toBe(false);
  });

  it('does not hijack create-goal prompts that mention dates or open deadlines', () => {
    expect(wantsScheduleDayView(
      'Create a new goal called Research Goals, deadline is open, starts tomorrow, first task due next monday is Talk to Professor Joseph Constantine',
    )).toBe(false);
    expect(wantsScheduleDayView('add a task due monday')).toBe(false);
  });
});

describe('wantsOverdueTaskList', () => {
  it('detects direct overdue inspection requests', () => {
    expect(wantsOverdueTaskList('show my overdue tasks')).toBe(true);
    expect(wantsOverdueTaskList('any overdue?')).toBe(true);
    expect(wantsOverdueTaskList('overdue')).toBe(true);
  });

  it('does not hijack a whole-system smart review', () => {
    expect(wantsOverdueTaskList(
      'Perform a proactive smart review of my entire planning system. Prioritize overdue, blocked, stale, or likely-to-slip work.',
    )).toBe(false);
  });

  it('does not treat an overdue mutation as a list request', () => {
    expect(wantsOverdueTaskList('mark this task overdue')).toBe(false);
  });
});
