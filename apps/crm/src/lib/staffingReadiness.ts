/**
 * Case Coord staffing readiness — checklist before posting a CaseOpening,
 * through RBT assign / parent approve, to first-session schedule.
 * ACTIVE requires a durable first Session (Bridge E); staffing accept alone never activates.
 */

export type StaffingReadinessItemId =
  | 'signed_tp'
  | 'treatment_pa'
  | 'bcba'
  | 'schedule_prefs'
  | 'opening'
  | 'rbt_assigned'
  | 'rbt_approved'
  | 'first_session';

export type StaffingReadinessItem = {
  id: StaffingReadinessItemId;
  label: string;
  met: boolean;
  detail?: string;
  /** Required before Case Coord may publish a CaseOpening */
  requiredForPost: boolean;
};

export type StaffingNextActionKind =
  | 'blocked'
  | 'publish_opening'
  | 'review_applicants'
  | 'await_parent'
  | 'schedule_first_session'
  | 'activate'
  | 'active';

export type StaffingNextAction = {
  kind: StaffingNextActionKind;
  label: string;
  /** Unmet post-gate labels when kind === 'blocked' */
  blockers?: string[];
};

export type StaffingReadiness = {
  items: StaffingReadinessItem[];
  /** Post-opening prerequisites met (signed TP, Treatment PA, BCBA, schedule prefs). */
  ready: boolean;
  canPostOpening: boolean;
  /** Matches Bridge E schedule gate: STAFFING_PENDING + RBT + BCBA. */
  canScheduleFirstSession: boolean;
  nextAction: StaffingNextAction;
};

function parseTreatmentPlan(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

export type StaffingReadinessClient = {
  status?: string | null;
  bcbaId?: string | null;
  rbtId?: string | null;
  rbtApproved?: boolean | null;
  treatmentPlan?: unknown;
  paRequests?: Array<{ type?: string | null; status?: string | null }> | null;
  authorizations?: Array<{ type?: string | null; status?: string | null }> | null;
  caseOpenings?: Array<{ id?: string; status?: string | null }> | null;
  sessions?: Array<{ cptCode?: string | null; status?: string | null }> | null;
};

function hasTherapySession(client: StaffingReadinessClient): boolean {
  return (client.sessions || []).some((s) => (s.cptCode || '') !== '97151');
}

function resolveNextAction(input: {
  status: string;
  canPost: boolean;
  hasOpenListing: boolean;
  hasAnyOpening: boolean;
  rbtAssigned: boolean;
  rbtApproved: boolean;
  bcbaAssigned: boolean;
  hasFirstSession: boolean;
  postBlockers: string[];
}): StaffingNextAction {
  const { status } = input;

  if (status === 'ACTIVE') {
    return {
      kind: 'active',
      label: 'Client is ACTIVE — Bridge E complete. Staffing accept never set this alone.',
    };
  }

  if (input.hasFirstSession && status === 'STAFFING_PENDING') {
    return {
      kind: 'activate',
      label: 'First therapy session is on file — activate after first session (Bridge E).',
    };
  }

  if (
    status === 'STAFFING_PENDING' &&
    input.rbtAssigned &&
    input.bcbaAssigned &&
    input.rbtApproved
  ) {
    return {
      kind: 'schedule_first_session',
      label: 'Staffing complete — schedule the first therapy session (97153).',
    };
  }

  if (input.rbtAssigned && !input.rbtApproved) {
    return {
      kind: 'await_parent',
      label: 'RBT dispatched — waiting on parent approval before scheduling.',
    };
  }

  if (input.hasOpenListing) {
    return {
      kind: 'review_applicants',
      label: 'Opening is live — review applicants, meet, then parent decide.',
    };
  }

  if (input.canPost && (status === 'STAFFING_PENDING' || status === 'ACTIVE')) {
    return {
      kind: 'publish_opening',
      label: 'Ready to publish a CaseOpening on the job board.',
    };
  }

  if (input.hasAnyOpening && !input.rbtAssigned) {
    return {
      kind: 'review_applicants',
      label: 'Prior opening exists — reopen or post a new listing, then staff an RBT.',
    };
  }

  return {
    kind: 'blocked',
    label:
      input.postBlockers.length > 0
        ? `Blocked — finish: ${input.postBlockers.join('; ')}`
        : 'Blocked — client must reach STAFFING_PENDING before posting.',
    blockers: input.postBlockers,
  };
}

export function getStaffingReadiness(client: StaffingReadinessClient): StaffingReadiness {
  const status = client.status || '';
  const tp = parseTreatmentPlan(client.treatmentPlan);
  const hasParentSig = Boolean(tp.parentSignature);
  const hasSchedulePrefs = Boolean(
    tp.preferredSchedule &&
      (typeof tp.preferredSchedule === 'object'
        ? Object.keys(tp.preferredSchedule as object).length > 0
        : true)
  );

  const treatmentPa = (client.paRequests || []).find((p) => p.type === 'TREATMENT');
  const treatmentAuth = (client.authorizations || []).find((a) => a.type === 'TREATMENT');
  const treatmentPaApproved =
    treatmentPa?.status === 'APPROVED' ||
    treatmentAuth?.status === 'APPROVED' ||
    ['TX_PA_APPROVED', 'STAFFING_PENDING', 'ACTIVE'].includes(status);

  const bcbaAssigned = Boolean(client.bcbaId);
  const openings = client.caseOpenings || [];
  const hasOpenListing = openings.some((o) => o.status === 'OPEN');
  const hasFilledOpening = openings.some((o) => o.status === 'FILLED');
  const hasAnyOpening = openings.length > 0;
  const openingMet = hasOpenListing || hasFilledOpening || Boolean(client.rbtId);

  const rbtAssigned = Boolean(client.rbtId);
  const rbtApproved = Boolean(client.rbtId && client.rbtApproved);
  const firstSessionMet = hasTherapySession(client) || status === 'ACTIVE';

  const items: StaffingReadinessItem[] = [
    {
      id: 'signed_tp',
      label: 'Treatment Plan signed by parent',
      met: hasParentSig,
      detail: hasParentSig ? 'Typed-name e-sign on file' : 'Waiting on parent signature',
      requiredForPost: true,
    },
    {
      id: 'treatment_pa',
      label: 'Treatment auth / PA approved',
      met: treatmentPaApproved,
      detail: treatmentPaApproved
        ? treatmentAuth?.status === 'APPROVED'
          ? 'Authorization APPROVED on file'
          : 'Auth tracker / staffing stage shows approved'
        : 'Billing must approve Treatment PA (manual Plutus tracker)',
      requiredForPost: true,
    },
    {
      id: 'bcba',
      label: 'BCBA supervisor assigned',
      met: bcbaAssigned,
      detail: bcbaAssigned ? 'Clinical Director assigned' : 'CD must assign BCBA',
      requiredForPost: true,
    },
    {
      id: 'schedule_prefs',
      label: 'Parent schedule preferences',
      met: hasSchedulePrefs,
      detail: hasSchedulePrefs
        ? 'Preferred weekly schedule saved'
        : 'Parent must complete schedule builder',
      requiredForPost: true,
    },
    {
      id: 'opening',
      label: 'Case opening published',
      met: openingMet,
      detail: hasOpenListing
        ? 'OPEN listing on job board'
        : hasFilledOpening
          ? 'Opening FILLED'
          : client.rbtId
            ? 'RBT on file (opening may be closed)'
            : 'Post a CaseOpening from Job Board',
      requiredForPost: false,
    },
    {
      id: 'rbt_assigned',
      label: 'RBT assigned',
      met: rbtAssigned,
      detail: rbtAssigned ? 'Client.rbtId set' : 'Parent accept or assign after meet & greet',
      requiredForPost: false,
    },
    {
      id: 'rbt_approved',
      label: 'RBT parent-approved',
      met: rbtApproved,
      detail: rbtApproved
        ? 'Parent accepted candidate'
        : rbtAssigned
          ? 'Awaiting parent approval (rbtApproved)'
          : 'Needs assigned RBT first',
      requiredForPost: false,
    },
    {
      id: 'first_session',
      label: 'First therapy session on file',
      met: firstSessionMet,
      detail: firstSessionMet
        ? status === 'ACTIVE'
          ? 'ACTIVE — Bridge E complete'
          : 'Durable 97153 session scheduled'
        : 'Schedule first session — does not auto-set ACTIVE',
      requiredForPost: false,
    },
  ];

  const postItems = items.filter((i) => i.requiredForPost);
  const canPostOpening = postItems.every((i) => i.met);
  const postBlockers = postItems.filter((i) => !i.met).map((i) => i.label);

  const canScheduleFirstSession =
    status === 'STAFFING_PENDING' && rbtAssigned && rbtApproved && bcbaAssigned;

  const nextAction = resolveNextAction({
    status,
    canPost: canPostOpening,
    hasOpenListing,
    hasAnyOpening,
    rbtAssigned,
    rbtApproved,
    bcbaAssigned,
    hasFirstSession: hasTherapySession(client),
    postBlockers,
  });

  return {
    items,
    ready: canPostOpening,
    canPostOpening,
    canScheduleFirstSession,
    nextAction,
  };
}

/** Stages where Clinical Director may assign a supervising BCBA (after Assessment PA). */
export const BCBA_ASSIGN_ELIGIBLE_STATUSES = [
  'PA_APPROVED',
  'ASSESSMENT_SCHEDULED',
  'REPORT_ASSEMBLED',
  'TX_PA_SUBMITTED',
  'TX_PA_APPROVED',
  'STAFFING_PENDING',
  'ACTIVE',
] as const;

export function canAssignBcbaAtStatus(status: string | null | undefined): boolean {
  return BCBA_ASSIGN_ELIGIBLE_STATUSES.includes(
    status as (typeof BCBA_ASSIGN_ELIGIBLE_STATUSES)[number]
  );
}
