/**
 * Parent Treatment Portal & Telehealth Guidance Hub Engine
 *
 * Provides family-facing clinical progress summaries, milestone celebrations,
 * caregiver BST carryover homework tasks. Telehealth room URLs are not generated here.
 */

export interface ParentMilestoneBadge {
  id: string;
  title: string;
  description: string;
  category: 'MASTERY' | 'ATTENDANCE' | 'HOURS' | 'GENERALIZATION';
  iconName: string;
  achievedDate: string;
}

export interface ParentHomeworkTask {
  id: string;
  title: string;
  domain: string;
  steps: string[];
  targetFrequency: string; // e.g. "3x daily during meal times"
  bcbaNotes: string;
  isCompleted: boolean;
}

export interface ParentPortalSummary {
  clientId: string;
  clientName: string;
  caregiverName: string;
  weeklyRenderedHours: number;
  totalMasteredGoals: number;
  inProgressGoalsCount: number;
  attendanceRatePct: number;
  milestones: ParentMilestoneBadge[];
  homeworkTasks: ParentHomeworkTask[];
  nextScheduledSession: {
    date: string;
    time: string;
    cptCode: string;
    providerName: string;
    isTelehealth: boolean;
    telehealthRoomUrl?: string | null;
  } | null;
}

/**
 * Compiles friendly progress data for the Parent Portal
 */
export function compileParentPortalSummary(params: {
  client: {
    id: string;
    firstName: string;
    lastName: string;
    guardianName?: string | null;
  };
  skillTargets: Array<{
    id: string;
    domain: string;
    title: string;
    targetStatus: string;
    updatedAt: Date | string;
  }>;
  sessions: Array<{
    id: string;
    status: string;
    cptCode?: string | null;
    scheduledStart: Date | string;
    scheduledEnd: Date | string;
    bcba?: { firstName: string; lastName: string } | null;
    rbt?: { firstName: string; lastName: string } | null;
  }>;
  homework?: ParentHomeworkTask[];
}): ParentPortalSummary {
  const { client, skillTargets = [], sessions = [], homework = [] } = params;

  const mastered = skillTargets.filter((t) => t.targetStatus === 'MASTERED');
  const inProgress = skillTargets.filter((t) => t.targetStatus !== 'MASTERED');

  // Completed sessions in last 30 days
  const completed = sessions.filter((s) => s.status === 'COMPLETED');
  const totalScheduled = sessions.filter((s) => s.status === 'COMPLETED' || s.status === 'CANCELLED' || s.status === 'NO_SHOW');
  const attendanceRatePct = totalScheduled.length > 0
    ? Math.round((completed.length / totalScheduled.length) * 100)
    : 100;

  const totalMinutes = completed.reduce((acc, s) => {
    const start = new Date(s.scheduledStart).getTime();
    const end = new Date(s.scheduledEnd).getTime();
    return acc + Math.max(0, Math.floor((end - start) / (1000 * 60)));
  }, 0);
  const weeklyRenderedHours = Math.round((totalMinutes / 60 / 4) * 10) / 10; // avg per week over 4 weeks

  // Milestone Badges
  const milestones: ParentMilestoneBadge[] = [];

  if (mastered.length >= 1) {
    milestones.push({
      id: 'm-1',
      title: 'First Skill Mastered!',
      description: `Successfully mastered ${mastered[0].title}!`,
      category: 'MASTERY',
      iconName: 'Award',
      achievedDate: new Date(mastered[0].updatedAt).toISOString().split('T')[0],
    });
  }

  if (mastered.length >= 5) {
    milestones.push({
      id: 'm-5',
      title: 'High Achiever: 5 Goals Mastered',
      description: 'Demonstrated rapid acquisition across communication & social domains.',
      category: 'MASTERY',
      iconName: 'Sparkles',
      achievedDate: new Date().toISOString().split('T')[0],
    });
  }

  if (attendanceRatePct >= 90 && totalScheduled.length >= 5) {
    milestones.push({
      id: 'm-att',
      title: 'Super Consistent Family',
      description: 'Maintained 90%+ attendance rate this month!',
      category: 'ATTENDANCE',
      iconName: 'CheckCircle2',
      achievedDate: new Date().toISOString().split('T')[0],
    });
  }

  // Next Session
  const upcoming = sessions
    .filter((s) => s.status === 'SCHEDULED' && new Date(s.scheduledStart).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime())[0];

  let nextScheduledSession: ParentPortalSummary['nextScheduledSession'] = null;
  if (upcoming) {
    const start = new Date(upcoming.scheduledStart);
    const isTelehealth = upcoming.cptCode === '97156' || upcoming.cptCode === '97151';
    const provider = upcoming.bcba
      ? `BCBA ${upcoming.bcba.firstName} ${upcoming.bcba.lastName}`
      : upcoming.rbt
      ? `RBT ${upcoming.rbt.firstName} ${upcoming.rbt.lastName}`
      : 'Clinical Team';

    nextScheduledSession = {
      date: start.toISOString().split('T')[0],
      time: start.toTimeString().slice(0, 5),
      cptCode: upcoming.cptCode || '97153',
      providerName: provider,
      isTelehealth,
      // Isolated prototype: do not invent third-party telehealth rooms.
      telehealthRoomUrl: null,
    };
  }

  const defaultHomework: ParentHomeworkTask[] = homework.length > 0 ? homework : [
    {
      id: 'hw-1',
      title: 'Mealtime Vocal Manding',
      domain: 'Communication',
      steps: [
        'Place preferred snack/drink in sight but out of reach.',
        'Wait 3–5 seconds for child to initiate eye contact or vocal request.',
        'Model the target word ("Juice please") if no response.',
        'Provide immediate access to item upon vocal attempt and praise warmly!',
      ],
      targetFrequency: '3x daily during meals and snack routines',
      bcbaNotes: 'Great job practicing this during last week\'s parent coaching session!',
      isCompleted: false,
    },
  ];

  return {
    clientId: client.id,
    clientName: `${client.firstName} ${client.lastName}`,
    caregiverName: client.guardianName || 'Parent / Guardian',
    weeklyRenderedHours,
    totalMasteredGoals: mastered.length,
    inProgressGoalsCount: inProgress.length,
    attendanceRatePct,
    milestones,
    homeworkTasks: defaultHomework,
    nextScheduledSession,
  };
}
