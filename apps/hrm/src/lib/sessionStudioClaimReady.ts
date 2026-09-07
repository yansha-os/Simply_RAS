/**
 * SoT claim-ready / note-quality gate for Session Studio (97153).
 * Aligns to docs/superpowers/specs/2026-08-11-aba-session-note-data-collection-spec.md §4.2 + §6.3.
 *
 * Hard blocks stop claim-ready `rbtSigned` submit.
 * Warnings surface in UI but do not block payroll Incomplete path.
 */

import {
  buildBillingChecklist,
  isDemoStudioTargetId,
  type BillingCheckItem,
  type BillingCheckKey,
  type StudioDurationEpisode,
  type StudioFrequency,
  type StudioProbe,
  type StudioTaskAnalysis,
  type StudioTrial,
} from '@/lib/sessionStudio';

/** SoT §4.2 / §6.3 character floors */
export const CLAIM_READY_MIN = {
  CLIENT_RESPONSE: 40,
  PLAN_NEXT: 20,
  OBJECTIVE_DATA: 20,
  BARRIERS: 4,
  SIGNATURE: 2,
  CAREGIVER_NAME: 2,
  CAREGIVER_PARTICIPATION: 20,
} as const;

/** Human-readable list of minimums enforced for claim-ready submit */
export const CLAIM_READY_MINIMUM_FIELDS = [
  'Start + end times (EVV)',
  'Billable units ≥ 1 (8-minute rule)',
  'CPT + place of service',
  'Caregiver present Y/N (+ name if Yes)',
  '≥1 objective datum (trial / freq / duration / TA / probe)',
  'Objective data summary (≥20 chars)',
  '≥1 procedure by protocol',
  `Client response (≥${CLAIM_READY_MIN.CLIENT_RESPONSE} chars, substantive — not vague-only)`,
  `Barriers / safety (≥${CLAIM_READY_MIN.BARRIERS} chars, “None noted” OK)`,
  'Caregiver participation when present (≥20 chars)',
  `Plan for next session (≥${CLAIM_READY_MIN.PLAN_NEXT} chars, concrete)`,
  'Durable TP targets (not Dev demo t#/b# ids)',
  'RBT typed-name signature',
  'Caregiver typed-name signature (agency payroll gate)',
] as const;

export type ClaimReadyGapSeverity = 'block' | 'warn';

export type ClaimReadyGap = {
  key: BillingCheckKey | 'CAREGIVER_PARTICIPATION' | 'GOALS_LABEL';
  severity: ClaimReadyGapSeverity;
  label: string;
  /** Premium microcopy shown in Studio */
  microcopy: string;
  howToFix: string;
};

export type ClaimReadyEvalInput = {
  clockedIn: boolean;
  clockedOut: boolean;
  cptCode: string;
  placeOfService: string;
  caregiverPresent: 'YES' | 'NO' | '';
  caregiverName?: string;
  caregiverParticipation?: string;
  goalsAddressed?: string;
  /** True when Collect used only demo t#/b# ids — blocks claim-ready. */
  usesDemoTargetsOnly?: boolean;
  trials: StudioTrial[];
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
  objectiveData: string;
  interventions: string[];
  clientResponse: string;
  barriersSafety: string;
  planNext: string;
  rbtSignature: string;
  caregiverSignature: string;
  sessionSeconds: number;
};

export type ClaimReadyEvaluation = {
  claimReady: boolean;
  checklist: BillingCheckItem[];
  blocks: ClaimReadyGap[];
  warnings: ClaimReadyGap[];
  readyCount: number;
  totalCount: number;
  /** Stable list for docs / API responses */
  minimumFields: readonly string[];
};

const MICROCOPY: Record<
  BillingCheckKey,
  { label: string; microcopy: string; howToFix: string }
> = {
  SESSION_TIME: {
    label: 'Start / end time',
    microcopy: 'Payers defend units from exact clock times — finish EVV clock-out before signing.',
    howToFix: 'Clock in, run the session, then clock out so start and end are recorded.',
  },
  UNITS: {
    label: 'Billable units',
    microcopy: 'Under 8 minutes yields 0 units. Claim-ready needs at least one 15-min unit.',
    howToFix: 'Confirm session length meets the 8-minute rule (or close Incomplete if truly short).',
  },
  CPT_POS: {
    label: 'CPT + place of service',
    microcopy: 'Clean claims need a CPT and a CMS place-of-service — both are on the clock-in card.',
    howToFix: 'Set CPT (usually 97153) and place of service on the Clock-in step.',
  },
  PERSONS_PRESENT: {
    label: 'Persons present',
    microcopy: 'Document whether a caregiver was present. If yes, include their name for attestation.',
    howToFix: 'Choose Caregiver Yes/No; when Yes, type the caregiver’s name (≥2 characters).',
  },
  GOALS_DATA: {
    label: 'Goals + objective data',
    microcopy:
      'Medical necessity needs ≥1 measurable datum and a short objective summary — narrative alone is not enough.',
    howToFix:
      'Log at least one trial, frequency, duration, TA step, or probe, then write ≥20 characters of objective data.',
  },
  INTERVENTIONS: {
    label: 'Procedures by protocol',
    microcopy: 'Name the ABA procedures you actually ran (DTT, NET, DR, prompt fade…).',
    howToFix: 'On the Note step, select at least one intervention chip.',
  },
  CLIENT_RESPONSE: {
    label: 'Client response',
    microcopy: `Skip “good session.” Write how the learner responded (≥${CLAIM_READY_MIN.CLIENT_RESPONSE} characters, substantive).`,
    howToFix: `Expand Client response (≥${CLAIM_READY_MIN.CLIENT_RESPONSE} chars) with measurable response — not vague-only phrasing.`,
  },
  BARRIERS: {
    label: 'Barriers / safety',
    microcopy: 'Always address barriers — “None noted” is fine when truly clear.',
    howToFix: `Enter barriers/safety (≥${CLAIM_READY_MIN.BARRIERS} characters).`,
  },
  CAREGIVER_DEBRIEF: {
    label: 'Caregiver participation',
    microcopy:
      'Caregiver was present — debrief / coaching narrative is required for claim-ready (SoT §4.4).',
    howToFix: `Add ≥${CLAIM_READY_MIN.CAREGIVER_PARTICIPATION} characters on caregiver participation.`,
  },
  PLAN_NEXT: {
    label: 'Plan for next session',
    microcopy: 'Continuity of care needs a concrete next-session plan (not vague-only).',
    howToFix: `Write a concrete plan (≥${CLAIM_READY_MIN.PLAN_NEXT} characters) on the Note step.`,
  },
  RBT_SIGN: {
    label: 'RBT signature',
    microcopy: 'Your typed name is the rendering-provider attestation for this note.',
    howToFix: 'Type your full name in the RBT signature field.',
  },
  CAREGIVER_SIGN: {
    label: 'Caregiver signature',
    microcopy:
      'This agency holds payroll until caregiver attestation is on file (many MCO contracts agree).',
    howToFix: 'Capture the caregiver/guardian typed-name signature on the Sign step.',
  },
  DURABLE_TARGETS: {
    label: 'Durable TP targets',
    microcopy:
      'Dev demo targets (t1/b1…) stay JSON-only — claim-ready needs CRM SkillTargets / BehaviorTargets.',
    howToFix: 'Reload Collect after syncing Clinical Goals, or close Incomplete. Clear demo targets first.',
  },
};

function caregiverDocumented(
  caregiverPresent: 'YES' | 'NO' | '',
  caregiverName?: string
): boolean {
  if (caregiverPresent === 'NO') return true;
  if (caregiverPresent === 'YES') {
    return (caregiverName || '').trim().length >= CLAIM_READY_MIN.CAREGIVER_NAME;
  }
  return false;
}

function gapFromCheck(item: BillingCheckItem): ClaimReadyGap {
  const copy = MICROCOPY[item.key];
  return {
    key: item.key,
    severity: 'block',
    label: copy?.label || item.label,
    microcopy: copy?.microcopy || item.hint,
    howToFix: copy?.howToFix || item.hint,
  };
}

/**
 * Evaluate SoT claim-ready readiness.
 * Incomplete / payroll-hold path should ignore `claimReady === false` and save unsigned.
 */
export function evaluateClaimReady(input: ClaimReadyEvalInput): ClaimReadyEvaluation {
  const safeTrials = Array.isArray(input?.trials) ? input.trials : [];
  const safeProbes = Array.isArray(input?.probes) ? input.probes : [];
  const safeFrequencies = Array.isArray(input?.frequencies) ? input.frequencies : [];
  const safeDurations = Array.isArray(input?.durations) ? input.durations : [];
  const safeTaskAnalyses = Array.isArray(input?.taskAnalyses) ? input.taskAnalyses : [];
  const safeInterventions = Array.isArray(input?.interventions) ? input.interventions : [];

  const documented = caregiverDocumented(input?.caregiverPresent || '', input?.caregiverName);
  const skillIds = [
    ...safeTrials.map((t) => t?.targetId),
    ...safeProbes.map((p) => p?.targetId),
  ].filter((id): id is string => Boolean(id));
  const usesDemoTargetsOnly =
    input?.usesDemoTargetsOnly === true ||
    (skillIds.length > 0 && skillIds.every((id) => isDemoStudioTargetId(id)));

  const checklist = buildBillingChecklist({
    clockedIn: input?.clockedIn ?? false,
    clockedOut: input?.clockedOut ?? false,
    cptCode: input?.cptCode ?? '',
    placeOfService: input?.placeOfService ?? '',
    caregiverDocumented: documented,
    caregiverPresent: input?.caregiverPresent ?? '',
    caregiverParticipation: input?.caregiverParticipation,
    usesDemoTargetsOnly,
    trials: safeTrials,
    frequencies: safeFrequencies,
    durations: safeDurations,
    taskAnalyses: safeTaskAnalyses,
    probes: safeProbes,
    objectiveData: input?.objectiveData ?? '',
    interventions: safeInterventions,
    clientResponse: input?.clientResponse ?? '',
    barriersSafety: input?.barriersSafety ?? '',
    planNext: input?.planNext ?? '',
    rbtSignature: input?.rbtSignature ?? '',
    caregiverSignature: input?.caregiverSignature ?? '',
    sessionSeconds: Number.isFinite(input?.sessionSeconds) ? Math.max(0, input.sessionSeconds) : 0,
  });

  const blocks: ClaimReadyGap[] = checklist.filter((c) => !c.ok).map(gapFromCheck);
  const warnings: ClaimReadyGap[] = [];

  const goals = (input?.goalsAddressed || '').trim();
  if (!goals || goals.length < 3) {
    warnings.push({
      key: 'GOALS_LABEL',
      severity: 'warn',
      label: 'Goals addressed label',
      microcopy:
        'A short goals line helps the BCBA queue. Data alone is enough to submit, but label the TP targets when you can.',
      howToFix: 'Fill Goals addressed on the Note step (auto-fills from collect when empty).',
    });
  }

  return {
    claimReady: blocks.length === 0,
    checklist,
    blocks,
    warnings,
    readyCount: checklist.filter((c) => c.ok).length,
    totalCount: checklist.length,
    minimumFields: CLAIM_READY_MINIMUM_FIELDS,
  };
}

/** Server-side: reject claim-ready submit when hard minimums fail. */
export function assertClaimReadyForSubmit(input: ClaimReadyEvalInput): {
  ok: true;
  evaluation: ClaimReadyEvaluation;
} | {
  ok: false;
  evaluation: ClaimReadyEvaluation;
  error: string;
  missingKeys: string[];
} {
  const sessionSeconds = Number.isFinite(input?.sessionSeconds) ? Math.max(0, input.sessionSeconds) : 0;
  const evaluation = evaluateClaimReady({
    ...input,
    // Submit implies clocked out
    clockedOut: true,
    clockedIn: input?.clockedIn || sessionSeconds > 0,
    sessionSeconds,
  });

  if (evaluation.claimReady) {
    return { ok: true, evaluation };
  }

  const labels = evaluation.blocks.map((b) => b.label);
  return {
    ok: false,
    evaluation,
    missingKeys: evaluation.blocks.map((b) => b.key),
    error: `Note is not claim-ready. Missing: ${labels.join('; ')}. Close Incomplete to hold payroll, or finish the fields and resubmit.`,
  };
}

/** Map a Studio/server payload into ClaimReadyEvalInput (shared shape). */
export function claimReadyInputFromPayload(data: {
  sessionSeconds: number;
  cptCode: string;
  locationCode: string;
  caregiverPresent?: 'YES' | 'NO' | '';
  caregiverName?: string;
  caregiverParticipation?: string;
  goalsAddressed?: string;
  objectiveData?: string;
  interventions?: string[];
  clientResponse?: string;
  barriersSafety?: string;
  planNext?: string;
  rbtSignature: string;
  parentSignature: string;
  trials?: Array<{
    targetId?: string;
    targetGoal: string;
    response: 'CORRECT' | 'PROMPTED' | 'INCORRECT';
    promptLevel?: string;
    timestamp: string;
  }>;
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
  startedAt?: string | null;
  endedAt?: string | null;
}): ClaimReadyEvalInput {
  const safeTrialsList = Array.isArray(data?.trials) ? data.trials : [];
  const trials: StudioTrial[] = safeTrialsList.map((t, i) => ({
    id: `t-${i}`,
    targetId: t?.targetId || `unknown-${i}`,
    targetLabel: t?.targetGoal || '',
    response: t?.response === 'PROMPTED' || t?.response === 'INCORRECT' || t?.response === 'CORRECT'
      ? t.response
      : 'INCORRECT',
    promptLevel: t?.promptLevel,
    at: t?.timestamp || new Date().toISOString(),
  }));

  const sessionSeconds = Number.isFinite(data?.sessionSeconds) ? Math.max(0, data.sessionSeconds) : 0;

  return {
    clockedIn: Boolean(data?.startedAt) || sessionSeconds > 0,
    clockedOut: Boolean(data?.endedAt) || sessionSeconds > 0,
    cptCode: data?.cptCode || '',
    placeOfService: data?.locationCode || '',
    caregiverPresent: data?.caregiverPresent || '',
    caregiverName: data?.caregiverName,
    caregiverParticipation: data?.caregiverParticipation,
    goalsAddressed: data?.goalsAddressed,
    trials,
    frequencies: Array.isArray(data?.frequencies) ? data.frequencies : [],
    durations: Array.isArray(data?.durations) ? data.durations : [],
    taskAnalyses: Array.isArray(data?.taskAnalyses) ? data.taskAnalyses : [],
    probes: Array.isArray(data?.probes) ? data.probes : [],
    objectiveData: data?.objectiveData || '',
    interventions: Array.isArray(data?.interventions) ? data.interventions : [],
    clientResponse: data?.clientResponse || '',
    barriersSafety: data?.barriersSafety || '',
    planNext: data?.planNext || '',
    rbtSignature: data?.rbtSignature || '',
    caregiverSignature: data?.parentSignature || '',
    sessionSeconds,
  };
}
