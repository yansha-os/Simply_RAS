export type SessionPhase = 'CLOCK_IN' | 'COLLECT' | 'NOTE' | 'SIGN';

export type DemoTarget = {
  id: string;
  label: string;
  domain: string;
};

/**
 * Dev-only Studio helpers (demo targets, +8 min).
 * Requires non-production AND NEXT_PUBLIC_ENABLE_DEV_TOOLS=true — never auto-on in prod builds.
 */
export function isSessionStudioDevHelpersEnabled() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true'
  );
}

/** Demo SkillTarget / BehaviorTarget ids (t1, b2, …) — JSON-only; never SessionTrialData UUIDs. */
export function isDemoStudioTargetId(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^[tb]\d+$/i.test(id.trim());
}

export type StudioTrial = {
  id: string;
  targetId: string;
  targetLabel: string;
  response: 'CORRECT' | 'PROMPTED' | 'INCORRECT';
  promptLevel?: string;
  at: string;
};

export type StudioAbc = {
  id: string;
  antecedent: string;
  behavior: string;
  consequence: string;
  durationSeconds?: number;
  intensity?: 'MILD' | 'MODERATE' | 'SEVERE';
  behaviorTargetId?: string | null;
  at: string;
};

export type StudioFrequency = {
  id: string;
  behaviorTargetId?: string;
  behaviorName: string;
  count: number;
  observationMinutes?: number;
  at: string;
};

export type StudioDurationEpisode = {
  id: string;
  behaviorTargetId?: string;
  behaviorName: string;
  seconds: number;
  intensity?: 'MILD' | 'MODERATE' | 'SEVERE';
  at: string;
};

export type StudioTaStep = {
  order: number;
  instruction: string;
  status: 'INDEPENDENT' | 'PROMPTED' | 'INCORRECT' | 'NOT_RUN';
};

export type StudioTaskAnalysis = {
  id: string;
  targetId?: string;
  targetLabel: string;
  chainType: 'FORWARD' | 'BACKWARD' | 'TOTAL_TASK';
  steps: StudioTaStep[];
  at: string;
};

export type StudioProbe = {
  id: string;
  targetId?: string;
  targetLabel: string;
  result: 'CORRECT' | 'INCORRECT' | 'NO_RESPONSE';
  promptLevel?: string;
  notes?: string;
  at: string;
};

export type DemoBehaviorTarget = {
  id: string;
  label: string;
  measurementType: 'FREQUENCY' | 'DURATION';
};

export const DEMO_BEHAVIOR_TARGETS: DemoBehaviorTarget[] = [
  { id: 'b1', label: 'Elopement attempts', measurementType: 'FREQUENCY' },
  { id: 'b2', label: 'Flopping / dropping', measurementType: 'DURATION' },
  { id: 'b3', label: 'Aggression (hits)', measurementType: 'FREQUENCY' },
];

export const DEFAULT_TA_STEPS: StudioTaStep[] = [
  { order: 1, instruction: 'Turn on water', status: 'NOT_RUN' },
  { order: 2, instruction: 'Wet hands', status: 'NOT_RUN' },
  { order: 3, instruction: 'Apply soap', status: 'NOT_RUN' },
  { order: 4, instruction: 'Rub 20 seconds', status: 'NOT_RUN' },
  { order: 5, instruction: 'Rinse', status: 'NOT_RUN' },
  { order: 6, instruction: 'Turn off water', status: 'NOT_RUN' },
  { order: 7, instruction: 'Dry hands', status: 'NOT_RUN' },
];

export function taPercentIndependent(steps: StudioTaStep[]): number {
  const scored = steps.filter((s) => s.status === 'INDEPENDENT' || s.status === 'PROMPTED');
  if (!scored.length) return 0;
  const ind = scored.filter((s) => s.status === 'INDEPENDENT').length;
  return Math.round((ind / scored.length) * 100);
}

/** SoT §5 — ≥1 trial OR frequency/duration/TA/probe counts as objective datum */
export function hasObjectiveDatum(input: {
  trials: StudioTrial[];
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
}): boolean {
  if (input.trials.length >= 1) return true;
  if ((input.frequencies || []).some((f) => f.count > 0)) return true;
  if ((input.durations || []).length >= 1) return true;
  if (
    (input.taskAnalyses || []).some((ta) =>
      ta.steps.some((s) => s.status === 'INDEPENDENT' || s.status === 'PROMPTED')
    )
  ) {
    return true;
  }
  if ((input.probes || []).length >= 1) return true;
  return false;
}

/**
 * Audit-ready 97153 checklist — aligned to common Medicaid + commercial/CASP expectations
 * (BxScribe / Office Puzzle / Centene-style documentation policies).
 * Not legal advice; payer contracts still govern.
 */
export type BillingCheckKey =
  | 'SESSION_TIME'
  | 'CPT_POS'
  | 'PERSONS_PRESENT'
  | 'GOALS_DATA'
  | 'INTERVENTIONS'
  | 'CLIENT_RESPONSE'
  | 'BARRIERS'
  | 'CAREGIVER_DEBRIEF'
  | 'PLAN_NEXT'
  | 'RBT_SIGN'
  | 'CAREGIVER_SIGN'
  | 'DURABLE_TARGETS'
  | 'UNITS';

/** Phrases that fail SoT §4.2 “substantive” bar when they dominate the narrative. */
const VAGUE_CLINICAL_PATTERN =
  '\\b(good session|great session|went well|did (great|well|fine)|nothing to (report|note)|n\\/?a|as usual|typical session|ok session|fine session)\\b';

export function narrativeHasVaguePhrase(text: string): boolean {
  return new RegExp(VAGUE_CLINICAL_PATTERN, 'i').test(text);
}

/** Strip vague boilerplate; remaining length must still meet the SoT min bar. */
export function substantiveNarrativeLength(text: string): number {
  return text
    .replace(new RegExp(VAGUE_CLINICAL_PATTERN, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/** SoT §4.2 — client response ≥40 chars and not vague-only. */
export function passesClientResponseQuality(text: string): boolean {
  const t = text.trim();
  if (t.length < 40) return false;
  return substantiveNarrativeLength(t) >= 30;
}

/** SoT §4.2 — plan next ≥20 chars and not vague-only. */
export function passesPlanNextQuality(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  return substantiveNarrativeLength(t) >= 15;
}

/** SoT §4.4 — caregiver participation narrative required when present. */
export function passesCaregiverParticipationQuality(
  caregiverPresent: 'YES' | 'NO' | '',
  text: string
): boolean {
  if (caregiverPresent !== 'YES') return true;
  return text.trim().length >= 20;
}

export function narrativeQualityHint(
  field: 'CLIENT_RESPONSE' | 'PLAN_NEXT' | 'CAREGIVER_DEBRIEF',
  text: string,
  caregiverPresent?: 'YES' | 'NO' | ''
): string | null {
  const t = text.trim();
  if (field === 'CLIENT_RESPONSE') {
    if (t.length < 40) return `Need ${40 - t.length} more characters (SoT ≥40).`;
    if (!passesClientResponseQuality(t))
      return 'Avoid vague-only phrasing (“good session”) — describe measurable response.';
    return null;
  }
  if (field === 'PLAN_NEXT') {
    if (t.length < 20) return `Need ${20 - t.length} more characters (SoT ≥20).`;
    if (!passesPlanNextQuality(t)) return 'Plan next must be concrete (targets / prompt fade / carryover).';
    return null;
  }
  if (caregiverPresent === 'YES') {
    if (t.length < 20) return 'Caregiver present — debrief / coaching narrative required (≥20 chars).';
  }
  return null;
}

export type BillingCheckItem = {
  key: BillingCheckKey;
  label: string;
  hint: string;
  standard: 'MEDICAID' | 'CASP' | 'BOTH';
  ok: boolean;
};

/** DEV-only opt-in SkillTargets — never auto-seeded; RBT clicks "Dev: demo targets" in Collect empty state. */
export const DEMO_TARGETS: DemoTarget[] = [
  { id: 't1', label: 'Mand: request preferred item with “I want ___”', domain: 'Language' },
  { id: 't2', label: 'Listener: follow 1-step instruction in room', domain: 'Listener' },
  { id: 't3', label: 'Motor imitation: clap / wave / touch head', domain: 'Imitation' },
];

/** Common ABA procedures for 97153 “by protocol” documentation */
export const ABA_INTERVENTION_OPTIONS = [
  { id: 'dtt', label: 'Discrete trial teaching (DTT)' },
  { id: 'net', label: 'Natural environment teaching (NET)' },
  { id: 'dr', label: 'Differential reinforcement' },
  { id: 'prompt', label: 'Prompt fading / error correction' },
  { id: 'mand', label: 'Mand / functional communication training' },
  { id: 'ta', label: 'Task analysis / chaining' },
  { id: 'demand', label: 'Demand fading / transition supports' },
  { id: 'other', label: 'Other (describe in response narrative)' },
] as const;

export type AbaInterventionId = (typeof ABA_INTERVENTION_OPTIONS)[number]['id'];

export type SessionStudioClient = {
  id: string;
  name: string;
  age: number;
  bcba: string;
  locationDefault: string;
  cptDefault: string;
  ratePerHour: number;
};

export function billableUnitsFromSeconds(seconds: number): number {
  const minutes = Math.floor(seconds / 60);
  // 8-minute rule approximation for 15-min units
  if (minutes < 8) return 0;
  return Math.floor((minutes + 7) / 15);
}

export const MAX_AUTHORITATIVE_SESSION_SECONDS = 24 * 60 * 60;
const AUTHORITATIVE_TIME_FUTURE_SKEW_MS = 5 * 60 * 1000;

export type AuthoritativeSessionInterval =
  | {
      ok: true;
      startedAt: string;
      endedAt: string;
      durationSeconds: number;
      billableUnits: number;
    }
  | {
      ok: false;
      code:
        | 'SESSION_TIME_MISSING'
        | 'SESSION_TIME_INVALID'
        | 'SESSION_TIME_REVERSED'
        | 'SESSION_DURATION_IMPLAUSIBLE';
      error: string;
    };

function durableTimeMs(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
}

/**
 * Derives the only interval allowed to drive note units: persisted Session
 * actualStart/actualEnd (which are written with the matching EVV anchors).
 */
export function resolveAuthoritativeSessionInterval(input: {
  actualStart: Date | string | null | undefined;
  actualEnd: Date | string | null | undefined;
  now?: Date;
}): AuthoritativeSessionInterval {
  const startMs = durableTimeMs(input.actualStart);
  const endMs = durableTimeMs(input.actualEnd);

  if (startMs === null || endMs === null) {
    return {
      ok: false,
      code: 'SESSION_TIME_MISSING',
      error:
        'The durable service start or clock-out is missing. Keep the draft and contact Operations to recover the EVV interval.',
    };
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return {
      ok: false,
      code: 'SESSION_TIME_INVALID',
      error:
        'The durable service interval contains an invalid timestamp. Keep the draft and contact Operations.',
    };
  }
  if (endMs <= startMs) {
    return {
      ok: false,
      code: 'SESSION_TIME_REVERSED',
      error:
        'The durable clock-out is not after clock-in. Keep the draft and contact Operations to correct the EVV interval.',
    };
  }

  const durationSeconds = Math.floor((endMs - startMs) / 1000);
  const nowMs = (input.now ?? new Date()).getTime();
  if (
    durationSeconds <= 0 ||
    durationSeconds > MAX_AUTHORITATIVE_SESSION_SECONDS ||
    endMs > nowMs + AUTHORITATIVE_TIME_FUTURE_SKEW_MS
  ) {
    return {
      ok: false,
      code: 'SESSION_DURATION_IMPLAUSIBLE',
      error:
        'The durable service interval is implausible. Keep the draft and contact Operations before billing.',
    };
  }

  return {
    ok: true,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    durationSeconds,
    billableUnits: billableUnitsFromSeconds(durationSeconds),
  };
}

/**
 * Display-only elapsed timer. Recomputing from anchors makes visibility and
 * background throttling harmless; it never becomes billing authority.
 */
export function elapsedSecondsFromDurableAnchors(input: {
  startedAt: Date | string | null | undefined;
  endedAt?: Date | string | null;
  nowMs?: number;
}): number {
  const startMs = durableTimeMs(input.startedAt);
  if (startMs === null || !Number.isFinite(startMs)) return 0;
  const persistedEndMs = durableTimeMs(input.endedAt);
  const endMs =
    persistedEndMs !== null && Number.isFinite(persistedEndMs)
      ? persistedEndMs
      : input.nowMs ?? Date.now();
  if (endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / 1000);
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export function summarizeProgress(trials: StudioTrial[]): string {
  if (trials.length === 0) return '';
  const byTarget = new Map<string, { c: number; p: number; i: number }>();
  for (const t of trials) {
    const cur = byTarget.get(t.targetLabel) || { c: 0, p: 0, i: 0 };
    if (t.response === 'CORRECT') cur.c += 1;
    else if (t.response === 'PROMPTED') cur.p += 1;
    else cur.i += 1;
    byTarget.set(t.targetLabel, cur);
  }
  const lines = [...byTarget.entries()].map(([label, s]) => {
    const total = s.c + s.p + s.i;
    const ind = total ? Math.round((s.c / total) * 100) : 0;
    return `${label}: ${s.c} independent / ${s.p} prompted / ${s.i} incorrect (${ind}% independent, n=${total}).`;
  });
  return lines.join(' ');
}

export function summarizeModalities(input: {
  trials: StudioTrial[];
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
  abcEvents?: StudioAbc[];
}): string {
  const parts: string[] = [];
  const trialSummary = summarizeProgress(input.trials);
  if (trialSummary) parts.push(trialSummary);
  for (const f of input.frequencies || []) {
    if (f.count <= 0) continue;
    const mins = f.observationMinutes;
    const rate =
      mins && mins > 0 ? ` (${((f.count / mins) * 60).toFixed(1)}/hr)` : '';
    parts.push(`Frequency · ${f.behaviorName}: count=${f.count}${rate}.`);
  }
  for (const d of input.durations || []) {
    parts.push(
      `Duration · ${d.behaviorName}: ${d.seconds}s${d.intensity ? ` (${d.intensity})` : ''}.`
    );
  }
  for (const ta of input.taskAnalyses || []) {
    const scored = ta.steps.filter(
      (s) => s.status === 'INDEPENDENT' || s.status === 'PROMPTED'
    );
    if (!scored.length) continue;
    parts.push(
      `TA · ${ta.targetLabel} (${ta.chainType}): ${taPercentIndependent(ta.steps)}% independent (${scored.length} steps scored).`
    );
  }
  for (const p of input.probes || []) {
    parts.push(`Probe · ${p.targetLabel}: ${p.result}.`);
  }
  if ((input.abcEvents || []).length) {
    parts.push(`ABC incidents: ${(input.abcEvents || []).length}.`);
  }
  return parts.join(' ');
}

export function goalsFromTrials(trials: StudioTrial[]): string {
  const labels = [...new Set(trials.map((t) => t.targetLabel))];
  return labels.join('; ');
}

/**
 * SoT-aligned note draft from Collect — measurable, TP-linked, not vague boilerplate.
 * Used when NOTE fields are still empty on Collect → Note transition.
 */
export function buildNoteNarrativeDraft(input: {
  bcbaName: string;
  caregiverPresent: 'YES' | 'NO' | '';
  caregiverName: string;
  trials: StudioTrial[];
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
  abcEvents?: StudioAbc[];
  accuracyPercent: number;
}): {
  goalsAddressed: string;
  objectiveData: string;
  clientResponse: string;
  barriersSafety: string;
  caregiverParticipation: string;
  planNext: string;
} {
  const ta = input.taskAnalyses || [];
  const modalitySummary = summarizeModalities({
    trials: input.trials,
    frequencies: input.frequencies,
    durations: input.durations,
    taskAnalyses: ta,
    probes: input.probes,
    abcEvents: input.abcEvents,
  });
  const goalLabels = [
    ...new Set([
      ...input.trials.map((t) => t.targetLabel),
      ...(input.probes || []).map((p) => p.targetLabel),
      ...ta
        .filter((t) =>
          t.steps.some((s) => s.status === 'INDEPENDENT' || s.status === 'PROMPTED')
        )
        .map((t) => t.targetLabel),
      ...(input.frequencies || []).filter((f) => f.count > 0).map((f) => f.behaviorName),
      ...(input.durations || []).map((d) => d.behaviorName),
    ]),
  ].filter(Boolean);

  const trialN = input.trials.length;
  const probeN = (input.probes || []).length;
  const abcN = (input.abcEvents || []).length;
  const freqBits = (input.frequencies || [])
    .filter((f) => f.count > 0)
    .map((f) => `${f.behaviorName}=${f.count}`)
    .join(', ');

  const responseParts = [
    trialN
      ? `Across ${trialN} skill-acquisition trial(s), independence was ${input.accuracyPercent}% under the current protocol directed by BCBA ${input.bcbaName}.`
      : null,
    probeN ? `${probeN} cold probe(s) recorded to sample maintenance / acquisition.` : null,
    freqBits ? `Frequency data: ${freqBits}.` : null,
    (input.durations || []).length
      ? `Duration episodes logged for problem/replacement behavior (${(input.durations || []).length}).`
      : null,
    abcN
      ? `${abcN} ABC incident(s) documented with planned consequence strategies.`
      : 'No major problem-behavior incidents requiring ABC this session.',
    modalitySummary
      ? `Measurable summary: ${modalitySummary.slice(0, 220)}${modalitySummary.length > 220 ? '…' : ''}`
      : null,
  ].filter(Boolean);

  const focusGoals = goalLabels.slice(0, 3).join('; ') || 'current treatment-plan targets';

  return {
    goalsAddressed: goalLabels.join('; ') || goalsFromTrials(input.trials),
    objectiveData: modalitySummary || 'Objective data pending review.',
    clientResponse: responseParts.join(' '),
    barriersSafety: abcN
      ? `${abcN} ABC incident(s) addressed with planned consequence strategies. No emergency safety protocols required.`
      : 'None noted. No safety concerns requiring escalation this session.',
    caregiverParticipation:
      input.caregiverPresent === 'YES'
        ? `Caregiver (${input.caregiverName || 'name on file'}) was present. Reviewed session targets (${focusGoals}), modeled strategies used, and discussed home carryover / questions.`
        : 'Caregiver was not present during this session. Session summary available for Case Coordination / BCBA follow-up.',
    planNext: `Continue ${focusGoals} with prompt fade and differential reinforcement; route Collect data to BCBA for protocol review; confirm caregiver signature before claim submission.`,
  };
}

export function buildBillingChecklist(input: {
  clockedIn: boolean;
  clockedOut: boolean;
  cptCode: string;
  placeOfService: string;
  caregiverDocumented: boolean;
  caregiverPresent?: 'YES' | 'NO' | '';
  caregiverParticipation?: string;
  /** True when Collect used only demo t#/b# ids — block claim-ready (JSON-only path). */
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
}): BillingCheckItem[] {
  const units = billableUnitsFromSeconds(input.sessionSeconds);
  const minutes = Math.floor(input.sessionSeconds / 60);
  const hasData = hasObjectiveDatum({
    trials: input.trials,
    frequencies: input.frequencies,
    durations: input.durations,
    taskAnalyses: input.taskAnalyses,
    probes: input.probes,
  });
  const caregiverPresent = input.caregiverPresent || '';
  return [
    {
      key: 'SESSION_TIME',
      label: 'Start / end time recorded',
      hint: 'Exact times must support billed units',
      standard: 'BOTH',
      ok: input.clockedIn && input.clockedOut && input.sessionSeconds > 0,
    },
    {
      key: 'CPT_POS',
      label: 'CPT + place of service',
      hint: 'Required for clean claim',
      standard: 'BOTH',
      ok: Boolean(input.cptCode.trim() && input.placeOfService.trim()),
    },
    {
      key: 'PERSONS_PRESENT',
      label: 'Persons present documented',
      hint: 'Caregiver Y/N (+ name if present)',
      standard: 'CASP',
      ok: input.caregiverDocumented,
    },
    {
      key: 'GOALS_DATA',
      label: 'Goals + objective data',
      hint: '≥1 trial / frequency / duration / TA / probe + measurable summary',
      standard: 'BOTH',
      ok: hasData && input.objectiveData.trim().length >= 20,
    },
    {
      key: 'INTERVENTIONS',
      label: 'Procedures by protocol',
      hint: 'Specific ABA interventions implemented',
      standard: 'BOTH',
      ok: input.interventions.length >= 1,
    },
    {
      key: 'CLIENT_RESPONSE',
      label: 'Client response narrative',
      hint: '≥40 chars substantive — not “good session” alone',
      standard: 'BOTH',
      ok: passesClientResponseQuality(input.clientResponse),
    },
    {
      key: 'BARRIERS',
      label: 'Barriers / safety addressed',
      hint: 'Required even if “None noted”',
      standard: 'BOTH',
      ok: input.barriersSafety.trim().length >= 4,
    },
    {
      key: 'CAREGIVER_DEBRIEF',
      label: 'Caregiver participation / debrief',
      hint: 'Required when caregiver present (SoT §4.4)',
      standard: 'CASP',
      ok: passesCaregiverParticipationQuality(
        caregiverPresent,
        input.caregiverParticipation || ''
      ),
    },
    {
      key: 'PLAN_NEXT',
      label: 'Plan for next session',
      hint: '≥20 chars concrete continuity plan',
      standard: 'BOTH',
      ok: passesPlanNextQuality(input.planNext),
    },
    {
      key: 'RBT_SIGN',
      label: 'Rendering provider signature',
      hint: 'RBT attestation',
      standard: 'BOTH',
      ok: input.rbtSignature.trim().length >= 2,
    },
    {
      key: 'CAREGIVER_SIGN',
      label: 'Caregiver e-signature',
      hint: 'Agency / many payer contracts; holds payroll here',
      standard: 'CASP',
      ok: input.caregiverSignature.trim().length >= 2,
    },
    {
      key: 'DURABLE_TARGETS',
      label: 'Durable TP targets (not demo)',
      hint: 'Dev demo t#/b# ids stay JSON-only — sync CRM SkillTargets for claim-ready',
      standard: 'BOTH',
      ok: !input.usesDemoTargetsOnly,
    },
    {
      key: 'UNITS',
      label: 'Billable units ≥ 1 (8-min rule)',
      hint: `${units} unit(s) from ${minutes} min`,
      standard: 'MEDICAID',
      ok: units >= 1,
    },
  ];
}

export function buildClinicalNoteDocument(input: {
  clientName: string;
  bcba: string;
  cptCode: string;
  placeOfService: string;
  startedAt: string | null;
  endedAt: string | null;
  sessionSeconds: number;
  billableUnits: number;
  caregiverPresent: 'YES' | 'NO' | '';
  caregiverName: string;
  goalsAddressed: string;
  objectiveData: string;
  interventions: string[];
  clientResponse: string;
  barriersSafety: string;
  caregiverParticipation: string;
  planNext: string;
  abcCount: number;
  rbtSignature: string;
  caregiverSignature: string;
}): string {
  const minutes = Math.floor(input.sessionSeconds / 60);
  const interventionLabels = input.interventions
    .map((id) => ABA_INTERVENTION_OPTIONS.find((o) => o.id === id)?.label || id)
    .join('; ');
  const caregiverLine =
    input.caregiverPresent === 'YES'
      ? `Yes — ${input.caregiverName || 'name on file'}`
      : input.caregiverPresent === 'NO'
        ? 'No'
        : 'Not documented';

  return [
    '=== CPT 97153 SESSION NOTE (Adaptive Behavior Treatment by Protocol) ===',
    `Client: ${input.clientName}`,
    `Supervising BCBA: ${input.bcba}`,
    `Service code: ${input.cptCode}`,
    `Place of service: ${input.placeOfService}`,
    `Start: ${formatClockTime(input.startedAt)} · End: ${formatClockTime(input.endedAt)} · Duration: ${minutes} min · Billable units: ${input.billableUnits}`,
    `Caregiver present: ${caregiverLine}`,
    '',
    '--- Treatment-plan goals / targets addressed ---',
    input.goalsAddressed || '(none listed)',
    '',
    '--- Objective data (measurable) ---',
    input.objectiveData,
    input.abcCount > 0 ? `ABC incidents logged this session: ${input.abcCount}` : 'ABC incidents: none logged',
    '',
    '--- Procedures implemented by protocol ---',
    interventionLabels || '(none selected)',
    '',
    '--- Client response to intervention ---',
    input.clientResponse,
    '',
    '--- Barriers / safety ---',
    input.barriersSafety,
    '',
    '--- Caregiver participation / debrief ---',
    input.caregiverParticipation || 'N/A',
    '',
    '--- Plan for next session ---',
    input.planNext,
    '',
    '--- Signatures ---',
    `Rendering provider (RBT): ${input.rbtSignature}`,
    `Caregiver / guardian: ${input.caregiverSignature}`,
  ].join('\n');
}

/** Normalize free-text / Studio POS string → CMS code + label. */
export function parsePlaceOfService(raw: string): { code: string; label: string; display: string } {
  const trimmed = (raw || '').trim();
  const codeMatch = trimmed.match(/^(\d{2})\b/);
  if (codeMatch) {
    const code = codeMatch[1];
    const label =
      trimmed.replace(/^\d{2}\s*[-–:]?\s*/, '').trim() ||
      (code === '12' ? 'Home' : code === '03' ? 'School' : code === '11' ? 'Clinic' : 'Other');
    return { code, label, display: `${code} - ${label}` };
  }
  if (/home/i.test(trimmed)) return { code: '12', label: 'Home', display: '12 - Home' };
  if (/school/i.test(trimmed)) return { code: '03', label: 'School', display: '03 - School' };
  if (/clinic|office/i.test(trimmed)) return { code: '11', label: 'Clinic', display: '11 - Clinic' };
  return { code: '12', label: trimmed || 'Home', display: trimmed ? `12 - ${trimmed}` : '12 - Home' };
}

const RBT_STUDIO_POS_LABELS: Record<string, string> = {
  '03': 'School',
  '11': 'Clinic',
  '12': 'Home',
  '99': 'Community',
};

export type RbtStudioBillingFacts = {
  cptCode: '97153';
  placeOfService: {
    code: string;
    label: string;
    display: string;
  };
};

export type RbtStudioBillingFactsResult =
  | ({ ok: true } & RbtStudioBillingFacts)
  | {
      ok: false;
      code:
        | 'SESSION_CPT_MISSING'
        | 'SESSION_CPT_UNSUPPORTED'
        | 'QUALIFIED_CLINICIAN_WORKFLOW_REQUIRED'
        | 'SESSION_CPT_MISMATCH'
        | 'SESSION_POS_MISSING'
        | 'SESSION_POS_UNSUPPORTED'
        | 'SESSION_POS_INCONSISTENT'
        | 'SESSION_POS_MISMATCH';
      error: string;
    };

function proposedCptCode(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  return value.match(/^(\d{5})(?=$|[\s-])/)?.[1] ?? null;
}

function locationPosCode(raw: string): string | null {
  const explicit = raw.trim().match(/^(\d{2})(?=$|\b|\s*[-–:])/);
  if (explicit) return explicit[1];
  if (/\bhome\b/i.test(raw)) return '12';
  if (/\bschool\b/i.test(raw)) return '03';
  if (/\b(clinic|office)\b/i.test(raw)) return '11';
  if (/\bcommunity\b/i.test(raw)) return '99';
  return null;
}

/**
 * Resolves the only CPT/POS facts the RBT Studio may use. Persisted Session
 * values are authoritative; browser values can only prove that the UI agrees.
 */
export function resolveRbtStudioBillingFacts(input: {
  persistedCptCode: string | null | undefined;
  persistedPlaceOfServiceCode: string | null | undefined;
  persistedLocation: string | null | undefined;
  proposedCptCode?: string | null;
  proposedPlaceOfService?: string | null;
}): RbtStudioBillingFactsResult {
  const durableCpt = input.persistedCptCode?.trim() ?? '';
  if (!durableCpt) {
    return {
      ok: false,
      code: 'SESSION_CPT_MISSING',
      error:
        'The scheduled Session has no durable CPT code. Operations or Clinical must complete manual review before RBT Studio can continue.',
    };
  }
  if (durableCpt === '97155') {
    return {
      ok: false,
      code: 'QUALIFIED_CLINICIAN_WORKFLOW_REQUIRED',
      error:
        'CPT 97155 requires the qualified-clinician workflow. A BCBA or other qualified clinician must document this Session outside RBT Studio.',
    };
  }
  if (durableCpt !== '97153') {
    return {
      ok: false,
      code: 'SESSION_CPT_UNSUPPORTED',
      error:
        'The scheduled Session CPT is not supported by RBT Studio. Operations or Clinical must complete manual review.',
    };
  }

  if (input.proposedCptCode !== undefined && input.proposedCptCode !== null) {
    const proposed = proposedCptCode(input.proposedCptCode);
    if (proposed !== durableCpt) {
      return {
        ok: false,
        code: 'SESSION_CPT_MISMATCH',
        error:
          'The Studio CPT does not match the scheduled Session. Reload the durable session facts or contact Operations for manual review.',
      };
    }
  }

  const durablePosCode = input.persistedPlaceOfServiceCode?.trim() ?? '';
  if (!durablePosCode) {
    return {
      ok: false,
      code: 'SESSION_POS_MISSING',
      error:
        'The scheduled Session has no durable place-of-service code. Operations must complete manual review before RBT Studio can continue.',
    };
  }
  if (!RBT_STUDIO_POS_LABELS[durablePosCode]) {
    return {
      ok: false,
      code: 'SESSION_POS_UNSUPPORTED',
      error:
        'The scheduled Session place of service is not recognized by RBT Studio. Operations must complete manual review.',
    };
  }

  const durableLocation = input.persistedLocation?.trim() ?? '';
  if (!durableLocation) {
    return {
      ok: false,
      code: 'SESSION_POS_MISSING',
      error:
        'The scheduled Session has no durable service location. Operations must complete manual review before RBT Studio can continue.',
    };
  }
  const durableLocationCode = locationPosCode(durableLocation);
  if (durableLocationCode && durableLocationCode !== durablePosCode) {
    return {
      ok: false,
      code: 'SESSION_POS_INCONSISTENT',
      error:
        'The scheduled Session location and place-of-service code are inconsistent. Operations must complete manual review.',
    };
  }

  if (
    input.proposedPlaceOfService !== undefined &&
    input.proposedPlaceOfService !== null
  ) {
    const proposedPosCode = locationPosCode(input.proposedPlaceOfService);
    if (proposedPosCode !== durablePosCode) {
      return {
        ok: false,
        code: 'SESSION_POS_MISMATCH',
        error:
          'The Studio place of service does not match the scheduled Session. Reload the durable session facts or contact Operations for manual review.',
      };
    }
  }

  const label =
    durableLocation.replace(/^\d{2}\s*[-–:]?\s*/, '').trim() ||
    RBT_STUDIO_POS_LABELS[durablePosCode];
  return {
    ok: true,
    cptCode: durableCpt,
    placeOfService: {
      code: durablePosCode,
      label,
      display: `${durablePosCode} - ${label}`,
    },
  };
}

export type StructuredNoteContent = {
  schemaVersion: 1;
  cptCode: string;
  placeOfService: { code: string; label: string };
  actualStart: string;
  actualEnd: string;
  durationMinutes: number;
  billableUnits: number;
  renderingProviderUserId: string | null;
  renderingCredential: 'RBT';
  supervisingBcbaUserId: string | null;
  supervisingBcbaName: string | null;
  authorizationRef: string | null;
  treatmentPlanRef: string | null;
  personsPresent: {
    client: true;
    caregiverPresent: boolean;
    caregiverName: string | null;
    other: string[];
  };
  sections: {
    goalsAddressed: string;
    objectiveData: string;
    interventions: string[];
    interventionLabels: string[];
    clientResponse: string;
    barriersSafety: string;
    caregiverParticipation: string;
    planNext: string;
  };
  /** SoT §4.3 modality snapshot — always embedded; durable rows when UUIDs exist */
  modalities: {
    trials: Array<{
      modality: 'TRIAL';
      targetId?: string;
      targetLabel: string;
      trials: Array<{
        trialIndex: number;
        score: '+' | '-' | 'P' | 'NR';
        promptLevel?: string;
        at: string;
      }>;
      summary: {
        correct: number;
        prompted: number;
        incorrect: number;
        percentIndependent: number;
      };
    }>;
    frequency: Array<{
      modality: 'FREQUENCY';
      behaviorTargetId?: string;
      behaviorName: string;
      count: number;
      observationMinutes?: number;
      ratePerHour?: number;
      at?: string;
    }>;
    duration: Array<{
      modality: 'DURATION';
      behaviorTargetId?: string;
      behaviorName: string;
      episodes: Array<{ seconds: number; intensity?: string; at: string }>;
      totalSeconds: number;
    }>;
    taskAnalysis: Array<{
      modality: 'TASK_ANALYSIS';
      targetId?: string;
      targetLabel: string;
      chainType: 'FORWARD' | 'BACKWARD' | 'TOTAL_TASK';
      steps: Array<{
        order: number;
        instruction: string;
        status: string;
      }>;
      percentIndependent: number;
      at?: string;
    }>;
    probes: Array<{
      modality: 'PROBE';
      targetId?: string;
      targetLabel: string;
      result: 'CORRECT' | 'INCORRECT' | 'NO_RESPONSE';
      promptLevel?: string;
      notes?: string;
      at: string;
    }>;
    abcEvents: Array<{
      modality: 'ABC';
      antecedent: string;
      behavior: string;
      consequence: string;
      durationSeconds: number;
      intensity?: string;
      at?: string;
      behaviorTargetId?: string | null;
      mappingStatus?: 'MAPPED_EXISTING_TARGET' | 'PROVISIONAL_BCBA_REVIEW';
      mappingSource?:
        | 'EXPLICIT_TARGET_ID'
        | 'NORMALIZED_LABEL'
        | 'UNMATCHED_RBT_OBSERVATION';
    }>;
  };
};

export type ChecklistSnapshot = {
  schemaVersion: 1;
  passed: boolean;
  checkedAt: string;
  items: Array<{
    key: string;
    label: string;
    standard: string;
    ok: boolean;
  }>;
};

export function buildChecklistSnapshot(
  items: BillingCheckItem[],
  checkedAt: string = new Date().toISOString()
): ChecklistSnapshot {
  return {
    schemaVersion: 1,
    passed: items.every((i) => i.ok),
    checkedAt,
    items: items.map((i) => ({
      key: i.key,
      label: i.label,
      standard: i.standard,
      ok: i.ok,
    })),
  };
}

function scoreFromStudioResponse(
  response: 'CORRECT' | 'PROMPTED' | 'INCORRECT'
): '+' | '-' | 'P' {
  if (response === 'CORRECT') return '+';
  if (response === 'PROMPTED') return 'P';
  return '-';
}

/** Group flat Studio trials into SoT TRIAL modality blocks. */
export function buildTrialModalityBlocks(
  trials: Array<{
    targetId?: string;
    targetLabel: string;
    response: 'CORRECT' | 'PROMPTED' | 'INCORRECT';
    promptLevel?: string;
    at: string;
  }>
): StructuredNoteContent['modalities']['trials'] {
  const byKey = new Map<
    string,
    {
      targetId?: string;
      targetLabel: string;
      trials: StructuredNoteContent['modalities']['trials'][0]['trials'];
    }
  >();
  for (const t of trials) {
    const key = `${t.targetId || ''}|${t.targetLabel}`;
    const cur = byKey.get(key) || {
      targetId: t.targetId,
      targetLabel: t.targetLabel,
      trials: [],
    };
    cur.trials.push({
      trialIndex: cur.trials.length + 1,
      score: scoreFromStudioResponse(t.response),
      promptLevel:
        t.promptLevel ||
        (t.response === 'CORRECT'
          ? 'Independent'
          : t.response === 'PROMPTED'
            ? 'Verbal'
            : undefined),
      at: t.at,
    });
    byKey.set(key, cur);
  }
  return [...byKey.values()].map((block) => {
    const correct = block.trials.filter((x) => x.score === '+').length;
    const prompted = block.trials.filter((x) => x.score === 'P').length;
    const incorrect = block.trials.filter((x) => x.score === '-').length;
    const total = block.trials.length;
    return {
      modality: 'TRIAL' as const,
      targetId: block.targetId,
      targetLabel: block.targetLabel,
      trials: block.trials,
      summary: {
        correct,
        prompted,
        incorrect,
        percentIndependent: total ? Math.round((correct / total) * 100) : 0,
      },
    };
  });
}

export function buildModalitiesSnapshot(input: {
  trials: Array<{
    targetId?: string;
    targetLabel: string;
    response: 'CORRECT' | 'PROMPTED' | 'INCORRECT';
    promptLevel?: string;
    at: string;
  }>;
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
  abcEvents?: Array<{
    antecedent: string;
    behavior: string;
    consequence: string;
    durationSeconds?: number;
    intensity?: string;
    at?: string;
    behaviorTargetId?: string | null;
    mappingStatus?: 'MAPPED_EXISTING_TARGET' | 'PROVISIONAL_BCBA_REVIEW';
    mappingSource?:
      | 'EXPLICIT_TARGET_ID'
      | 'NORMALIZED_LABEL'
      | 'UNMATCHED_RBT_OBSERVATION';
  }>;
}): StructuredNoteContent['modalities'] {
  const durationByBehavior = new Map<
    string,
    {
      behaviorTargetId?: string;
      behaviorName: string;
      episodes: Array<{ seconds: number; intensity?: string; at: string }>;
    }
  >();
  for (const d of input.durations || []) {
    const key = `${d.behaviorTargetId || ''}|${d.behaviorName}`;
    const cur = durationByBehavior.get(key) || {
      behaviorTargetId: d.behaviorTargetId,
      behaviorName: d.behaviorName,
      episodes: [],
    };
    cur.episodes.push({
      seconds: d.seconds,
      intensity: d.intensity,
      at: d.at,
    });
    durationByBehavior.set(key, cur);
  }

  return {
    trials: buildTrialModalityBlocks(input.trials),
    frequency: (input.frequencies || [])
      .filter((f) => f.count > 0)
      .map((f) => {
        const mins = f.observationMinutes;
        return {
          modality: 'FREQUENCY' as const,
          behaviorTargetId: f.behaviorTargetId,
          behaviorName: f.behaviorName,
          count: f.count,
          observationMinutes: mins,
          ratePerHour: mins && mins > 0 ? Math.round((f.count / mins) * 60 * 100) / 100 : undefined,
          at: f.at,
        };
      }),
    duration: [...durationByBehavior.values()].map((block) => ({
      modality: 'DURATION' as const,
      behaviorTargetId: block.behaviorTargetId,
      behaviorName: block.behaviorName,
      episodes: block.episodes,
      totalSeconds: block.episodes.reduce((sum, e) => sum + e.seconds, 0),
    })),
    taskAnalysis: (input.taskAnalyses || [])
      .filter((ta) =>
        ta.steps.some((s) => s.status === 'INDEPENDENT' || s.status === 'PROMPTED')
      )
      .map((ta) => ({
        modality: 'TASK_ANALYSIS' as const,
        targetId: ta.targetId,
        targetLabel: ta.targetLabel,
        chainType: ta.chainType,
        steps: ta.steps.map((s) => ({
          order: s.order,
          instruction: s.instruction,
          status: s.status,
        })),
        percentIndependent: taPercentIndependent(ta.steps),
        at: ta.at,
      })),
    probes: (input.probes || []).map((p) => ({
      modality: 'PROBE' as const,
      targetId: p.targetId,
      targetLabel: p.targetLabel,
      result: p.result,
      promptLevel: p.promptLevel,
      notes: p.notes,
      at: p.at,
    })),
    abcEvents: (input.abcEvents || []).map((e) => ({
      modality: 'ABC' as const,
      antecedent: e.antecedent,
      behavior: e.behavior,
      consequence: e.consequence,
      durationSeconds: e.durationSeconds ?? 0,
      intensity: e.intensity,
      at: e.at,
      behaviorTargetId: e.behaviorTargetId ?? null,
      mappingStatus: e.mappingStatus,
      mappingSource: e.mappingSource,
    })),
  };
}

/** SoT §4.1 header + §4.2 section map for SessionNote.structuredContent */
export function buildStructuredNoteContent(input: {
  cptCode: string;
  placeOfServiceRaw: string;
  startedAt: string;
  endedAt: string;
  sessionSeconds: number;
  billableUnits: number;
  renderingProviderUserId?: string | null;
  supervisingBcbaUserId?: string | null;
  supervisingBcbaName?: string | null;
  authorizationRef?: string | null;
  treatmentPlanRef?: string | null;
  caregiverPresent: 'YES' | 'NO' | '';
  caregiverName?: string;
  goalsAddressed: string;
  objectiveData: string;
  interventions: string[];
  clientResponse: string;
  barriersSafety: string;
  caregiverParticipation: string;
  planNext: string;
  trials: Array<{
    targetId?: string;
    targetLabel: string;
    response: 'CORRECT' | 'PROMPTED' | 'INCORRECT';
    promptLevel?: string;
    at: string;
  }>;
  frequencies?: StudioFrequency[];
  durations?: StudioDurationEpisode[];
  taskAnalyses?: StudioTaskAnalysis[];
  probes?: StudioProbe[];
  abcEvents: Array<{
    antecedent: string;
    behavior: string;
    consequence: string;
    durationSeconds?: number;
    intensity?: string;
    at?: string;
    behaviorTargetId?: string | null;
    mappingStatus?: 'MAPPED_EXISTING_TARGET' | 'PROVISIONAL_BCBA_REVIEW';
    mappingSource?:
      | 'EXPLICIT_TARGET_ID'
      | 'NORMALIZED_LABEL'
      | 'UNMATCHED_RBT_OBSERVATION';
  }>;
}): StructuredNoteContent {
  const pos = parsePlaceOfService(input.placeOfServiceRaw);
  const cptCode = input.cptCode.trim();
  return {
    schemaVersion: 1,
    cptCode,
    placeOfService: { code: pos.code, label: pos.label },
    actualStart: input.startedAt,
    actualEnd: input.endedAt,
    durationMinutes: Math.floor(input.sessionSeconds / 60),
    billableUnits: input.billableUnits,
    renderingProviderUserId: input.renderingProviderUserId || null,
    renderingCredential: 'RBT',
    supervisingBcbaUserId: input.supervisingBcbaUserId || null,
    supervisingBcbaName: input.supervisingBcbaName || null,
    authorizationRef: input.authorizationRef || null,
    treatmentPlanRef: input.treatmentPlanRef || null,
    personsPresent: {
      client: true,
      caregiverPresent: input.caregiverPresent === 'YES',
      caregiverName:
        input.caregiverPresent === 'YES' ? input.caregiverName?.trim() || null : null,
      other: [],
    },
    sections: {
      goalsAddressed: input.goalsAddressed,
      objectiveData: input.objectiveData,
      interventions: input.interventions,
      interventionLabels: input.interventions.map(
        (id) => ABA_INTERVENTION_OPTIONS.find((o) => o.id === id)?.label || id
      ),
      clientResponse: input.clientResponse,
      barriersSafety: input.barriersSafety,
      caregiverParticipation: input.caregiverParticipation,
      planNext: input.planNext,
    },
    modalities: buildModalitiesSnapshot({
      trials: input.trials,
      frequencies: input.frequencies,
      durations: input.durations,
      taskAnalyses: input.taskAnalyses,
      probes: input.probes,
      abcEvents: input.abcEvents,
    }),
  };
}
