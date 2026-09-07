/**
 * Pure data model for the ABA Treatment Plan report (no react-pdf imports).
 *
 * Single source of truth for what TreatmentPlanPDF renders: the PDF component
 * and the ReportAssemblyTab preview both build this model, so the on-screen
 * section checklist always matches the generated document. Missing content is
 * surfaced as `documented: false` and rendered as "Not yet documented" —
 * never as a silent blank gap.
 *
 * Keep byte-identical with the sibling app copy
 * (apps/crm and apps/hrm both ship src/lib/pdf/treatmentPlanReportModel.ts).
 */

import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';

export const NOT_DOCUMENTED = 'Not yet documented';

export type ReportField = { label: string; value: string | null };
export type ReportParagraph = { label: string; text: string | null };

export type ReportSkillGoal = {
  domain: string | null;
  description: string;
  baseline: string | null;
  mastery: string | null;
  currentLevel: string | null;
  targetDate: string | null;
  status: string | null;
};

export type ReportBehaviorGoal = {
  behavior: string;
  definition: string | null;
  hypothesizedFunction: string | null;
  baseline: string | null;
  mastery: string | null;
  riskLevel: string | null;
  replacementBehavior: string | null;
  proactiveStrategies: string | null;
  reactiveStrategies: string | null;
  targetDate: string | null;
  status: string | null;
};

export type ReportCaregiverGoal = {
  description: string;
  baseline: string | null;
  mastery: string | null;
  status: string | null;
};

export type ReportCptLine = {
  code: string;
  label: string;
  cadence: string;
  hours: string | null;
};

export type ReportObservation = {
  label: string;
  date: string | null;
  setting: string | null;
  narrative: string | null;
};

export type ReportCareMeeting = {
  provider: string | null;
  contactInfo: string | null;
  notes: string | null;
};

export type ReportSectionStatus = {
  id: string;
  title: string;
  documented: boolean;
};

export type TreatmentPlanReportModel = {
  generatedAtLabel: string;
  clientName: string;
  planPeriodLabel: string | null;
  bcbaOfRecord: string | null;
  demographics: ReportField[];
  provider: ReportField[];
  background: ReportParagraph[];
  assessment: {
    fields: ReportField[];
    toolScores: ReportField[];
    observations: ReportObservation[];
    narratives: ReportParagraph[];
  };
  domainSummaries: { label: string; severity: string | null; description: string | null }[];
  skillGoals: ReportSkillGoal[];
  maladaptiveSummary: { severity: string | null; narrative: string | null } | null;
  behaviorGoals: ReportBehaviorGoal[];
  caregiverGoals: ReportCaregiverGoal[];
  services: { cptLines: ReportCptLine[]; fields: ReportField[] };
  clinicalNarratives: ReportParagraph[];
  careCoordination: ReportCareMeeting[];
  signatures: {
    bcbaSignature: string | null;
    bcbaName: string | null;
    bcbaCredential: string;
    bcbaSignedDate: string | null;
    parentSignature: string | null;
    parentSignedDate: string | null;
  };
  sections: ReportSectionStatus[];
};

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return '';
  return String(v).trim();
}

function orNull(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => asRecord(item)).filter((r): r is Record<string, unknown> => !!r);
}

/** "2026-08-01" → "Aug 1, 2026"; "2026-08" → "August 2026"; free text passes through. */
export function formatPlanDate(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (full) {
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (month >= 1 && month <= 12) {
      return `${SHORT_MONTHS[month - 1]} ${day}, ${full[1]}`;
    }
  }
  const yearMonth = /^(\d{4})-(\d{2})$/.exec(s);
  if (yearMonth) {
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) {
      return `${LONG_MONTHS[month - 1]} ${yearMonth[1]}`;
    }
  }
  return s;
}

/** Date-only DB values live at (or near) UTC midnight — read the UTC calendar date. */
export function formatDateOnly(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** e.g. "Aug 12, 2026, 4:10 AM EDT" — always the clinic timezone, never host TZ. */
export function formatClinicTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildSkillGoals(
  plan: Record<string, unknown>,
  skillTargets: Record<string, unknown>[],
): ReportSkillGoal[] {
  const planGoals = asArray(plan.skillGoals);
  if (planGoals.length > 0) {
    // Plan goals are authoritative; enrich blanks from synced Session Studio
    // targets (SkillTarget carries baselineData + masteryCriteria + live status).
    return planGoals
      .filter((g) => str(g.description))
      .map((g) => {
        const description = str(g.description);
        const match = skillTargets.find(
          (t) =>
            normalizeKey(str(t.title)) === normalizeKey(description) ||
            normalizeKey(str(t.description)) === normalizeKey(description),
        );
        const targetBaseline =
          match && typeof match.baselineData === 'number' ? String(match.baselineData) : null;
        return {
          domain: orNull(g.domain),
          description,
          baseline: orNull(g.baseline) ?? targetBaseline,
          mastery: orNull(g.mastery) ?? orNull(match?.masteryCriteria),
          currentLevel: orNull(g.currentLevel),
          targetDate: formatPlanDate(g.targetDate),
          status: orNull(g.status) ?? orNull(match?.targetStatus),
        };
      });
  }
  return skillTargets
    .filter((t) => str(t.title) || str(t.description))
    .map((t) => ({
      domain: orNull(t.domain),
      description: str(t.title) || str(t.description),
      baseline: typeof t.baselineData === 'number' ? String(t.baselineData) : null,
      mastery: orNull(t.masteryCriteria),
      currentLevel: null,
      targetDate: null,
      status: orNull(t.targetStatus),
    }));
}

function buildBehaviorGoals(
  plan: Record<string, unknown>,
  behaviorTargets: Record<string, unknown>[],
): ReportBehaviorGoal[] {
  const planBrp = asArray(plan.brp);
  if (planBrp.length > 0) {
    return planBrp
      .filter((b) => str(b.behavior))
      .map((b) => {
        const behavior = str(b.behavior);
        const match = behaviorTargets.find(
          (t) => normalizeKey(str(t.behaviorName)) === normalizeKey(behavior),
        );
        return {
          behavior,
          definition: orNull(b.topography) ?? orNull(match?.definition),
          hypothesizedFunction: orNull(b.function),
          baseline: orNull(b.baseline),
          mastery: orNull(b.mastery),
          riskLevel: orNull(b.risk),
          replacementBehavior: orNull(b.ferb) ?? orNull(match?.replacementBehavior),
          proactiveStrategies:
            orNull(b.proactive) ?? orNull(b.antecedent) ?? orNull(match?.antecedents),
          reactiveStrategies:
            orNull(b.reactive) ?? orNull(b.consequence) ?? orNull(match?.consequences),
          targetDate: formatPlanDate(b.targetDate),
          status: orNull(b.status),
        };
      });
  }
  return behaviorTargets
    .filter((t) => str(t.behaviorName))
    .map((t) => ({
      behavior: str(t.behaviorName),
      definition: orNull(t.definition),
      hypothesizedFunction: null,
      baseline: null,
      mastery: null,
      riskLevel: null,
      replacementBehavior: orNull(t.replacementBehavior),
      proactiveStrategies: orNull(t.antecedents),
      reactiveStrategies: orNull(t.consequences),
      targetDate: null,
      status: null,
    }));
}

export function buildTreatmentPlanReportModel(input: {
  client: unknown;
  treatmentPlan: unknown;
  generatedAt?: Date;
}): TreatmentPlanReportModel {
  const client = asRecord(input.client) ?? {};
  const plan = asRecord(input.treatmentPlan) ?? {};
  const skillTargets = asArray(client.skillTargets);
  const behaviorTargets = asArray(client.behaviorTargets);
  const bcbaUser = asRecord(client.bcba);
  const intakeFormData = asRecord(asRecord(client.intakePacket)?.formData) ?? {};

  const clientName = [str(client.firstName), str(client.lastName)].filter(Boolean).join(' ') || 'Client';

  // --- Cover / demographics -------------------------------------------------
  const diagnosisName = orNull(intakeFormData.diagnosisName);
  const diagnosisDetail = [
    diagnosisName,
    orNull(intakeFormData.diagnosingProvider) ? `by ${str(intakeFormData.diagnosingProvider)}` : null,
    formatPlanDate(intakeFormData.diagnosisDate),
  ]
    .filter(Boolean)
    .join(', ');

  const demographics: ReportField[] = [
    { label: 'Client Name', value: clientName },
    { label: 'Date of Birth', value: formatDateOnly(client.dateOfBirth) },
    { label: 'Age', value: client.childAge != null ? `${client.childAge} years` : null },
    { label: 'Gender', value: orNull(client.childGender) },
    { label: 'Diagnosis', value: diagnosisDetail || null },
    { label: 'Parent / Guardian', value: orNull(client.guardianName) },
    { label: 'Guardian Phone', value: orNull(client.guardianPhone) },
    { label: 'Primary Insurance', value: orNull(client.insurancePayer) },
    { label: 'Member ID', value: orNull(client.memberId) },
    { label: 'Medicaid ID', value: orNull(client.medicaidId) },
  ];

  const servicePeriodStart = formatPlanDate(plan.servicePeriodStart);
  const servicePeriodEnd = formatPlanDate(plan.servicePeriodEnd);
  const planPeriodLabel =
    servicePeriodStart || servicePeriodEnd
      ? `${servicePeriodStart ?? 'TBD'} – ${servicePeriodEnd ?? 'TBD'}`
      : null;

  const bcbaCredential = orNull(plan.assessorCredentials) ?? 'BCBA';
  const bcbaName =
    (bcbaUser
      ? [str(bcbaUser.firstName), str(bcbaUser.lastName)].filter(Boolean).join(' ')
      : '') || str(plan.assessorName);
  const bcbaOfRecord = bcbaName ? `${bcbaName}, ${bcbaCredential}` : null;

  const assessmentWindow =
    formatPlanDate(plan.assessmentStartDate) || formatPlanDate(plan.assessmentEndDate)
      ? `${formatPlanDate(plan.assessmentStartDate) ?? 'TBD'} – ${formatPlanDate(plan.assessmentEndDate) ?? 'TBD'}`
      : null;

  const provider: ReportField[] = [
    { label: 'BCBA of Record', value: bcbaOfRecord },
    { label: 'Assessor Email', value: orNull(plan.assessorEmail) },
    { label: 'Assessor Phone', value: orNull(plan.assessorPhone) },
    { label: 'Referring Provider', value: orNull(plan.referringProvider) },
    { label: 'Provider NPI', value: orNull(plan.providerNpi) },
    { label: 'Assessment Window', value: assessmentWindow },
    { label: 'Reassessment Due', value: formatPlanDate(plan.reassessmentDate) },
  ];

  // --- Background & history -------------------------------------------------
  const background: ReportParagraph[] = [
    { label: 'Background', text: orNull(plan.backgroundNotes) },
    { label: 'Family Structure', text: orNull(plan.familyStructure) },
    { label: 'Medical History', text: orNull(plan.medicalHistory) },
    { label: 'Developmental History', text: orNull(plan.developmentalHistory) },
    { label: 'School', text: orNull(plan.school) },
    { label: 'Related Services', text: orNull(plan.relatedServices) },
    { label: 'Client Strengths', text: orNull(plan.clientStrengths) },
  ];

  // --- Assessment summary ---------------------------------------------------
  const toolScoresRecord = asRecord(plan.toolScores) ?? {};
  const toolScores: ReportField[] = [
    { label: 'Communication', value: orNull(toolScoresRecord.communication) },
    { label: 'Daily Living Skills', value: orNull(toolScoresRecord.dailyLiving) },
    { label: 'Socialization', value: orNull(toolScoresRecord.socialization) },
    { label: 'Motor Skills', value: orNull(toolScoresRecord.motor) },
  ];

  const assessmentFields: ReportField[] = [
    { label: 'Assessment Tool', value: orNull(plan.assessmentTool) },
    { label: 'ATEC Total Score', value: orNull(plan.atecScore) },
    { label: 'Parent Interview', value: formatPlanDate(plan.parentInterviewDate) },
    { label: 'Record Review', value: formatPlanDate(plan.recordReviewDate) },
    { label: 'Preference Assessment', value: formatPlanDate(plan.preferenceAssessmentDate) },
  ];

  const observations: ReportObservation[] = [
    {
      label: 'Direct Observation 1',
      date: formatPlanDate(plan.observation1Date),
      setting: orNull(plan.observation1Setting),
      narrative: orNull(plan.observation1Narrative),
    },
    {
      label: 'Direct Observation 2',
      date: formatPlanDate(plan.observation2Date),
      setting: orNull(plan.observation2Setting),
      narrative: orNull(plan.observation2Narrative),
    },
  ].filter((o) => o.date || o.setting || o.narrative);

  const assessmentNarratives: ReportParagraph[] = [
    { label: 'Clinical Interpretation', text: orNull(plan.clinicalInterpretation) },
    { label: 'Current Areas of Deficit', text: orNull(plan.currentDeficitsSummary) },
    { label: 'Highly Preferred Items', text: orNull(plan.highlyPreferredItems) },
  ];

  const domainSummaries = [
    {
      label: 'Language / Communication',
      severity: orNull(plan.langCommSeverity),
      description: orNull(plan.langCommDescription),
    },
    {
      label: 'Social / Emotional',
      severity: orNull(plan.socialEmotionalSeverity),
      description: orNull(plan.socialEmotionalDescription),
    },
    {
      label: 'Adaptive Functioning',
      severity: orNull(plan.adaptiveSeverity),
      description: orNull(plan.adaptiveDescription),
    },
  ];

  // --- Goals ------------------------------------------------------------------
  const skillGoals = buildSkillGoals(plan, skillTargets);
  const behaviorGoals = buildBehaviorGoals(plan, behaviorTargets);

  const maladaptiveSeverity = orNull(plan.maladaptiveSeverity);
  const maladaptiveNarrative = orNull(plan.maladaptiveNarrative);
  const maladaptiveSummary =
    maladaptiveSeverity || maladaptiveNarrative
      ? { severity: maladaptiveSeverity, narrative: maladaptiveNarrative }
      : null;

  const caregiverGoals: ReportCaregiverGoal[] = asArray(plan.parentGoals)
    .filter((g) => str(g.description))
    .map((g) => ({
      description: str(g.description),
      baseline: orNull(g.baseline),
      mastery: orNull(g.mastery),
      status: orNull(g.status),
    }));

  // --- Service recommendation -------------------------------------------------
  const cptLines: ReportCptLine[] = [
    {
      code: '97151',
      label: 'Behavior Identification Assessment',
      cadence: 'hrs / auth period',
      hours: orNull(plan.hours97151Eval) ?? orNull(plan.hoursEvaluation),
    },
    {
      code: '97151',
      label: 'Treatment Plan Development',
      cadence: 'hrs / week',
      hours: orNull(plan.hours97151Plan),
    },
    {
      code: '97153',
      label: 'Adaptive Behavior Treatment (Direct 1:1)',
      cadence: 'hrs / week',
      hours: orNull(plan.hours97153) ?? orNull(plan.hoursDirect),
    },
    {
      code: '97155',
      label: 'Planned Adaptive Behavior Treatment with Protocol Modification (Qualified Clinician)',
      cadence: 'hrs / week',
      hours: orNull(plan.hours97155) ?? orNull(plan.hoursSupervision),
    },
    {
      code: '97156',
      label: 'Family Adaptive Behavior Treatment Guidance',
      cadence: 'hrs / week',
      hours: orNull(plan.hours97156) ?? orNull(plan.hoursParentTraining),
    },
  ];

  const primaryLocations = Array.isArray(plan.primaryLocations)
    ? (plan.primaryLocations as unknown[]).map((l) => str(l)).filter(Boolean)
    : [];
  const scheduleRecord = asRecord(plan.serviceSchedule) ?? {};
  const scheduleDays = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)
    .map((day) => {
      const value = str(scheduleRecord[day]);
      return value ? `${day.charAt(0).toUpperCase()}${day.slice(1)} ${value}` : null;
    })
    .filter((s): s is string => !!s);

  const serviceFields: ReportField[] = [
    { label: 'Service Period', value: planPeriodLabel },
    { label: 'Primary Locations', value: primaryLocations.length ? primaryLocations.join(', ') : null },
    { label: 'Weekly Schedule', value: scheduleDays.length ? scheduleDays.join(' · ') : null },
  ];

  // --- Clinical narratives / coordination --------------------------------------
  const clinicalNarratives: ReportParagraph[] = [
    { label: 'Statement of Medical Necessity', text: orNull(plan.medicalNecessity) },
    { label: 'Barriers to Treatment', text: orNull(plan.barriersToTreatment) },
    { label: 'Generalization Plan', text: orNull(plan.generalizationPlan) },
    { label: 'Crisis / Safety Plan', text: orNull(plan.crisisPlan) },
    { label: 'Discharge Fading Plan', text: orNull(plan.dischargeFadingPlan) },
    { label: 'Discharge Criteria', text: orNull(plan.dischargeCriteria) },
  ];

  const careCoordination: ReportCareMeeting[] = asArray(plan.careCoordinationMeetings)
    .filter((m) => str(m.provider) || str(m.notes))
    .map((m) => ({
      provider: orNull(m.provider),
      contactInfo: orNull(m.contactInfo),
      notes: orNull(m.notes),
    }));

  // --- Signatures ----------------------------------------------------------------
  const signatures = {
    bcbaSignature: orNull(plan.signature),
    bcbaName: bcbaName || null,
    bcbaCredential,
    bcbaSignedDate: formatPlanDate(plan.assessmentEndDate),
    parentSignature: orNull(plan.parentSignature),
    parentSignedDate: formatPlanDate(plan.parentSignatureDate),
  };

  const sections: ReportSectionStatus[] = [
    { id: 'overview', title: 'Client & Plan Overview', documented: true },
    {
      id: 'background',
      title: 'Background & History',
      documented: background.some((p) => !!p.text),
    },
    {
      id: 'assessment',
      title: 'Assessment Summary',
      documented:
        assessmentFields.some((f) => !!f.value) ||
        toolScores.some((f) => !!f.value) ||
        observations.length > 0 ||
        assessmentNarratives.some((p) => !!p.text) ||
        domainSummaries.some((d) => d.severity || d.description),
    },
    { id: 'skill-goals', title: 'Skill Acquisition Goals', documented: skillGoals.length > 0 },
    {
      id: 'behavior-plan',
      title: 'Behavior Reduction Plan',
      documented: behaviorGoals.length > 0 || !!maladaptiveSummary,
    },
    { id: 'caregiver-goals', title: 'Caregiver Goals', documented: caregiverGoals.length > 0 },
    {
      id: 'services',
      title: 'Service Recommendation (CPT)',
      documented: cptLines.some((l) => !!l.hours) || serviceFields.some((f) => !!f.value),
    },
    {
      id: 'necessity',
      title: 'Medical Necessity & Care Coordination',
      documented: clinicalNarratives.some((p) => !!p.text) || careCoordination.length > 0,
    },
    {
      id: 'signatures',
      title: 'Signatures & Consent',
      documented: !!signatures.bcbaSignature,
    },
  ];

  return {
    generatedAtLabel: formatClinicTimestamp(input.generatedAt ?? new Date()),
    clientName,
    planPeriodLabel,
    bcbaOfRecord,
    demographics,
    provider,
    background,
    assessment: {
      fields: assessmentFields,
      toolScores,
      observations,
      narratives: assessmentNarratives,
    },
    domainSummaries,
    skillGoals,
    maladaptiveSummary,
    behaviorGoals,
    caregiverGoals,
    services: { cptLines, fields: serviceFields },
    clinicalNarratives,
    careCoordination,
    signatures,
    sections,
  };
}
