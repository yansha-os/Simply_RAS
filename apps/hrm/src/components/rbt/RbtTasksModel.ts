import {
  getOnboardingDoc,
  isOnboardingCompletionEvent,
  ONBOARDING_TOTAL_STEPS,
} from '@/lib/onboardingDocuments';

export type TaskKind = 'ONBOARDING' | 'PAY_HOLD' | 'JOB_APP';
export type TaskFilter = 'ALL' | TaskKind;
export type TaskSurface = 'LIVE' | 'ONBOARDING' | 'DENIED';

export type TaskItem = {
  id: string;
  kind: TaskKind;
  priority: number;
  title: string;
  detail: string;
  meta?: string;
  dueAt?: string;
  href: string;
  cta: string;
  tone: 'amber' | 'rose' | 'sky' | 'emerald';
};

export type OnboardingTaskProgress = {
  tasksDone: boolean;
  tasksCompletedSteps: number[];
  availabilityDone: boolean;
  simulationDone: boolean;
  interviewBooked: boolean;
  interviewPassed: boolean;
  certUploaded: boolean;
};

export type PayrollTaskSource = {
  sessionId: string;
  noteId: string | null;
  clientName: string;
  cptCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  rbtSigned: boolean;
  bcbaSigned: boolean;
  isConverted: boolean;
  payable: boolean;
  holdReason: string | null;
};

export type CaseApplicationTaskSource = {
  id: string;
  status: string;
  opening?: {
    caseCode?: string | null;
    clientInitials?: string | null;
    borough?: string | null;
  } | null;
};

const APP_STATUS_LABEL: Record<string, string> = {
  APPLIED: 'Applied — waiting on Case Coord',
  MESSAGING: 'In conversation with Case Coord',
  MEET_SCHEDULED: 'Meet & greet scheduled',
  PARENT_PENDING: 'Parent reviewing fit',
  APPROVED: 'Assigned to this family',
  REJECTED: 'Not selected',
  WITHDRAWN: 'Withdrawn',
};

const EASTERN_DATE_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function resolveTaskSurface(role: string): TaskSurface {
  if (role === 'RBT') return 'LIVE';
  if (role === 'APPLICANT') return 'ONBOARDING';
  return 'DENIED';
}

export function mergeCompletedTaskSteps(...sources: number[][]): number[] {
  return Array.from(
    new Set(
      sources
        .flat()
        .filter(
          (step) =>
            Number.isInteger(step) &&
            step >= 1 &&
            step <= ONBOARDING_TOTAL_STEPS
        )
    )
  ).sort((left, right) => left - right);
}

export function completedTaskStepsFromAudit(
  events: Array<{ stepNumber: number; actionType: string }>
): number[] {
  return mergeCompletedTaskSteps(
    events
      .filter(isOnboardingCompletionEvent)
      .map((event) => event.stepNumber)
  );
}

export function formatTaskDateEt(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return `${EASTERN_DATE_TIME.format(date)} ET`;
}

function payHoldDeadline(row: PayrollTaskSource): {
  dueAt?: string;
  meta: string;
} {
  const endMs = Date.parse(row.scheduledEnd);
  if (Number.isNaN(endMs)) {
    return { meta: `Session ${formatTaskDateEt(row.scheduledStart)}` };
  }
  const dueAt = new Date(endMs + 24 * 60 * 60 * 1000).toISOString();
  return { dueAt, meta: `Due ${formatTaskDateEt(dueAt)}` };
}

function isRbtOwnedPayHold(row: PayrollTaskSource): boolean {
  if (row.payable || !['COMPLETED', 'IN_PROGRESS'].includes(row.status)) return false;
  if (!row.noteId || !row.rbtSigned) return true;
  return row.holdReason?.toLowerCase().includes('checklist') ?? false;
}

function payHoldLink(row: PayrollTaskSource): { href: string; cta: string } {
  if (!row.noteId) {
    return {
      href: `/rbt/session/${row.sessionId}`,
      cta: 'Complete session note',
    };
  }
  if (!row.rbtSigned) {
    return {
      href: `/rbt/session/${row.sessionId}`,
      cta: 'Finish & sign note',
    };
  }
  return {
    href: `/rbt/session/${row.sessionId}`,
    cta: 'Fix note checklist',
  };
}

export function buildOnboardingTasks(progress: OnboardingTaskProgress): TaskItem[] {
  const items: TaskItem[] = [];
  const completed = new Set(progress.tasksCompletedSteps || []);
  const incompleteSteps = Array.from(
    { length: ONBOARDING_TOTAL_STEPS },
    (_, index) => index + 1
  ).filter((step) => !completed.has(step));

  if (!progress.tasksDone && incompleteSteps.length > 0) {
    const next = incompleteSteps[0];
    const doc = getOnboardingDoc(next);
    items.push({
      id: `onboarding-step-${next}`,
      kind: 'ONBOARDING',
      priority: 10,
      title: `Finish onboarding · Step ${next}`,
      detail: doc?.title
        ? `${doc.title} — ${incompleteSteps.length} document step(s) still open.`
        : `${incompleteSteps.length} onboarding document step(s) still open.`,
      meta: `${completed.size}/${ONBOARDING_TOTAL_STEPS} signed`,
      href: '/rbt/documents',
      cta: 'Open documents',
      tone: 'amber',
    });
  }

  if (!progress.interviewPassed) {
    items.push({
      id: 'onboarding-interview',
      kind: 'ONBOARDING',
      priority: 20,
      title: progress.interviewBooked
        ? 'HR interview awaiting evaluation'
        : 'Book HR interview',
      detail: progress.interviewBooked
        ? 'Slot booked — waiting for HR to submit their evaluation.'
        : 'Schedule and complete your HR onboarding interview.',
      href: '/rbt/interview',
      cta: 'Open interview',
      tone: 'amber',
    });
  }

  if (!progress.availabilityDone) {
    items.push({
      id: 'onboarding-availability',
      kind: 'ONBOARDING',
      priority: 30,
      title: 'Set weekly availability',
      detail: 'Submit preferred hours and travel so Case Coord can match openings.',
      href: '/rbt/availability',
      cta: 'Set availability',
      tone: 'amber',
    });
  }

  if (!progress.simulationDone) {
    items.push({
      id: 'onboarding-simulation',
      kind: 'ONBOARDING',
      priority: 40,
      title: 'Complete data collection simulation',
      detail: 'Pass the 10-trial simulator before clearance.',
      href: '/rbt/simulation',
      cta: 'Open simulation',
      tone: 'amber',
    });
  }

  if (!progress.certUploaded) {
    items.push({
      id: 'onboarding-cert',
      kind: 'ONBOARDING',
      priority: 50,
      title: 'Upload 40-hour RBT certificate',
      detail: 'BACB 40-hour course certificate is still missing from your file.',
      href: '/rbt/documents',
      cta: 'Upload certificate',
      tone: 'amber',
    });
  }

  return items;
}

export function buildPayHoldTasks(sessions: PayrollTaskSource[]): TaskItem[] {
  return sessions.filter(isRbtOwnedPayHold).map((row): TaskItem => {
    const link = payHoldLink(row);
    const deadline = payHoldDeadline(row);
    return {
      id: `pay-db-${row.sessionId}`,
      kind: 'PAY_HOLD',
      priority: 5,
      title: row.holdReason || 'Session documentation needs attention',
      detail: `${row.clientName} · CPT ${row.cptCode}. ${
        !row.noteId
          ? 'No session note is on file.'
          : !row.rbtSigned
            ? 'Your signature is incomplete.'
            : 'The billing checklist needs correction.'
      }`,
      meta: deadline.meta,
      dueAt: deadline.dueAt,
      href: link.href,
      cta: link.cta,
      tone: 'rose',
    };
  });
}

export function buildJobAppTasks(
  applications: CaseApplicationTaskSource[]
): TaskItem[] {
  return applications
    .filter(
      (application) =>
        !['REJECTED', 'WITHDRAWN', 'APPROVED'].includes(application.status)
    )
    .map((application): TaskItem => {
      const code = application.opening?.caseCode || 'Case';
      const initials = application.opening?.clientInitials || '—';
      const borough = application.opening?.borough || 'NYC';
      const label = APP_STATUS_LABEL[application.status] || application.status;
      const href =
        application.status === 'MESSAGING' ||
        application.status === 'MEET_SCHEDULED'
          ? '/rbt/communication'
          : '/rbt/job-board';

      return {
        id: `job-db-${application.id}`,
        kind: 'JOB_APP',
        priority: 15,
        title: `Case ${code} · ${initials}`,
        detail: label,
        meta: borough,
        href,
        cta: href.includes('communication')
          ? 'Open messages'
          : 'View job board',
        tone: application.status === 'PARENT_PENDING' ? 'amber' : 'sky',
      };
    });
}

export function filterTasks(
  tasks: TaskItem[],
  filter: TaskFilter
): TaskItem[] {
  if (filter === 'ALL') return tasks;
  return tasks.filter((task) => task.kind === filter);
}

export function sortTaskItems(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((left, right) => {
    const priorityDelta = left.priority - right.priority;
    if (priorityDelta !== 0) return priorityDelta;

    if (left.dueAt && right.dueAt) {
      const dueDelta = Date.parse(left.dueAt) - Date.parse(right.dueAt);
      if (dueDelta !== 0) return dueDelta;
    } else if (left.dueAt) {
      return -1;
    } else if (right.dueAt) {
      return 1;
    }

    return left.title.localeCompare(right.title);
  });
}
