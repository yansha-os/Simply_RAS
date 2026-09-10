/** Pure ATS types/helpers — must NOT live in a `'use server'` file. */

export type AtsStage =
  | 'APPLIED'
  | 'PHONE_SCREEN'
  | 'INTERVIEW'
  | 'OFFER'
  | 'HIRED'
  | 'HELP_DESK'
  | 'REJECTED';

export type AtsActivationStatus =
  | 'PENDING_HR_REVIEW'
  | 'INVITATION_SENT'
  | 'ACTIVE'
  | 'REJECTED';

export type CandidateProgressFlags = {
  tasksDone?: boolean;
  availabilityDone?: boolean;
  simulationDone?: boolean;
  interviewBooked?: boolean;
  interviewPassed?: boolean;
  certUploaded?: boolean;
  backgroundCleared?: boolean;
  clearedForHire?: boolean;
  helpDeskOpen?: boolean;
};

/** Extra packet fields that travel with progress updates (Phase 1). */
export type OnboardingProgressPatch = CandidateProgressFlags & {
  tasksCompletedSteps?: number[];
  availabilityGrid?: unknown;
  preferredBoroughs?: string[];
  transportation?: string | null;
  maxTravelMiles?: number | null;
};

export interface OnboardingProgressSnapshot {
  tasksDone: boolean;
  tasksCompletedSteps: number[];
  availabilityDone: boolean;
  availabilityGrid: unknown;
  preferredBoroughs: string[];
  transportation: string | null;
  maxTravelMiles: number | null;
  simulationDone: boolean;
  interviewBooked: boolean;
  interviewPassed: boolean;
  certUploaded: boolean;
  backgroundCleared: boolean;
  clearedForHire: boolean;
  helpDeskOpen: boolean;
}

export interface AtsCandidateData {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleApplied: 'RBT' | 'BCBA' | 'ADMIN';
  stage: AtsStage;
  experienceYears: number;
  appliedDate: string;
  activationStatus: AtsActivationStatus;
  userId?: string | null;
  reqTasks?: boolean;
  reqAvail?: boolean;
  reqSim?: boolean;
  interviewBooked?: boolean;
  reqInterview?: boolean;
  reqCount?: number;
  certUploaded?: boolean;
  backgroundCleared?: boolean;
  helpTicketId?: string | null;
  helpTicketCategory?: string | null;
  helpTicketMessage?: string | null;
  helpTicketStatus?: string | null;
  helpTicketClaimedByUserId?: string | null;
}

export type PacketProgressSource = {
  tasksDone?: boolean | null;
  availabilityDone?: boolean | null;
  simulationDone?: boolean | null;
  interviewBooked?: boolean | null;
  interviewPassed?: boolean | null;
  certUploaded?: boolean | null;
  backgroundCleared?: boolean | null;
  clearedForHire?: boolean | null;
  tasksCompletedSteps?: unknown;
  availabilityGrid?: unknown;
  preferredBoroughs?: unknown;
  transportation?: string | null;
  maxTravelMiles?: number | null;
} | null;

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is number => typeof n === 'number');
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === 'string');
}

/** Legacy: dossier.progress (pre–Phase 1). Prefer packet columns. */
export function readProgress(dossier: unknown): CandidateProgressFlags {
  const root = asRecord(dossier);
  const progress = asRecord(root.progress);
  return {
    tasksDone: progress.tasksDone === true,
    availabilityDone: progress.availabilityDone === true,
    simulationDone: progress.simulationDone === true,
    interviewBooked: progress.interviewBooked === true,
    interviewPassed: progress.interviewPassed === true,
    certUploaded: progress.certUploaded === true,
    backgroundCleared: progress.backgroundCleared === true,
    clearedForHire: progress.clearedForHire === true,
    helpDeskOpen: progress.helpDeskOpen === true,
  };
}

export function readProgressFromPacket(
  packet: PacketProgressSource,
  dossier?: unknown
): CandidateProgressFlags {
  if (packet) {
    return {
      tasksDone: packet.tasksDone === true,
      availabilityDone: packet.availabilityDone === true,
      simulationDone: packet.simulationDone === true,
      interviewBooked: packet.interviewBooked === true,
      interviewPassed: packet.interviewPassed === true,
      certUploaded: packet.certUploaded === true,
      backgroundCleared: packet.backgroundCleared === true,
      clearedForHire: packet.clearedForHire === true,
      // help desk still Phase 3 — keep dossier fallback
      helpDeskOpen: readProgress(dossier).helpDeskOpen === true,
    };
  }
  return readProgress(dossier);
}

export function snapshotFromPacket(
  packet: PacketProgressSource,
  dossier?: unknown
): OnboardingProgressSnapshot {
  const flags = readProgressFromPacket(packet, dossier);
  const miles =
    typeof packet?.maxTravelMiles === 'number' && Number.isFinite(packet.maxTravelMiles)
      ? packet.maxTravelMiles
      : null;

  return {
    tasksDone: !!flags.tasksDone,
    tasksCompletedSteps: asNumberArray(packet?.tasksCompletedSteps),
    availabilityDone: !!flags.availabilityDone,
    availabilityGrid: packet?.availabilityGrid ?? [],
    preferredBoroughs: asStringArray(packet?.preferredBoroughs),
    transportation: packet?.transportation ?? null,
    maxTravelMiles: miles,
    simulationDone: !!flags.simulationDone,
    interviewBooked: !!flags.interviewBooked,
    interviewPassed: !!flags.interviewPassed,
    certUploaded: !!flags.certUploaded,
    backgroundCleared: !!flags.backgroundCleared,
    clearedForHire: !!flags.clearedForHire,
    helpDeskOpen: !!flags.helpDeskOpen,
  };
}

/**
 * Pipeline placement rules (HR Agent board):
 * - APPLIED until HR approves/invites
 * - INTERVIEW while interview is booked and not yet evaluated
 * - OFFER when all 5 requirements are complete (tasks, availability, sim, interview, 40-hr cert)
 * - HELP_DESK when a help ticket is open
 * - otherwise PHONE_SCREEN (In Progress) after invite
 */
export function deriveAtsStage(input: {
  activationStatus: string;
  currentStage: string;
  progress: CandidateProgressFlags;
}): AtsStage {
  if (input.currentStage === 'HIRED') return 'HIRED';
  if (input.currentStage === 'REJECTED' || input.activationStatus === 'REJECTED') {
    return 'REJECTED';
  }
  if (input.activationStatus === 'PENDING_HR_REVIEW') {
    return 'APPLIED';
  }
  if (input.progress.helpDeskOpen) return 'HELP_DESK';
  // OFFER can also be an explicit, role-gated HR decision. Progress refreshes
  // may derive a new OFFER, but must not undo an existing staff transition.
  if (input.currentStage === 'OFFER') return 'OFFER';

  const allFive =
    !!input.progress.tasksDone &&
    !!input.progress.availabilityDone &&
    !!input.progress.simulationDone &&
    !!input.progress.interviewPassed &&
    !!input.progress.certUploaded;

  if (allFive) return 'OFFER';

  if (input.progress.interviewBooked && !input.progress.interviewPassed) {
    return 'INTERVIEW';
  }

  return 'PHONE_SCREEN';
}

/** Active kanban columns (excludes HIRED / REJECTED — those leave the live funnel). */
export type AtsPipelineColumnKey = Exclude<AtsStage, 'HIRED' | 'REJECTED'>;

export type AtsPipelineColumn = {
  key: AtsPipelineColumnKey;
  title: string;
  shortLabel: string;
  /** Tailwind classes for the column header badge */
  badgeClass: string;
};

/** Canonical LIVE pipeline order — matches `deriveAtsStage` outcomes. */
export const ATS_PIPELINE_COLUMNS: AtsPipelineColumn[] = [
  {
    key: 'APPLIED',
    title: 'Applied',
    shortLabel: 'HR Review',
    badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  },
  {
    key: 'PHONE_SCREEN',
    title: 'In Progress',
    shortLabel: 'Onboarding',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  },
  {
    key: 'INTERVIEW',
    title: 'Interview',
    shortLabel: 'Booked',
    badgeClass: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
  },
  {
    key: 'OFFER',
    title: 'Offer',
    shortLabel: 'Ready to hire',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  },
  {
    key: 'HELP_DESK',
    title: 'Help Desk',
    shortLabel: 'Open ticket',
    badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-400',
  },
];

/** Display columns for the LIVE board. Help Desk only when someone is actually there. */
export function getAtsPipelineColumns(opts?: {
  includeHelpDesk?: boolean;
}): AtsPipelineColumn[] {
  const includeHelpDesk = opts?.includeHelpDesk === true;
  return ATS_PIPELINE_COLUMNS.filter(
    (col) => col.key !== 'HELP_DESK' || includeHelpDesk
  );
}

export function activationStatusLabel(
  status: string
): { label: string; tone: 'pending' | 'invited' | 'active' | 'rejected' } {
  if (status === 'ACTIVE' || status === 'ACCOUNT_ACTIVE') {
    return { label: 'Active', tone: 'active' };
  }
  if (status === 'INVITATION_SENT') {
    return { label: 'Invited', tone: 'invited' };
  }
  if (status === 'REJECTED') {
    return { label: 'Rejected', tone: 'rejected' };
  }
  return { label: 'Pending HR', tone: 'pending' };
}
