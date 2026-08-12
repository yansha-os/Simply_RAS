'use client';

import React, { useState, useTransition, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ClipboardList, Plus, Trash2, Send, CheckCircle, Activity, Target, Users, AlertCircle, FileText, Library, BookmarkPlus, X, RefreshCw, Cloud, CloudOff, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { saveTreatmentPlan, getGoalTemplates, saveGoalTemplate } from '@/app/(dashboard)/portal-case/actions/clinical-support';
import { syncTreatmentPlanTargetsToSessionStudio } from '@/app/actions/clinicalGoalsActions';
import { safeParseJson } from '@/lib/safeParseJson';
import { toast } from 'sonner';

const SERVICE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const PLAN_TEXT_FIELDS = [
  'backgroundNotes',
  'observationNotes',
  'referringProvider',
  'providerNpi',
  'assessmentStartDate',
  'assessmentEndDate',
  'reassessmentDate',
  'assessorName',
  'assessorCredentials',
  'assessorEmail',
  'assessorPhone',
  'hours97151Eval',
  'hours97151Plan',
  'hours97153',
  'hours97155',
  'hours97156',
  'servicePeriodStart',
  'servicePeriodEnd',
  'familyStructure',
  'medicalHistory',
  'developmentalHistory',
  'school',
  'relatedServices',
  'clientStrengths',
  'parentInterviewDate',
  'recordReviewDate',
  'atecScore',
  'observation1Date',
  'observation1Setting',
  'observation1Narrative',
  'observation2Date',
  'observation2Setting',
  'observation2Narrative',
  'currentDeficitsSummary',
  'langCommSeverity',
  'langCommDescription',
  'socialEmotionalSeverity',
  'socialEmotionalDescription',
  'adaptiveSeverity',
  'adaptiveDescription',
  'maladaptiveSeverity',
  'maladaptiveNarrative',
  'medicalNecessity',
  'barriersToTreatment',
  'preferenceAssessmentDate',
  'highlyPreferredItems',
  'generalizationPlan',
  'dischargeFadingPlan',
  'assessmentTool',
  'clinicalInterpretation',
  'hoursEvaluation',
  'hoursDirect',
  'hoursSupervision',
  'hoursParentTraining',
  'crisisPlan',
  'dischargeCriteria',
] as const;

const BRP_TEXT_FIELDS = [
  'behavior',
  'baseline',
  'topography',
  'function',
  'antecedent',
  'consequence',
  'ferb',
  'proactive',
  'reactive',
  'risk',
  'mastery',
  'currentLevel',
  'targetDate',
  'status',
] as const;

const SKILL_TEXT_FIELDS = [
  'domain',
  'description',
  'mastery',
  'baseline',
  'currentLevel',
  'targetDate',
  'status',
] as const;

const PARENT_TEXT_FIELDS = [
  'description',
  'mastery',
  'baseline',
  'currentLevel',
  'targetDate',
  'status',
] as const;

const CARE_MEETING_TEXT_FIELDS = ['provider', 'contactInfo', 'notes'] as const;

type UnknownRecord = Record<string, unknown>;
type ServiceDay = (typeof SERVICE_DAYS)[number];
type TreatmentPlanTextField = (typeof PLAN_TEXT_FIELDS)[number];
type TreatmentPlanRow = Record<string, string>;

export type TreatmentPlanDraft = Record<TreatmentPlanTextField, string> &
  Record<string, unknown> & {
    primaryLocations: string[];
    serviceSchedule: Record<ServiceDay, string>;
    toolScores: Record<string, string>;
    brp: TreatmentPlanRow[];
    skillGoals: TreatmentPlanRow[];
    parentGoals: TreatmentPlanRow[];
    careCoordinationMeetings: TreatmentPlanRow[];
  };

type TreatmentPlanClient = {
  id: string;
  status: string;
  updatedAt: Date | string;
  treatmentPlan?: unknown;
  bcbaId?: string | null;
  bcba?: {
    id?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
};

type GoalTemplate = {
  id: string;
  type: 'SKILL' | 'BRP' | 'PARENT';
  domain: string;
  description: string;
  mastery: string;
  behavior: string;
  topography: string;
  function: string;
  antecedent: string;
  consequence: string;
  authorName: string;
};

function isGoalTemplateType(value: string): value is GoalTemplate['type'] {
  return value === 'SKILL' || value === 'BRP' || value === 'PARENT';
}

export type AssignedBcbaIdentity = {
  id: string;
  name: string;
  email: string;
};

export type TreatmentPlanValidationIssue = {
  field: string;
  message: string;
};

export type TreatmentPlanValidation = {
  isValid: boolean;
  issues: TreatmentPlanValidationIssue[];
};

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function normalizeName(value: unknown): string {
  return asText(value).trim().replace(/\s+/g, ' ');
}

function normalizeRows(
  value: unknown,
  fields: readonly string[],
  defaults: UnknownRecord = {},
): TreatmentPlanRow[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];

    const normalized: TreatmentPlanRow = {};
    for (const field of fields) {
      normalized[field] = asText(row[field]) || asText(defaults[field]);
    }
    return [normalized];
  });
}

/**
 * Converts legacy JSON into the exact shapes consumed by this tab.
 * Valid-but-wrong JSON (arrays, primitives, malformed rows) is treated as empty data.
 */
export function normalizeTreatmentPlanDraft(raw: unknown): TreatmentPlanDraft {
  const parsed = safeParseJson<unknown>(raw, {});
  const source = asRecord(parsed) ?? {};
  const draft = {} as TreatmentPlanDraft;

  for (const field of PLAN_TEXT_FIELDS) {
    draft[field] = asText(source[field]);
  }

  const locations = Array.isArray(source.primaryLocations)
    ? source.primaryLocations
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  draft.primaryLocations = [...new Set(locations)];

  const schedule = asRecord(source.serviceSchedule);
  draft.serviceSchedule = Object.fromEntries(
    SERVICE_DAYS.map((day) => [day, asText(schedule?.[day])]),
  ) as Record<ServiceDay, string>;

  const scores = asRecord(source.toolScores);
  draft.toolScores = scores
    ? Object.fromEntries(
        Object.entries(scores).flatMap(([key, value]) => {
          const normalized = asText(value);
          return normalized ? [[key, normalized]] : [];
        }),
      )
    : {};

  draft.brp = normalizeRows(source.brp, BRP_TEXT_FIELDS, { status: 'New' });
  draft.skillGoals = normalizeRows(source.skillGoals, SKILL_TEXT_FIELDS, { status: 'New' });
  draft.parentGoals = normalizeRows(source.parentGoals, PARENT_TEXT_FIELDS, { status: 'New' });
  draft.careCoordinationMeetings = normalizeRows(
    source.careCoordinationMeetings,
    CARE_MEETING_TEXT_FIELDS,
  );

  return draft;
}

/** The assigned User relation is the only real author identity available in this client payload. */
export function resolveAssignedBcbaIdentity(client: unknown): AssignedBcbaIdentity | null {
  const clientRecord = asRecord(client);
  const bcba = asRecord(clientRecord?.bcba);
  const assignedId = asText(clientRecord?.bcbaId).trim();
  const relationId = asText(bcba?.id).trim();
  const firstName = normalizeName(bcba?.firstName);
  const lastName = normalizeName(bcba?.lastName);

  if (!assignedId || !relationId || assignedId !== relationId || !firstName || !lastName) {
    return null;
  }

  return {
    id: relationId,
    name: `${firstName} ${lastName}`,
    email: asText(bcba?.email).trim(),
  };
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function validateTreatmentPlanSubmission(
  rawPlan: unknown,
  author: AssignedBcbaIdentity | null,
): TreatmentPlanValidation {
  const plan = normalizeTreatmentPlanDraft(rawPlan);
  const issues: TreatmentPlanValidationIssue[] = [];
  const addIssue = (field: string, message: string) => {
    if (!issues.some((issue) => issue.field === field)) issues.push({ field, message });
  };
  const requireText = (field: string, message: string) => {
    if (!asText(plan[field]).trim()) addIssue(field, message);
  };

  if (!author) {
    addIssue('author', 'Assign a BCBA with a complete staff identity before submission.');
  }

  requireText('assessorCredentials', 'Enter the author credentials shown on the report.');

  if (!isIsoDate(plan.assessmentStartDate)) {
    addIssue('assessmentStartDate', 'Enter a valid assessment start date.');
  }
  if (!isIsoDate(plan.assessmentEndDate)) {
    addIssue('assessmentEndDate', 'Enter a valid assessment end date.');
  } else if (
    isIsoDate(plan.assessmentStartDate) &&
    plan.assessmentEndDate < plan.assessmentStartDate
  ) {
    addIssue('assessmentEndDate', 'Assessment end date cannot precede the start date.');
  }

  for (const [field, label] of [
    ['hours97151Eval', '97151 evaluation'],
    ['hours97151Plan', '97151 plan development'],
    ['hours97153', '97153 direct treatment'],
    ['hours97155', '97155 protocol modification'],
    ['hours97156', '97156 caregiver guidance'],
  ] as const) {
    const value = asText(plan[field]).trim();
    if (!value) {
      addIssue(field, `Enter an explicit ${label} recommendation, including 0 when none is recommended.`);
      continue;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      addIssue(field, `${label} hours must be a non-negative number.`);
    }
  }

  if (!isIsoMonth(plan.servicePeriodStart)) {
    addIssue('servicePeriodStart', 'Enter a valid service period start month.');
  }
  if (!isIsoMonth(plan.servicePeriodEnd)) {
    addIssue('servicePeriodEnd', 'Enter a valid service period end month.');
  } else if (
    isIsoMonth(plan.servicePeriodStart) &&
    plan.servicePeriodEnd < plan.servicePeriodStart
  ) {
    addIssue('servicePeriodEnd', 'Service period end cannot precede the start month.');
  }

  if (plan.primaryLocations.length === 0) {
    addIssue('primaryLocations', 'Select at least one recommended service location.');
  }
  if (!SERVICE_DAYS.some((day) => asText(plan.serviceSchedule[day]).trim())) {
    addIssue('serviceSchedule', 'Document at least one proposed service day and time.');
  }

  if (plan.skillGoals.length === 0) {
    addIssue('skillGoals', 'Add at least one skill-acquisition goal.');
  }
  if (plan.parentGoals.length === 0) {
    addIssue('parentGoals', 'Add at least one caregiver goal.');
  }

  const validateRows = (
    rows: TreatmentPlanRow[],
    group: 'skillGoals' | 'parentGoals' | 'brp',
    fields: readonly [string, string][],
  ) => {
    rows.forEach((row, index) => {
      for (const [field, label] of fields) {
        if (!asText(row[field]).trim()) {
          addIssue(`${group}.${index}.${field}`, `${label} is required.`);
        } else if (field === 'targetDate' && !isIsoMonth(asText(row[field]).trim())) {
          addIssue(`${group}.${index}.${field}`, `${label} must be a valid month.`);
        }
      }
    });
  };

  validateRows(plan.skillGoals, 'skillGoals', [
    ['domain', 'Skill domain'],
    ['description', 'Skill objective'],
    ['baseline', 'Skill baseline'],
    ['currentLevel', 'Skill current level'],
    ['mastery', 'Skill mastery criteria'],
    ['targetDate', 'Skill target date'],
  ]);
  validateRows(plan.parentGoals, 'parentGoals', [
    ['description', 'Caregiver objective'],
    ['baseline', 'Caregiver baseline'],
    ['currentLevel', 'Caregiver current level'],
    ['mastery', 'Caregiver mastery criteria'],
    ['targetDate', 'Caregiver target date'],
  ]);
  validateRows(plan.brp, 'brp', [
    ['behavior', 'Target behavior'],
    ['function', 'Hypothesized function'],
    ['baseline', 'Behavior baseline'],
    ['topography', 'Behavior topography'],
    ['ferb', 'Replacement behavior'],
    ['proactive', 'Proactive strategy'],
    ['reactive', 'Reactive strategy'],
    ['mastery', 'Behavior mastery criteria'],
    ['currentLevel', 'Behavior current level'],
    ['targetDate', 'Behavior target date'],
  ]);

  requireText('medicalNecessity', 'Document the individualized medical-necessity rationale.');
  requireText('generalizationPlan', 'Document the individualized generalization plan.');
  requireText('dischargeCriteria', 'Document individualized discharge criteria.');

  return { isValid: issues.length === 0, issues };
}

export function formatTreatmentPlanActionError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const record = asRecord(error);
  const message = asText(record?.error).trim();
  return message || fallback;
}

export default function BcbaTreatmentPlanTab({ client }: { client: TreatmentPlanClient }) {
  const [isPending, startTransition] = useTransition();
  const [isSyncingTargets, startSyncTargets] = useTransition();

  // Load existing plan or set defaults — one malformed row must not white-screen the tab
  const existingPlan = normalizeTreatmentPlanDraft(client?.treatmentPlan);
  const assignedAuthor = useMemo(
    () => resolveAssignedBcbaIdentity(client),
    [client],
  );

  const backgroundNotes = existingPlan.backgroundNotes;
  const observationNotes = existingPlan.observationNotes;

  // Phase 1 State
  const [referringProvider, setReferringProvider] = useState(existingPlan.referringProvider || '');
  const [providerNpi, setProviderNpi] = useState(existingPlan.providerNpi || '');
  const [assessmentStartDate, setAssessmentStartDate] = useState(existingPlan.assessmentStartDate || '');
  const [assessmentEndDate, setAssessmentEndDate] = useState(existingPlan.assessmentEndDate || '');
  const [reassessmentDate, setReassessmentDate] = useState(existingPlan.reassessmentDate || '');
  const assessorName = assignedAuthor?.name || '';
  const [assessorCredentials, setAssessorCredentials] = useState(existingPlan.assessorCredentials || '');
  const assessorEmail = assignedAuthor?.email || '';
  const [assessorPhone, setAssessorPhone] = useState(existingPlan.assessorPhone || '');

  const [hours97151Eval, setHours97151Eval] = useState(existingPlan.hours97151Eval || '');
  const [hours97151Plan, setHours97151Plan] = useState(existingPlan.hours97151Plan || '');
  const [hours97153, setHours97153] = useState(existingPlan.hours97153 || '');
  const [hours97155, setHours97155] = useState(existingPlan.hours97155 || '');
  const [hours97156, setHours97156] = useState(existingPlan.hours97156 || '');

  const [servicePeriodStart, setServicePeriodStart] = useState(existingPlan.servicePeriodStart || '');
  const [servicePeriodEnd, setServicePeriodEnd] = useState(existingPlan.servicePeriodEnd || '');
  const [primaryLocations, setPrimaryLocations] = useState<string[]>(existingPlan.primaryLocations || []);
  const [serviceSchedule, setServiceSchedule] = useState<Record<ServiceDay, string>>(
    existingPlan.serviceSchedule,
  );

  // Phase 2 State: Biopsychosocial
  const [familyStructure, setFamilyStructure] = useState(existingPlan.familyStructure || '');
  const [medicalHistory, setMedicalHistory] = useState(existingPlan.medicalHistory || '');
  const [developmentalHistory, setDevelopmentalHistory] = useState(existingPlan.developmentalHistory || '');
  const [school, setSchool] = useState(existingPlan.school || '');
  const [relatedServices, setRelatedServices] = useState(existingPlan.relatedServices || '');
  const [clientStrengths, setClientStrengths] = useState(existingPlan.clientStrengths || '');

  // Phase 2 State: Assessments & Observations
  const [parentInterviewDate, setParentInterviewDate] = useState(existingPlan.parentInterviewDate || '');
  const [recordReviewDate, setRecordReviewDate] = useState(existingPlan.recordReviewDate || '');
  const [atecScore, setAtecScore] = useState(existingPlan.atecScore || '');
  
  const [observation1Date, setObservation1Date] = useState(existingPlan.observation1Date || '');
  const [observation1Setting, setObservation1Setting] = useState(existingPlan.observation1Setting || '');
  const [observation1Narrative, setObservation1Narrative] = useState(existingPlan.observation1Narrative || '');
  const [observation2Date, setObservation2Date] = useState(existingPlan.observation2Date || '');
  const [observation2Setting, setObservation2Setting] = useState(existingPlan.observation2Setting || '');
  const [observation2Narrative, setObservation2Narrative] = useState(existingPlan.observation2Narrative || '');
  const [currentDeficitsSummary, setCurrentDeficitsSummary] = useState(existingPlan.currentDeficitsSummary || '');

  // Phase 3 State: Domains
  const [langCommSeverity, setLangCommSeverity] = useState(existingPlan.langCommSeverity || '');
  const [langCommDescription, setLangCommDescription] = useState(existingPlan.langCommDescription || '');
  const [socialEmotionalSeverity, setSocialEmotionalSeverity] = useState(existingPlan.socialEmotionalSeverity || '');
  const [socialEmotionalDescription, setSocialEmotionalDescription] = useState(existingPlan.socialEmotionalDescription || '');
  const [adaptiveSeverity, setAdaptiveSeverity] = useState(existingPlan.adaptiveSeverity || '');
  const [adaptiveDescription, setAdaptiveDescription] = useState(existingPlan.adaptiveDescription || '');

  // Phase 4 State: Behavior Reduction
  const [maladaptiveSeverity, setMaladaptiveSeverity] = useState(existingPlan.maladaptiveSeverity || '');
  const [maladaptiveNarrative, setMaladaptiveNarrative] = useState(existingPlan.maladaptiveNarrative || '');

  // Phase 5 State: Care Coordination
  const [medicalNecessity, setMedicalNecessity] = useState(existingPlan.medicalNecessity || '');
  const [barriersToTreatment, setBarriersToTreatment] = useState(existingPlan.barriersToTreatment || '');
  const [preferenceAssessmentDate, setPreferenceAssessmentDate] = useState(existingPlan.preferenceAssessmentDate || '');
  const [highlyPreferredItems, setHighlyPreferredItems] = useState(existingPlan.highlyPreferredItems || '');
  const [generalizationPlan, setGeneralizationPlan] = useState(existingPlan.generalizationPlan || '');
  const [dischargeFadingPlan, setDischargeFadingPlan] = useState(existingPlan.dischargeFadingPlan || '');
  const [careCoordinationMeetings, setCareCoordinationMeetings] = useState<TreatmentPlanRow[]>(existingPlan.careCoordinationMeetings);

  const [assessmentTool, setAssessmentTool] = useState(existingPlan.assessmentTool || '');
  const [toolScores, setToolScores] = useState<Record<string, string>>(existingPlan.toolScores);
  const clinicalInterpretation = existingPlan.clinicalInterpretation;
  
  const [brp, setBrp] = useState<TreatmentPlanRow[]>(existingPlan.brp);
  const [skillGoals, setSkillGoals] = useState<TreatmentPlanRow[]>(existingPlan.skillGoals);
  const [parentGoals, setParentGoals] = useState<TreatmentPlanRow[]>(existingPlan.parentGoals);
  
  const hoursEvaluation = existingPlan.hoursEvaluation;
  const hoursDirect = existingPlan.hoursDirect;
  
  const hoursSupervision = existingPlan.hoursSupervision;
  const hoursParentTraining = existingPlan.hoursParentTraining;

  const [crisisPlan, setCrisisPlan] = useState(existingPlan.crisisPlan || '');
  const [dischargeCriteria, setDischargeCriteria] = useState(existingPlan.dischargeCriteria || '');
  const [overrideReason, setOverrideReason] = useState('');
  const [verifiedSessionIdentity, setVerifiedSessionIdentity] =
    useState<AssignedBcbaIdentity | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<{
    state: 'idle' | 'saving' | 'saved' | 'error';
    message: string;
  }>({ state: 'idle', message: 'Draft has not changed.' });
  const [validationIssues, setValidationIssues] = useState<TreatmentPlanValidationIssue[]>([]);

  const isAssembled = [
    'REPORT_ASSEMBLED',
    'TX_PA_SUBMITTED',
    'TX_PA_APPROVED',
    'STAFFING_PENDING',
    'ACTIVE',
  ].includes(client.status);
  const isFirstRender = useRef(true);
  const latestSaveRequest = useRef(0);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialVersion = new Date(client.updatedAt);
  const currentVersion = useRef(
    Number.isNaN(initialVersion.getTime()) ? '' : initialVersion.toISOString(),
  );

  // Template Library State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateType, setTemplateType] = useState<'SKILL' | 'BRP' | 'PARENT' | null>(null);
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [isFetchingTemplates, setIsFetchingTemplates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const templateSearchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showTemplateModal) return;
    templateSearchInput.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowTemplateModal(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showTemplateModal]);

  const getPayload = useCallback(() => {
    return {
      backgroundNotes, observationNotes, assessmentTool, toolScores, 
      clinicalInterpretation, brp, skillGoals, parentGoals, 
      hoursEvaluation, hoursDirect, 
      hoursSupervision,
      hoursParentTraining, crisisPlan, dischargeCriteria,
      referringProvider, providerNpi, assessmentStartDate, assessmentEndDate, reassessmentDate,
      assessorCredentials, assessorPhone,
      hours97151Eval, hours97151Plan, hours97153, hours97155, hours97156,
      servicePeriodStart, servicePeriodEnd, primaryLocations, serviceSchedule,
      familyStructure, medicalHistory, developmentalHistory, school, relatedServices, clientStrengths,
      parentInterviewDate, recordReviewDate, atecScore,
      observation1Date, observation1Setting, observation1Narrative, 
      observation2Date, observation2Setting, observation2Narrative, currentDeficitsSummary,
      langCommSeverity, langCommDescription, socialEmotionalSeverity, socialEmotionalDescription, adaptiveSeverity, adaptiveDescription,
      maladaptiveSeverity, maladaptiveNarrative,
      medicalNecessity, barriersToTreatment, preferenceAssessmentDate, highlyPreferredItems, generalizationPlan, dischargeFadingPlan, careCoordinationMeetings
    };
  }, [backgroundNotes, observationNotes, assessmentTool, toolScores, clinicalInterpretation, brp, skillGoals, parentGoals, hoursEvaluation, hoursDirect, hoursSupervision, hoursParentTraining, crisisPlan, dischargeCriteria, referringProvider, providerNpi, assessmentStartDate, assessmentEndDate, reassessmentDate, assessorCredentials, assessorPhone, hours97151Eval, hours97151Plan, hours97153, hours97155, hours97156, servicePeriodStart, servicePeriodEnd, primaryLocations, serviceSchedule, familyStructure, medicalHistory, developmentalHistory, school, relatedServices, clientStrengths, parentInterviewDate, recordReviewDate, atecScore, observation1Date, observation1Setting, observation1Narrative, observation2Date, observation2Setting, observation2Narrative, currentDeficitsSummary, langCommSeverity, langCommDescription, socialEmotionalSeverity, socialEmotionalDescription, adaptiveSeverity, adaptiveDescription, maladaptiveSeverity, maladaptiveNarrative, medicalNecessity, barriersToTreatment, preferenceAssessmentDate, highlyPreferredItems, generalizationPlan, dischargeFadingPlan, careCoordinationMeetings]);

  // Auto-Save Effect
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    autosaveTimer.current = setTimeout(() => {
      const requestId = ++latestSaveRequest.current;
      setSaveFeedback({ state: 'saving', message: 'Saving draft…' });
      startTransition(async () => {
        try {
          const result = await saveTreatmentPlan(
            client.id,
            getPayload(),
            false,
            { expectedUpdatedAt: currentVersion.current },
          );
          if (result.success) {
            currentVersion.current = result.version;
            setVerifiedSessionIdentity(result.signer);
          }
          if (requestId !== latestSaveRequest.current) return;
          if (!result.success) {
            const message = formatTreatmentPlanActionError(result, 'Autosave failed. Your edits remain on this screen.');
            setSaveFeedback({ state: 'error', message });
            toast.error(message);
            return;
          }
          setSaveFeedback({
            state: 'saved',
            message: `Draft saved at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
          });
        } catch (error) {
          if (requestId !== latestSaveRequest.current) return;
          const message = formatTreatmentPlanActionError(
            error,
            'Autosave failed. Your edits remain on this screen.',
          );
          setSaveFeedback({ state: 'error', message });
          toast.error(message);
        }
      });
    }, 2000);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    };
  }, [getPayload, client.id]);

  const getHighlightClass = (_value: string, validationField?: string) => {
    if (
      validationField &&
      currentValidation.issues.some((issue) => issue.field === validationField)
    ) {
      return '!border-amber-500/60 !bg-amber-500/10 focus:!border-amber-400 placeholder:!text-amber-500/50 transition-colors duration-300';
    }
    return '!border-zinc-700 !bg-zinc-900 focus:!border-brand-blue-500 transition-colors duration-300';
  };

  // --- Handlers ---
  const handleAddBrp = () => setBrp([...brp, { behavior: '', baseline: '', topography: '', function: '', antecedent: '', consequence: '', ferb: '', proactive: '', reactive: '', risk: '', mastery: '', currentLevel: '', targetDate: '', status: 'New' }]);
  const handleUpdateBrp = (index: number, field: string, value: string) => { const updated = [...brp]; updated[index][field] = value; setBrp(updated); };
  const handleRemoveBrp = (index: number) => setBrp(brp.filter((_, i) => i !== index));

  const handleAddSkill = () => setSkillGoals([...skillGoals, { domain: '', description: '', mastery: '', baseline: '', currentLevel: '', targetDate: '', status: 'New' }]);
  const handleUpdateSkill = (index: number, field: string, value: string) => { const updated = [...skillGoals]; updated[index][field] = value; setSkillGoals(updated); };
  const handleRemoveSkill = (index: number) => setSkillGoals(skillGoals.filter((_, i) => i !== index));

  const handleAddParentGoal = () => setParentGoals([...parentGoals, { description: '', mastery: '', baseline: '', currentLevel: '', targetDate: '', status: 'New' }]);
  const handleUpdateParentGoal = (index: number, field: string, value: string) => { const updated = [...parentGoals]; updated[index][field] = value; setParentGoals(updated); };
  const handleRemoveParentGoal = (index: number) => setParentGoals(parentGoals.filter((_, i) => i !== index));

  const handleAddCareMeeting = () => setCareCoordinationMeetings([...careCoordinationMeetings, { provider: '', contactInfo: '', notes: '' }]);
  const handleUpdateCareMeeting = (index: number, field: string, value: string) => { const updated = [...careCoordinationMeetings]; updated[index][field] = value; setCareCoordinationMeetings(updated); };
  const handleRemoveCareMeeting = (index: number) => setCareCoordinationMeetings(careCoordinationMeetings.filter((_, i) => i !== index));

  const handleSave = (submit: boolean = false) => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const payload = getPayload();
    const validation = validateTreatmentPlanSubmission(payload, assignedAuthor);
    if (submit && !validation.isValid) {
      setValidationIssues(validation.issues);
      toast.error(`Resolve ${validation.issues.length} treatment-plan requirement${validation.issues.length === 1 ? '' : 's'} before signing.`);

      setTimeout(() => {
        const firstIssue = validation.issues[0];
        const firstMissing = firstIssue
          ? document.querySelector<HTMLElement>(`[data-validation-field="${firstIssue.field}"]`)
          : null;
        if (firstMissing) {
          firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstMissing.focus({ preventScroll: true });
          firstMissing.classList.add('animate-pulse');
          setTimeout(() => firstMissing.classList.remove('animate-pulse'), 1000);
        }
      }, 100);
      return;
    }
    setValidationIssues([]);
    const requestId = ++latestSaveRequest.current;
    setSaveFeedback({
      state: 'saving',
      message: submit ? 'Submitting signed plan…' : 'Saving draft…',
    });
    startTransition(async () => {
      try {
        const result = await saveTreatmentPlan(
          client.id,
          payload,
          submit,
          {
            expectedUpdatedAt: currentVersion.current,
            ...(submit && overrideReason.trim()
              ? { overrideReason: overrideReason.trim() }
              : {}),
          },
        );
        if (result.success) {
          currentVersion.current = result.version;
          setVerifiedSessionIdentity(result.signer);
          if (result.overrideUsed) setOverrideReason('');
        }
        if (requestId !== latestSaveRequest.current) return;
        if (!result.success) {
          const message = formatTreatmentPlanActionError(
            result,
            submit ? 'Treatment plan submission failed.' : 'Draft save failed.',
          );
          setSaveFeedback({ state: 'error', message });
          toast.error(message);
          return;
        }
        const message = submit ? 'Treatment plan signed and routed.' : 'Draft saved successfully.';
        setSaveFeedback({ state: 'saved', message });
        toast.success(message);
      } catch (error) {
        if (requestId !== latestSaveRequest.current) return;
        const message = formatTreatmentPlanActionError(
          error,
          submit ? 'Treatment plan submission failed.' : 'Draft save failed.',
        );
        setSaveFeedback({ state: 'error', message });
        toast.error(message);
      }
    });
  };

  // --- Template Library Handlers ---
  const openTemplateLibrary = async (type: 'SKILL' | 'BRP' | 'PARENT') => {
    setTemplateType(type);
    setShowTemplateModal(true);
    setIsFetchingTemplates(true);
    setSearchQuery('');
    setDomainFilter('');
    
    try {
      const res = await getGoalTemplates(type);
      if (res.success && Array.isArray(res.templates)) {
        setTemplates(
          res.templates.flatMap((template) => {
            const record = asRecord(template);
            if (!record) return [];
            const normalizedType = asText(record.type);
            if (!isGoalTemplateType(normalizedType)) return [];
            return [{
              id: asText(record.id),
              type: normalizedType,
              domain: asText(record.domain),
              description: asText(record.description),
              mastery: asText(record.mastery),
              behavior: asText(record.behavior),
              topography: asText(record.topography),
              function: asText(record.function),
              antecedent: asText(record.antecedent),
              consequence: asText(record.consequence),
              authorName: asText(record.authorName),
            }];
          }),
        );
      } else {
        toast.error(formatTreatmentPlanActionError(res, 'Failed to load templates.'));
      }
    } catch (error) {
      toast.error(formatTreatmentPlanActionError(error, 'Failed to load templates.'));
    } finally {
      setIsFetchingTemplates(false);
    }
  };

  const insertTemplate = (template: GoalTemplate) => {
    if (template.type === 'SKILL') {
      setSkillGoals([...skillGoals, { domain: template.domain || '', description: template.description || '', mastery: template.mastery || '', baseline: '', currentLevel: '', targetDate: '', status: 'New' }]);
    } else if (template.type === 'BRP') {
      setBrp([...brp, { behavior: template.behavior || '', baseline: '', topography: template.topography || '', function: template.function || '', antecedent: template.antecedent || '', consequence: template.consequence || '', ferb: '', proactive: '', reactive: '', risk: '', mastery: '', currentLevel: '', targetDate: '', status: 'New' }]);
    } else if (template.type === 'PARENT') {
      setParentGoals([...parentGoals, { description: template.description || '', mastery: template.mastery || '', baseline: '', currentLevel: '', targetDate: '', status: 'New' }]);
    }
    setShowTemplateModal(false);
    toast.success('Template inserted!');
  };

  const handleSaveToLibrary = async (
    type: 'SKILL' | 'BRP' | 'PARENT',
    item: TreatmentPlanRow,
  ) => {
    if ((type === 'SKILL' || type === 'PARENT') && !item.description) {
      toast.error('Cannot save empty goal to library.'); return;
    }
    if (type === 'BRP' && !item.behavior) {
      toast.error('Cannot save empty behavior to library.'); return;
    }

    const payload: Record<string, string> = { type }; // authorName is derived server-side from the signed-in user
    if (type === 'SKILL') {
      payload.domain = item.domain; payload.description = item.description; payload.mastery = item.mastery;
    } else if (type === 'BRP') {
      payload.behavior = item.behavior; payload.topography = item.topography; payload.function = item.function;
      payload.antecedent = item.antecedent; payload.consequence = item.consequence;
    } else if (type === 'PARENT') {
      payload.description = item.description; payload.mastery = item.mastery;
    }

    try {
      const res = await saveGoalTemplate(payload);
      if (res.success) toast.success('Saved to Universal Library!');
      else toast.error(formatTreatmentPlanActionError(res, 'Failed to save to library.'));
    } catch (error) {
      toast.error(formatTreatmentPlanActionError(error, 'Failed to save to library.'));
    }
  };

  const currentValidation = validateTreatmentPlanSubmission(getPayload(), assignedAuthor);
  const isReadyToSubmit = currentValidation.isValid;
  const displayedValidationIssues = validationIssues.length > 0 ? currentValidation.issues : [];
  const getFieldProps = (field: string, label: string) => {
    const issue = displayedValidationIssues.find((entry) => entry.field === field);
    return {
      'aria-label': label,
      'aria-invalid': issue ? true : undefined,
      'aria-describedby': issue ? 'treatment-plan-validation-summary' : undefined,
      'data-validation-field': field,
    };
  };

  const handleSyncTargetsToSessionStudio = (opts?: { saveDraftFirst?: boolean }) => {
    if (!client?.id || isSyncingTargets) return;
    startSyncTargets(async () => {
      try {
        if (opts?.saveDraftFirst !== false && !isAssembled) {
          // Persist current draft first so sync reads the latest goals from DB
          const saveResult = await saveTreatmentPlan(
            client.id,
            getPayload(),
            false,
            { expectedUpdatedAt: currentVersion.current },
          );
          if (!saveResult.success) {
            const message = formatTreatmentPlanActionError(
              saveResult,
              'Draft could not be saved, so targets were not synced.',
            );
            setSaveFeedback({ state: 'error', message });
            toast.error(message);
            return;
          }
          currentVersion.current = saveResult.version;
          setVerifiedSessionIdentity(saveResult.signer);
        }
        const res = await syncTreatmentPlanTargetsToSessionStudio(client.id);
        if (!res.success) {
          toast.error(formatTreatmentPlanActionError(res, 'Sync failed.'));
          return;
        }
        toast.success(
          `Synced to Session Studio: ${res.skillsCreated} skill created, ${res.skillsUpdated} updated; ${res.behaviorsCreated} behavior created, ${res.behaviorsUpdated} updated.`,
        );
      } catch (error) {
        toast.error(formatTreatmentPlanActionError(error, 'Sync failed.'));
      }
    });
  };

  if (isAssembled) {
    return (
      <div className="relative space-y-6 overflow-hidden rounded-3xl border border-emerald-400/20 bg-zinc-950/90 p-6 shadow-2xl shadow-emerald-950/30 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.10),transparent_38%)]" />
        <Card className="relative overflow-hidden border border-emerald-400/20 bg-emerald-500/[0.07] backdrop-blur-xl">
          <CardContent className="p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_32px_rgba(52,211,153,0.18)]">
                <CheckCircle className="h-7 w-7 text-emerald-300" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                    Authoring complete
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                    {String(client?.status || '').replace(/_/g, ' ')}
                  </span>
                </div>
                <h2 className="font-heading text-xl font-semibold text-white">
                  Treatment plan is in the downstream workflow
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-400">
                  This authoring surface is read-only after report assembly.
                  {assignedAuthor ? ` Assigned BCBA: ${assignedAuthor.name}.` : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-200">Session Studio target sync</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Publish the authored skill and behavior targets for downstream data collection.
            </p>
          </div>
          <button
            type="button"
            aria-label="Sync treatment-plan targets to Session Studio"
            onClick={() => handleSyncTargetsToSessionStudio({ saveDraftFirst: false })}
            disabled={isSyncingTargets}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all duration-300 ${
              isSyncingTargets
                ? 'cursor-not-allowed border-white/5 bg-zinc-900/40 text-zinc-500'
                : 'cursor-pointer border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:scale-[1.02]'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncingTargets ? 'animate-spin' : ''}`} />
            {isSyncingTargets ? 'Syncing…' : 'Sync targets to Session Studio'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative max-w-5xl space-y-8 pb-12"
      role="form"
      aria-labelledby="treatment-plan-heading"
    >
      <div className="relative overflow-hidden rounded-2xl border border-brand-blue-400/20 bg-zinc-950/85 p-6 shadow-2xl shadow-blue-950/20 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_40%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.10),transparent_30%)]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 id="treatment-plan-heading" className="mb-2 flex items-center text-xl font-bold text-white">
              <ClipboardList className="mr-3 h-6 w-6 text-brand-blue-400" aria-hidden="true" />
              Comprehensive Assessment & Treatment Plan Builder
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-zinc-400">
              Document only findings and recommendations supported by this client&apos;s assessment.
              Submission requirements are highlighted in amber; optional fields remain neutral.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {assignedAuthor ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Assigned author: {assignedAuthor.name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-400/10 px-3 py-1.5 text-xs font-medium text-red-300">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  No verified assigned BCBA
                </span>
              )}
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  saveFeedback.state === 'error'
                    ? 'border-red-400/20 bg-red-400/10 text-red-300'
                    : saveFeedback.state === 'saving'
                      ? 'border-blue-400/20 bg-blue-400/10 text-blue-300'
                      : saveFeedback.state === 'saved'
                        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                        : 'border-white/10 bg-white/5 text-zinc-400'
                }`}
                role="status"
                aria-live="polite"
              >
                {saveFeedback.state === 'saving' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : saveFeedback.state === 'error' ? (
                  <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {saveFeedback.message}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Save draft and sync goals to Session Studio"
            onClick={() => handleSyncTargetsToSessionStudio({ saveDraftFirst: true })}
            disabled={isSyncingTargets || (skillGoals.length === 0 && brp.length === 0)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition-all duration-300 ${
              isSyncingTargets || (skillGoals.length === 0 && brp.length === 0)
                ? 'cursor-not-allowed border-white/5 bg-zinc-900/40 text-zinc-500'
                : 'cursor-pointer border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:scale-[1.02]'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncingTargets ? 'animate-spin' : ''}`} />
            {isSyncingTargets ? 'Syncing…' : 'Sync targets to Session Studio'}
          </button>
        </div>
      </div>
      {!assignedAuthor && (
        <div
          className="rounded-2xl border border-red-400/20 bg-red-500/[0.07] p-5 text-sm text-red-100 shadow-lg shadow-red-950/20"
          role="alert"
          data-validation-field="author"
          tabIndex={-1}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden="true" />
            <div>
              <p className="font-semibold">A verified author is required to sign.</p>
              <p className="mt-1 leading-6 text-red-200/70">
                Assign a BCBA with a complete staff record before submitting this plan. A typed
                name alone is not treated as author identity.
              </p>
            </div>
          </div>
        </div>
      )}
      {displayedValidationIssues.length > 0 && (
        <div
          id="treatment-plan-validation-summary"
          className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-5 shadow-lg shadow-amber-950/20"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <p className="font-semibold text-amber-100">
                Resolve {displayedValidationIssues.length} submission requirement
                {displayedValidationIssues.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100/70">
                {displayedValidationIssues.slice(0, 8).map((issue) => (
                  <li key={issue.field}>{issue.message}</li>
                ))}
                {displayedValidationIssues.length > 8 && (
                  <li>{displayedValidationIssues.length - 8} more fields remain.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
      {/* 1. Patient Info & Service Requests */}
      <Card className="bg-zinc-950 border border-white/5">
        <CardHeader className="border-b border-white/5 bg-zinc-900/50 pb-4">
          <CardTitle className="text-base text-white flex items-center"><FileText className="w-4 h-4 mr-2 text-zinc-400" /> 1. Patient Information & Service Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          {/* Patient Details */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Provider & Assessment Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Referring Provider</label><input aria-label="Referring provider" type="text" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(referringProvider)}`} value={referringProvider} onChange={(e) => setReferringProvider(e.target.value)} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Provider NPI</label><input aria-label="Referring provider NPI" inputMode="numeric" type="text" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(providerNpi)}`} value={providerNpi} onChange={(e) => setProviderNpi(e.target.value)} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Assessment Start Date</label><input {...getFieldProps('assessmentStartDate', 'Assessment start date')} type="date" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(assessmentStartDate, 'assessmentStartDate')}`} value={assessmentStartDate} onChange={(e) => setAssessmentStartDate(e.target.value)} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Assessment End Date</label><input {...getFieldProps('assessmentEndDate', 'Assessment end date')} type="date" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(assessmentEndDate, 'assessmentEndDate')}`} value={assessmentEndDate} onChange={(e) => setAssessmentEndDate(e.target.value)} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Reassessment Date</label><input aria-label="Reassessment date" type="date" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(reassessmentDate)}`} value={reassessmentDate} onChange={(e) => setReassessmentDate(e.target.value)} /></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Verified Assessor</label><input {...getFieldProps('assessorName', 'Verified assigned BCBA')} type="text" readOnly className={`w-full cursor-not-allowed rounded-md border p-2 text-sm text-zinc-300 ${getHighlightClass(assessorName, 'assessorName')}`} value={assessorName} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Credentials</label><input {...getFieldProps('assessorCredentials', 'Assessor credentials')} type="text" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(assessorCredentials, 'assessorCredentials')}`} value={assessorCredentials} onChange={(e) => setAssessorCredentials(e.target.value)} autoComplete="organization-title" /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Verified Email</label><input aria-label="Verified assigned BCBA email" type="email" readOnly className={`w-full cursor-not-allowed rounded-md border p-2 text-sm text-zinc-300 ${getHighlightClass(assessorEmail)}`} value={assessorEmail} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Phone</label><input aria-label="Assessor phone number" type="tel" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(assessorPhone)}`} value={assessorPhone} onChange={(e) => setAssessorPhone(e.target.value)} autoComplete="tel" /></div>
            </div>
          </div>

          {/* Treatment Intensity Request */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Treatment Intensity Request (CPT Codes)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">97151 (Eval - Auth Period)</label><input {...getFieldProps('hours97151Eval', '97151 evaluation hours per authorization period')} min="0" step="0.25" type="number" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(hours97151Eval, 'hours97151Eval')}`} value={hours97151Eval} onChange={(e) => setHours97151Eval(e.target.value)} placeholder="Enter 0 when not recommended" /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">97151 (Plan - Wkly)</label><input {...getFieldProps('hours97151Plan', '97151 plan development hours per week')} min="0" step="0.25" type="number" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(hours97151Plan, 'hours97151Plan')}`} value={hours97151Plan} onChange={(e) => setHours97151Plan(e.target.value)} placeholder="Enter 0 when not recommended" /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">97153 (Direct 1:1 - Wkly)</label><input {...getFieldProps('hours97153', '97153 direct treatment hours per week')} min="0" step="0.25" type="number" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(hours97153, 'hours97153')}`} value={hours97153} onChange={(e) => setHours97153(e.target.value)} placeholder="Enter 0 when not recommended" /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">97155 (Protocol Mod - Wkly)</label><input {...getFieldProps('hours97155', '97155 protocol modification hours per week')} min="0" step="0.25" type="number" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(hours97155, 'hours97155')}`} value={hours97155} onChange={(e) => setHours97155(e.target.value)} placeholder="Enter 0 when not recommended" /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">97156 (Caregiver Guidance - Wkly)</label><input {...getFieldProps('hours97156', '97156 caregiver guidance hours per week')} min="0" step="0.25" type="number" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(hours97156, 'hours97156')}`} value={hours97156} onChange={(e) => setHours97156(e.target.value)} placeholder="Enter 0 when not recommended" /></div>
            </div>
          </div>

          {/* Location & Schedule */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Service Period, Location & Schedule</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
               <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Service Period Start</label><input {...getFieldProps('servicePeriodStart', 'Service period start month')} type="month" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(servicePeriodStart, 'servicePeriodStart')}`} value={servicePeriodStart} onChange={(e) => setServicePeriodStart(e.target.value)} /></div>
               <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Service Period End</label><input {...getFieldProps('servicePeriodEnd', 'Service period end month')} type="month" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(servicePeriodEnd, 'servicePeriodEnd')}`} value={servicePeriodEnd} onChange={(e) => setServicePeriodEnd(e.target.value)} /></div>
            </div>
            <fieldset {...getFieldProps('primaryLocations', 'Primary service locations')} className={`mb-4 rounded-xl border p-3 ${currentValidation.issues.some((issue) => issue.field === 'primaryLocations') ? 'border-amber-500/50 bg-amber-500/5' : 'border-transparent'}`} tabIndex={-1}>
              <legend className="px-1 text-[11px] font-bold uppercase text-zinc-500">Primary Locations (Check all that apply)</legend>
              <div className="flex flex-wrap gap-4">
                {['Home', 'School', 'Clinic', 'Community', 'Telehealth'].map((loc) => (
                  <label key={loc} className="flex items-center space-x-2 text-sm text-white cursor-pointer">
                    <input type="checkbox" aria-label={`${loc} service location`} className="cursor-pointer rounded border-zinc-700 bg-zinc-900 text-brand-blue-500"
                      checked={primaryLocations.includes(loc)} 
                      onChange={(e) => {
                        if (e.target.checked) setPrimaryLocations([...primaryLocations, loc]);
                        else setPrimaryLocations(primaryLocations.filter(l => l !== loc));
                      }} 
                    />
                    <span>{loc}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset {...getFieldProps('serviceSchedule', 'Proposed service schedule')} className={`rounded-xl border p-3 ${currentValidation.issues.some((issue) => issue.field === 'serviceSchedule') ? 'border-amber-500/50 bg-amber-500/5' : 'border-transparent'}`} tabIndex={-1}>
              <legend className="px-1 text-[11px] font-bold uppercase text-zinc-500">Proposed Schedule of Services</legend>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {SERVICE_DAYS.map((day) => (
                  <div key={day}>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">{day}</label>
                    <input type="text" aria-label={`${day} proposed service time`} className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(serviceSchedule?.[day] || '', 'serviceSchedule')}`} placeholder="Optional" value={serviceSchedule?.[day] || ''} onChange={(e) => setServiceSchedule({...serviceSchedule, [day]: e.target.value})} />
                  </div>
                ))}
              </div>
            </fieldset>
          </div>
        </CardContent>
      </Card>

      {/* 2. Biopsychosocial Information */}
      <Card className="bg-zinc-950 border border-white/5">
        <CardHeader className="border-b border-white/5 bg-zinc-900/50 pb-4">
          <CardTitle className="text-base text-white flex items-center"><FileText className="w-4 h-4 mr-2 text-zinc-400" /> 2. Biopsychosocial Information</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Family Structure</label><textarea aria-label="Family structure" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(familyStructure)}`} value={familyStructure} onChange={(e) => setFamilyStructure(e.target.value)} /></div>
            <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Medical History</label><textarea aria-label="Medical history" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(medicalHistory)}`} value={medicalHistory} onChange={(e) => setMedicalHistory(e.target.value)} /></div>
            <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Developmental History</label><textarea aria-label="Developmental history" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(developmentalHistory)}`} value={developmentalHistory} onChange={(e) => setDevelopmentalHistory(e.target.value)} /></div>
            <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">School</label><textarea aria-label="School information" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(school)}`} value={school} onChange={(e) => setSchool(e.target.value)} /></div>
            <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Related Services</label><textarea aria-label="Related services" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(relatedServices)}`} value={relatedServices} onChange={(e) => setRelatedServices(e.target.value)} /></div>
            <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Client Strengths</label><textarea aria-label="Client strengths" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(clientStrengths)}`} value={clientStrengths} onChange={(e) => setClientStrengths(e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Assessments & Observations */}
      <Card className="bg-zinc-950 border border-white/5">
        <CardHeader className="border-b border-white/5 bg-zinc-900/50 pb-4">
          <CardTitle className="text-base text-white">3. Assessments & Observations</CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          {/* Indirect & Vineland */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Formal Testing & Indirect Assessments</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Parent Interview Date</label><input aria-label="Parent interview date" type="date" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(parentInterviewDate)}`} value={parentInterviewDate} onChange={(e) => setParentInterviewDate(e.target.value)} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Record Review Date</label><input aria-label="Record review date" type="date" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(recordReviewDate)}`} value={recordReviewDate} onChange={(e) => setRecordReviewDate(e.target.value)} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">ATEC Total Score</label><input aria-label="ATEC total score, if administered" type="text" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-900 border ${getHighlightClass(atecScore)}`} value={atecScore} onChange={(e) => setAtecScore(e.target.value)} placeholder="Optional — enter only if administered" /></div>
            </div>
            
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Standardized Assessment Instrument</label>
              <input
                aria-label="Standardized assessment instrument actually administered"
                type="text"
                className={`w-full rounded-md border bg-zinc-900 p-2 text-sm text-white ${getHighlightClass(assessmentTool)}`}
                value={assessmentTool}
                onChange={(e) => setAssessmentTool(e.target.value)}
                placeholder="Optional — enter the instrument actually administered"
              />
            </div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase mb-3">Standard Scores (Optional)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-zinc-900/50 rounded-lg border border-white/5">
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Communication Score</label><input aria-label="Communication standard score" type="text" inputMode="decimal" className={`w-full rounded-md p-3 text-sm text-white bg-zinc-950 border ${getHighlightClass(toolScores.communication || '')}`} value={toolScores.communication || ''} onChange={(e) => setToolScores({ ...toolScores, communication: e.target.value })} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Daily Living Score</label><input aria-label="Daily living standard score" type="text" inputMode="decimal" className={`w-full rounded-md p-3 text-sm text-white bg-zinc-950 border ${getHighlightClass(toolScores.dailyLiving || '')}`} value={toolScores.dailyLiving || ''} onChange={(e) => setToolScores({ ...toolScores, dailyLiving: e.target.value })} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Socialization Score</label><input aria-label="Socialization standard score" type="text" inputMode="decimal" className={`w-full rounded-md p-3 text-sm text-white bg-zinc-950 border ${getHighlightClass(toolScores.socialization || '')}`} value={toolScores.socialization || ''} onChange={(e) => setToolScores({ ...toolScores, socialization: e.target.value })} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Motor Skills Score</label><input aria-label="Motor skills standard score" type="text" inputMode="decimal" className={`w-full rounded-md p-3 text-sm text-white bg-zinc-950 border ${getHighlightClass(toolScores.motor || '')}`} value={toolScores.motor || ''} onChange={(e) => setToolScores({ ...toolScores, motor: e.target.value })} /></div>
            </div>
          </div>

          {/* Observations */}
          <div>
            <h3 className="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Direct Observations</h3>
            <div className="space-y-6">
              <div className="p-4 bg-zinc-900/50 rounded-lg border border-white/5">
                <div className="flex gap-4 mb-4">
                  <div className="flex-1"><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Observation 1 Date</label><input aria-label="Observation 1 date" type="date" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-950 border ${getHighlightClass(observation1Date)}`} value={observation1Date} onChange={(e) => setObservation1Date(e.target.value)} /></div>
                  <div className="flex-1"><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Setting</label><input aria-label="Observation 1 setting" type="text" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-950 border ${getHighlightClass(observation1Setting)}`} value={observation1Setting} onChange={(e) => setObservation1Setting(e.target.value)} /></div>
                </div>
                <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Narrative</label><textarea aria-label="Observation 1 narrative" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border bg-zinc-950 ${getHighlightClass(observation1Narrative)}`} value={observation1Narrative} onChange={(e) => setObservation1Narrative(e.target.value)} /></div>
              </div>
              <div className="p-4 bg-zinc-900/50 rounded-lg border border-white/5">
                <div className="flex gap-4 mb-4">
                  <div className="flex-1"><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Observation 2 Date</label><input aria-label="Observation 2 date" type="date" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-950 border ${getHighlightClass(observation2Date)}`} value={observation2Date} onChange={(e) => setObservation2Date(e.target.value)} /></div>
                  <div className="flex-1"><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Setting</label><input aria-label="Observation 2 setting" type="text" className={`w-full rounded-md p-2 text-sm text-white bg-zinc-950 border ${getHighlightClass(observation2Setting)}`} value={observation2Setting} onChange={(e) => setObservation2Setting(e.target.value)} /></div>
                </div>
                <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Narrative</label><textarea aria-label="Observation 2 narrative" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border bg-zinc-950 ${getHighlightClass(observation2Narrative)}`} value={observation2Narrative} onChange={(e) => setObservation2Narrative(e.target.value)} /></div>
              </div>
            </div>
            <div className="mt-6">
              <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Current Areas of Deficit (Summary)</label>
              <textarea aria-label="Current areas of deficit summary" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(currentDeficitsSummary)}`} value={currentDeficitsSummary} onChange={(e) => setCurrentDeficitsSummary(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. BRP */}
      <Card className="bg-zinc-950 border border-white/5">
        <CardHeader className="border-b border-white/5 bg-zinc-900/50 pb-4 flex flex-row justify-between items-center">
          <CardTitle className="text-base text-white flex items-center"><Activity className="w-4 h-4 mr-2 text-red-500" /> 3. Behavior Reduction Plan (BIP)</CardTitle>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => openTemplateLibrary('BRP')} className="cursor-pointer border-brand-purple-500/50 text-brand-purple-400 bg-brand-purple-500/10 hover:bg-brand-purple-500/20 text-xs py-1 h-8">
              <Library className="w-3 h-3 mr-1" /> Browse Library
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleAddBrp} className="cursor-pointer border-white/10 text-xs py-1 h-8">
              <Plus className="w-3 h-3 mr-1" /> Add Behavior
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="bg-zinc-900/50 p-4 rounded-lg border border-white/5 mb-8">
            <div className="flex justify-between items-center mb-2">
              <label className="text-[11px] font-bold text-zinc-500 uppercase">Maladaptive Behavior Summary</label>
              <select aria-label="Maladaptive behavior severity, if applicable" className={`cursor-pointer rounded p-1 text-xs text-white border ${getHighlightClass(maladaptiveSeverity)}`} value={maladaptiveSeverity} onChange={(e) => setMaladaptiveSeverity(e.target.value)}><option className="bg-zinc-950" value="">Not documented</option><option className="bg-zinc-950" value="Mild">Mild</option><option className="bg-zinc-950" value="Moderate">Moderate</option><option className="bg-zinc-950" value="Severe">Severe</option></select>
            </div>
            <textarea aria-label="Maladaptive behavior summary, if applicable" className={`w-full rounded-md p-2 text-sm text-white h-24 outline-none border ${getHighlightClass(maladaptiveNarrative)}`} placeholder="Document only observed or assessed behavior, when applicable." value={maladaptiveNarrative} onChange={(e) => setMaladaptiveNarrative(e.target.value)} />
          </div>

          {brp.length === 0 ? (
             <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-10 text-center">
               <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.08),transparent_55%)]" />
               <div className="relative mx-auto flex max-w-md flex-col items-center">
                 <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10">
                   <Activity className="h-5 w-5 text-red-300" aria-hidden="true" />
                 </div>
                 <p className="font-medium text-zinc-200">No behavior-reduction targets documented</p>
                 <p className="mt-2 text-sm leading-6 text-zinc-500">
                   Leave this section empty when no behavior-reduction target is clinically indicated,
                   or add an individually authored target.
                 </p>
                 <Button type="button" variant="outline" size="sm" onClick={handleAddBrp} className="mt-5 cursor-pointer border-red-400/25 bg-red-400/5 text-red-200 hover:bg-red-400/10">
                   <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Add behavior target
                 </Button>
               </div>
             </div>
          ) : (
            <div className="space-y-6">
              {brp.map((b, index) => (
                <div key={index} className="bg-zinc-900/50 border border-white/5 rounded-lg p-5 relative group">
                  <div className="absolute top-4 right-4 flex gap-2">
                    <button type="button" aria-label={`Save behavior target ${index + 1} to the goal library`} onClick={() => handleSaveToLibrary('BRP', b)} className="cursor-pointer text-zinc-500 hover:text-brand-purple-400 transition-colors tooltip-trigger" title="Save to Universal Library">
                      <BookmarkPlus className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label={`Remove behavior target ${index + 1}`} onClick={() => handleRemoveBrp(index)} className="cursor-pointer text-zinc-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mr-16">
                    <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-5 gap-2">
                      <div className="col-span-2"><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Target Behavior</label><input {...getFieldProps(`brp.${index}.behavior`, `Behavior target ${index + 1}`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(b.behavior, `brp.${index}.behavior`)}`} value={b.behavior} onChange={(e) => handleUpdateBrp(index, 'behavior', e.target.value)} /></div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Status</label>
                        <select aria-label={`Behavior target ${index + 1} status`} className={`w-full cursor-pointer rounded-md p-2 text-sm text-white border ${getHighlightClass(b.status || 'New')}`} value={b.status || 'New'} onChange={(e) => handleUpdateBrp(index, 'status', e.target.value)}>
                          <option className="bg-zinc-950 text-white" value="New">New</option><option className="bg-zinc-950 text-white" value="Continuing">Continuing</option><option className="bg-zinc-950 text-white" value="On Hold">On Hold</option><option className="bg-zinc-950 text-white" value="Mastered">Mastered</option>
                        </select>
                      </div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Current Level</label><input {...getFieldProps(`brp.${index}.currentLevel`, `Behavior target ${index + 1} current level`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(b.currentLevel || '', `brp.${index}.currentLevel`)}`} value={b.currentLevel || ''} onChange={(e) => handleUpdateBrp(index, 'currentLevel', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Target Date</label><input {...getFieldProps(`brp.${index}.targetDate`, `Behavior target ${index + 1} target date`)} type="month" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(b.targetDate || '', `brp.${index}.targetDate`)}`} value={b.targetDate || ''} onChange={(e) => handleUpdateBrp(index, 'targetDate', e.target.value)} /></div>
                    </div>
                    <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Baseline Rate</label><input {...getFieldProps(`brp.${index}.baseline`, `Behavior target ${index + 1} baseline`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(b.baseline, `brp.${index}.baseline`)}`} value={b.baseline} onChange={(e) => handleUpdateBrp(index, 'baseline', e.target.value)} /></div>
                    <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Mastery Criteria</label><input {...getFieldProps(`brp.${index}.mastery`, `Behavior target ${index + 1} mastery criteria`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(b.mastery || '', `brp.${index}.mastery`)}`} value={b.mastery || ''} onChange={(e) => handleUpdateBrp(index, 'mastery', e.target.value)} /></div>
                    <div className="md:col-span-2"><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Topography</label><textarea {...getFieldProps(`brp.${index}.topography`, `Behavior target ${index + 1} topography`)} className={`w-full rounded-md p-2 text-sm text-white h-16 border ${getHighlightClass(b.topography, `brp.${index}.topography`)}`} value={b.topography} onChange={(e) => handleUpdateBrp(index, 'topography', e.target.value)} /></div>
                    
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Hypothesized Function</label>
                      <select {...getFieldProps(`brp.${index}.function`, `Behavior target ${index + 1} hypothesized function`)} className={`w-full cursor-pointer rounded-md p-2 text-sm text-white border ${getHighlightClass(b.function, `brp.${index}.function`)}`} value={b.function} onChange={(e) => handleUpdateBrp(index, 'function', e.target.value)}>
                        <option className="bg-zinc-950 text-white" value="">-- Select --</option><option className="bg-zinc-950 text-white" value="Escape">Escape</option><option className="bg-zinc-950 text-white" value="Access">Access</option><option className="bg-zinc-950 text-white" value="Attention">Attention</option><option className="bg-zinc-950 text-white" value="Sensory">Sensory</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-1">Risk Level</label>
                      <select aria-label={`Behavior target ${index + 1} risk level`} className="w-full cursor-pointer rounded-md border bg-zinc-900 p-2 text-sm text-white" value={b.risk || ''} onChange={(e) => handleUpdateBrp(index, 'risk', e.target.value)}>
                        <option className="bg-zinc-950 text-white" value="">Not documented</option><option className="bg-zinc-950 text-white" value="Low">Low</option><option className="bg-zinc-950 text-white" value="Medium">Medium</option><option className="bg-zinc-950 text-white" value="High">High</option>
                      </select>
                    </div>

                    <div className="md:col-span-2 border-t border-white/5 pt-4 mt-2">
                      <h4 className="text-xs font-bold text-white mb-3">Intervention Strategies</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Proactive/Antecedent Strategies</label><textarea {...getFieldProps(`brp.${index}.proactive`, `Behavior target ${index + 1} proactive strategies`)} className={`w-full rounded-md p-2 text-sm text-white h-16 border bg-zinc-950 ${getHighlightClass(b.proactive || '', `brp.${index}.proactive`)}`} value={b.proactive || ''} onChange={(e) => handleUpdateBrp(index, 'proactive', e.target.value)} /></div>
                        <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">FERB (Replacement Behavior)</label><textarea {...getFieldProps(`brp.${index}.ferb`, `Behavior target ${index + 1} replacement behavior`)} className={`w-full rounded-md p-2 text-sm text-white h-16 border bg-zinc-950 ${getHighlightClass(b.ferb || '', `brp.${index}.ferb`)}`} value={b.ferb || ''} onChange={(e) => handleUpdateBrp(index, 'ferb', e.target.value)} /></div>
                        <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Reactive/Consequence (De-escalation)</label><textarea {...getFieldProps(`brp.${index}.reactive`, `Behavior target ${index + 1} reactive strategies`)} className={`w-full rounded-md p-2 text-sm text-white h-16 border bg-zinc-950 ${getHighlightClass(b.reactive || '', `brp.${index}.reactive`)}`} value={b.reactive || ''} onChange={(e) => handleUpdateBrp(index, 'reactive', e.target.value)} /></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Skill Goals */}
      <Card className="bg-zinc-950 border border-white/5">
        <CardHeader className="border-b border-white/5 bg-zinc-900/50 pb-4 flex flex-row justify-between items-center">
          <CardTitle className="text-base text-white flex items-center"><Target className="w-4 h-4 mr-2 text-green-500" /> 4. Skill Acquisition Goals</CardTitle>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => openTemplateLibrary('SKILL')} className="cursor-pointer border-brand-purple-500/50 text-brand-purple-400 bg-brand-purple-500/10 hover:bg-brand-purple-500/20 text-xs py-1 h-8">
              <Library className="w-3 h-3 mr-1" /> Browse Library
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleAddSkill} className="cursor-pointer border-white/10 text-xs py-1 h-8">
              <Plus className="w-3 h-3 mr-1" /> Add Skill Goal
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6 mb-8 border-b border-white/10 pb-8">
            <h3 className="text-sm font-bold text-white mb-2">Domain-Specific Functioning</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-zinc-900/50 p-4 rounded-lg border border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase">Language/Communication</label>
                  <select aria-label="Language and communication severity, if assessed" className={`cursor-pointer rounded p-1 text-xs text-white border ${getHighlightClass(langCommSeverity)}`} value={langCommSeverity} onChange={(e) => setLangCommSeverity(e.target.value)}><option className="bg-zinc-950" value="">Not documented</option><option className="bg-zinc-950" value="Mild">Mild</option><option className="bg-zinc-950" value="Moderate">Moderate</option><option className="bg-zinc-950" value="Severe">Severe</option></select>
                </div>
                <textarea aria-label="Language and communication functioning description" className={`w-full rounded-md p-2 text-sm text-white h-24 outline-none border ${getHighlightClass(langCommDescription)}`} placeholder="Document assessed findings, if applicable." value={langCommDescription} onChange={(e) => setLangCommDescription(e.target.value)} />
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-lg border border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase">Social/Emotional</label>
                  <select aria-label="Social and emotional severity, if assessed" className={`cursor-pointer rounded p-1 text-xs text-white border ${getHighlightClass(socialEmotionalSeverity)}`} value={socialEmotionalSeverity} onChange={(e) => setSocialEmotionalSeverity(e.target.value)}><option className="bg-zinc-950" value="">Not documented</option><option className="bg-zinc-950" value="Mild">Mild</option><option className="bg-zinc-950" value="Moderate">Moderate</option><option className="bg-zinc-950" value="Severe">Severe</option></select>
                </div>
                <textarea aria-label="Social and emotional functioning description" className={`w-full rounded-md p-2 text-sm text-white h-24 outline-none border ${getHighlightClass(socialEmotionalDescription)}`} placeholder="Document assessed findings, if applicable." value={socialEmotionalDescription} onChange={(e) => setSocialEmotionalDescription(e.target.value)} />
              </div>
              <div className="bg-zinc-900/50 p-4 rounded-lg border border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase">Adaptive Functioning</label>
                  <select aria-label="Adaptive functioning severity, if assessed" className={`cursor-pointer rounded p-1 text-xs text-white border ${getHighlightClass(adaptiveSeverity)}`} value={adaptiveSeverity} onChange={(e) => setAdaptiveSeverity(e.target.value)}><option className="bg-zinc-950" value="">Not documented</option><option className="bg-zinc-950" value="Mild">Mild</option><option className="bg-zinc-950" value="Moderate">Moderate</option><option className="bg-zinc-950" value="Severe">Severe</option></select>
                </div>
                <textarea aria-label="Adaptive functioning description" className={`w-full rounded-md p-2 text-sm text-white h-24 outline-none border ${getHighlightClass(adaptiveDescription)}`} placeholder="Document assessed findings, if applicable." value={adaptiveDescription} onChange={(e) => setAdaptiveDescription(e.target.value)} />
              </div>
            </div>
          </div>

          {skillGoals.length === 0 ? (
            <div data-validation-field="skillGoals" tabIndex={-1} className="relative overflow-hidden rounded-2xl border border-dashed border-amber-400/25 bg-amber-400/[0.04] px-6 py-10 text-center">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.09),transparent_58%)]" />
              <div className="relative mx-auto flex max-w-md flex-col items-center">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
                  <Target className="h-5 w-5 text-emerald-300" aria-hidden="true" />
                </div>
                <p className="font-medium text-zinc-200">Add the first individualized skill goal</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Submission requires at least one goal with baseline, current level, mastery criteria,
                  and a target date.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={handleAddSkill} className="mt-5 cursor-pointer border-emerald-400/25 bg-emerald-400/5 text-emerald-200 hover:bg-emerald-400/10">
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Add skill goal
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {skillGoals.map((s, index) => (
                <div key={index} className="flex flex-col md:flex-row gap-4 items-start bg-zinc-900/30 p-4 rounded-lg border border-white/5 relative pr-12">
                  <div className="w-full md:w-1/4 space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Domain</label>
                      <select {...getFieldProps(`skillGoals.${index}.domain`, `Skill goal ${index + 1} domain`)} className={`w-full cursor-pointer rounded-md p-2 text-sm text-white border ${getHighlightClass(s.domain, `skillGoals.${index}.domain`)}`} value={s.domain} onChange={(e) => handleUpdateSkill(index, 'domain', e.target.value)}>
                        <option className="bg-zinc-950 text-white" value="">-- Domain --</option><option className="bg-zinc-950 text-white" value="Communication">Communication</option><option className="bg-zinc-950 text-white" value="Play/Leisure">Play & Leisure</option><option className="bg-zinc-950 text-white" value="Social">Social</option><option className="bg-zinc-950 text-white" value="Adaptive">Adaptive</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Status</label>
                      <select aria-label={`Skill goal ${index + 1} status`} className={`w-full cursor-pointer rounded-md p-2 text-sm text-white border ${getHighlightClass(s.status || 'New')}`} value={s.status || 'New'} onChange={(e) => handleUpdateSkill(index, 'status', e.target.value)}>
                        <option className="bg-zinc-950 text-white" value="New">New Goal</option><option className="bg-zinc-950 text-white" value="Continuing">Continuing</option><option className="bg-zinc-950 text-white" value="On Hold">On Hold</option><option className="bg-zinc-950 text-white" value="Mastered">Mastered</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex-1 w-full space-y-2">
                    <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Objective</label><input {...getFieldProps(`skillGoals.${index}.description`, `Skill goal ${index + 1} objective`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(s.description, `skillGoals.${index}.description`)}`} value={s.description} onChange={(e) => handleUpdateSkill(index, 'description', e.target.value)} /></div>
                    <div className="grid grid-cols-4 gap-2">
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Baseline</label><input {...getFieldProps(`skillGoals.${index}.baseline`, `Skill goal ${index + 1} baseline`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(s.baseline, `skillGoals.${index}.baseline`)}`} value={s.baseline} onChange={(e) => handleUpdateSkill(index, 'baseline', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Current Level</label><input {...getFieldProps(`skillGoals.${index}.currentLevel`, `Skill goal ${index + 1} current level`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(s.currentLevel || '', `skillGoals.${index}.currentLevel`)}`} value={s.currentLevel || ''} onChange={(e) => handleUpdateSkill(index, 'currentLevel', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Mastery Criteria</label><input {...getFieldProps(`skillGoals.${index}.mastery`, `Skill goal ${index + 1} mastery criteria`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(s.mastery, `skillGoals.${index}.mastery`)}`} value={s.mastery} onChange={(e) => handleUpdateSkill(index, 'mastery', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Target Date</label><input {...getFieldProps(`skillGoals.${index}.targetDate`, `Skill goal ${index + 1} target date`)} type="month" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(s.targetDate || '', `skillGoals.${index}.targetDate`)}`} value={s.targetDate || ''} onChange={(e) => handleUpdateSkill(index, 'targetDate', e.target.value)} /></div>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4 flex flex-col gap-3">
                    <button type="button" aria-label={`Save skill goal ${index + 1} to the goal library`} onClick={() => handleSaveToLibrary('SKILL', s)} className="cursor-pointer text-zinc-500 hover:text-brand-purple-400 transition-colors" title="Save to Universal Library"><BookmarkPlus className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Remove skill goal ${index + 1}`} onClick={() => handleRemoveSkill(index)} className="cursor-pointer text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Parent Goals */}
      <Card className="bg-zinc-950 border border-white/5">
        <CardHeader className="border-b border-white/5 bg-zinc-900/50 pb-4 flex flex-row justify-between items-center">
          <CardTitle className="text-base text-white flex items-center"><Users className="w-4 h-4 mr-2 text-purple-500" /> 5. Caregiver Goals</CardTitle>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => openTemplateLibrary('PARENT')} className="cursor-pointer border-brand-purple-500/50 text-brand-purple-400 bg-brand-purple-500/10 hover:bg-brand-purple-500/20 text-xs py-1 h-8">
              <Library className="w-3 h-3 mr-1" /> Browse Library
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleAddParentGoal} className="cursor-pointer border-white/10 text-xs py-1 h-8"><Plus className="w-3 h-3 mr-1" /> Add Caregiver Goal</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {parentGoals.length === 0 ? (
            <div data-validation-field="parentGoals" tabIndex={-1} className="relative overflow-hidden rounded-2xl border border-dashed border-amber-400/25 bg-amber-400/[0.04] px-6 py-10 text-center">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.10),transparent_58%)]" />
              <div className="relative mx-auto flex max-w-md flex-col items-center">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-400/10">
                  <Users className="h-5 w-5 text-purple-300" aria-hidden="true" />
                </div>
                <p className="font-medium text-zinc-200">Add the first individualized caregiver goal</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Submission requires a measurable objective with baseline, current level, mastery
                  criteria, and a target date.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={handleAddParentGoal} className="mt-5 cursor-pointer border-purple-400/25 bg-purple-400/5 text-purple-200 hover:bg-purple-400/10">
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Add caregiver goal
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {parentGoals.map((p, index) => (
                <div key={index} className="flex flex-col md:flex-row gap-4 items-start bg-zinc-900/30 p-4 rounded-lg border border-white/5 relative pr-12">
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1"><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Objective</label><input {...getFieldProps(`parentGoals.${index}.description`, `Caregiver goal ${index + 1} objective`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(p.description, `parentGoals.${index}.description`)}`} value={p.description} onChange={(e) => handleUpdateParentGoal(index, 'description', e.target.value)} /></div>
                      <div className="w-32">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Status</label>
                        <select aria-label={`Caregiver goal ${index + 1} status`} className={`w-full cursor-pointer rounded-md p-2 text-sm text-white border ${getHighlightClass(p.status || 'New')}`} value={p.status || 'New'} onChange={(e) => handleUpdateParentGoal(index, 'status', e.target.value)}>
                          <option className="bg-zinc-950 text-white" value="New">New</option><option className="bg-zinc-950 text-white" value="Continuing">Continuing</option><option className="bg-zinc-950 text-white" value="On Hold">On Hold</option><option className="bg-zinc-950 text-white" value="Mastered">Mastered</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Baseline</label><input {...getFieldProps(`parentGoals.${index}.baseline`, `Caregiver goal ${index + 1} baseline`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(p.baseline, `parentGoals.${index}.baseline`)}`} value={p.baseline} onChange={(e) => handleUpdateParentGoal(index, 'baseline', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Current Level</label><input {...getFieldProps(`parentGoals.${index}.currentLevel`, `Caregiver goal ${index + 1} current level`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(p.currentLevel || '', `parentGoals.${index}.currentLevel`)}`} value={p.currentLevel || ''} onChange={(e) => handleUpdateParentGoal(index, 'currentLevel', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Mastery Criteria</label><input {...getFieldProps(`parentGoals.${index}.mastery`, `Caregiver goal ${index + 1} mastery criteria`)} type="text" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(p.mastery, `parentGoals.${index}.mastery`)}`} value={p.mastery} onChange={(e) => handleUpdateParentGoal(index, 'mastery', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Target Date</label><input {...getFieldProps(`parentGoals.${index}.targetDate`, `Caregiver goal ${index + 1} target date`)} type="month" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(p.targetDate || '', `parentGoals.${index}.targetDate`)}`} value={p.targetDate || ''} onChange={(e) => handleUpdateParentGoal(index, 'targetDate', e.target.value)} /></div>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4 flex flex-col gap-3">
                    <button type="button" aria-label={`Save caregiver goal ${index + 1} to the goal library`} onClick={() => handleSaveToLibrary('PARENT', p)} className="cursor-pointer text-zinc-500 hover:text-brand-purple-400 transition-colors" title="Save to Universal Library"><BookmarkPlus className="w-4 h-4" /></button>
                    <button type="button" aria-label={`Remove caregiver goal ${index + 1}`} onClick={() => handleRemoveParentGoal(index)} className="cursor-pointer text-zinc-500 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. Care Coordination & Preferences */}
      <Card className="bg-zinc-950 border border-white/5">
        <CardHeader className="border-b border-white/5 bg-zinc-900/50 pb-4 flex flex-row justify-between items-center">
          <CardTitle className="text-base text-white">6. Care Coordination & Preferences</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={handleAddCareMeeting} className="cursor-pointer border-white/10 text-xs py-1 h-8"><Plus className="w-3 h-3 mr-1" /> Add Meeting</Button>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          <div>
            <h3 className="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Medical Necessity, Barriers & Generalization</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Statement of Medical Necessity</label><textarea {...getFieldProps('medicalNecessity', 'Individualized medical necessity statement')} className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(medicalNecessity, 'medicalNecessity')}`} value={medicalNecessity} onChange={(e) => setMedicalNecessity(e.target.value)} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Barriers to Treatment</label><textarea aria-label="Barriers to treatment" className={`w-full rounded-lg p-3 text-sm text-white h-24 outline-none border ${getHighlightClass(barriersToTreatment)}`} value={barriersToTreatment} onChange={(e) => setBarriersToTreatment(e.target.value)} /></div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Generalization Plan</label>
              <textarea {...getFieldProps('generalizationPlan', 'Individualized generalization plan')} className={`w-full rounded-lg p-3 text-sm text-white h-20 outline-none border ${getHighlightClass(generalizationPlan, 'generalizationPlan')}`} value={generalizationPlan} onChange={(e) => setGeneralizationPlan(e.target.value)} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Preference Assessment</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Assessment Date</label><input aria-label="Preference assessment date, if administered" type="date" className={`w-full rounded-md p-2 text-sm text-white border ${getHighlightClass(preferenceAssessmentDate)}`} value={preferenceAssessmentDate} onChange={(e) => setPreferenceAssessmentDate(e.target.value)} /></div>
              <div><label className="block text-[11px] font-bold text-zinc-500 uppercase mb-2">Highly Preferred Items</label><textarea aria-label="Highly preferred items identified, if assessed" className={`w-full rounded-md p-2 text-sm text-white h-16 border ${getHighlightClass(highlyPreferredItems)}`} value={highlyPreferredItems} onChange={(e) => setHighlyPreferredItems(e.target.value)} /></div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white mb-4 border-b border-white/10 pb-2">Care Coordination Meetings</h3>
            {careCoordinationMeetings.length === 0 ? (
               <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-8 text-center">
                 <div className="relative mx-auto flex max-w-sm flex-col items-center">
                   <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/10">
                     <Users className="h-4 w-4 text-blue-300" aria-hidden="true" />
                   </div>
                   <p className="font-medium text-zinc-300">No coordination meetings documented</p>
                   <p className="mt-1 text-sm text-zinc-500">Add a meeting only when contact occurred.</p>
                   <Button type="button" variant="outline" size="sm" onClick={handleAddCareMeeting} className="mt-4 cursor-pointer border-blue-400/20 text-blue-200">
                     <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Add meeting
                   </Button>
                 </div>
               </div>
            ) : (
              <div className="space-y-4">
                {careCoordinationMeetings.map((c, index) => (
                  <div key={index} className="flex gap-4 items-start bg-zinc-900/50 p-4 rounded-lg border border-white/5 relative">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Provider (e.g. SLP, Teacher)</label><input aria-label={`Care coordination meeting ${index + 1} provider`} type="text" className="w-full rounded-md p-2 text-sm text-white bg-zinc-950 border border-zinc-800" value={c.provider} onChange={(e) => handleUpdateCareMeeting(index, 'provider', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Contact Info</label><input aria-label={`Care coordination meeting ${index + 1} contact information`} type="text" className="w-full rounded-md p-2 text-sm text-white bg-zinc-950 border border-zinc-800" value={c.contactInfo} onChange={(e) => handleUpdateCareMeeting(index, 'contactInfo', e.target.value)} /></div>
                      <div><label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Notes / Goals Addressed</label><input aria-label={`Care coordination meeting ${index + 1} notes and goals addressed`} type="text" className="w-full rounded-md p-2 text-sm text-white bg-zinc-950 border border-zinc-800" value={c.notes} onChange={(e) => handleUpdateCareMeeting(index, 'notes', e.target.value)} /></div>
                    </div>
                    <button type="button" aria-label={`Remove care coordination meeting ${index + 1}`} onClick={() => handleRemoveCareMeeting(index)} className="mt-6 cursor-pointer text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 7. Crisis & Discharge Plan */}
      <Card className="bg-zinc-950 border border-white/5">
        <CardHeader className="border-b border-white/5 bg-zinc-900/50 pb-4"><CardTitle className="text-base text-white">7. Crisis & Discharge Planning</CardTitle></CardHeader>
        <CardContent className="p-6 space-y-6">
          <div><label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Crisis/Safety Plan</label><textarea aria-label="Individualized crisis and safety plan, if indicated" className={`w-full rounded-lg p-3 text-sm text-white h-20 outline-none border ${getHighlightClass(crisisPlan)}`} value={crisisPlan} onChange={(e) => setCrisisPlan(e.target.value)} /></div>
          <div><label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Discharge Fading Plan</label><textarea aria-label="Individualized discharge fading plan" className={`w-full rounded-lg p-3 text-sm text-white h-20 outline-none border ${getHighlightClass(dischargeFadingPlan)}`} value={dischargeFadingPlan} onChange={(e) => setDischargeFadingPlan(e.target.value)} /></div>
          <div><label className="block text-xs font-bold text-zinc-500 uppercase mb-2">Discharge Criteria</label><textarea {...getFieldProps('dischargeCriteria', 'Individualized discharge criteria')} className={`w-full rounded-lg p-3 text-sm text-white h-20 outline-none border ${getHighlightClass(dischargeCriteria, 'dischargeCriteria')}`} value={dischargeCriteria} onChange={(e) => setDischargeCriteria(e.target.value)} /></div>
        </CardContent>
      </Card>

      {/* Signature */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.10),transparent_45%)]" />
        <div className="relative space-y-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-400/10">
              <ShieldCheck className="h-5 w-5 text-blue-300" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Session-verified electronic signature</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                The server records the active signed-in user. Browser-entered signer names are not accepted.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] p-4">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                Assigned BCBA of record
              </p>
              <p className="mt-1.5 text-sm font-semibold text-white">
                {assignedAuthor?.name || 'No verified assignment'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {assignedAuthor?.email || 'Assign an active BCBA before normal final signing.'}
              </p>
            </div>
            <div className="rounded-xl border border-blue-400/20 bg-blue-400/[0.07] p-4">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">
                Last verified session identity
              </p>
              <p className="mt-1.5 text-sm font-semibold text-white">
                {verifiedSessionIdentity?.name || 'Verified by the server on save'}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {verifiedSessionIdentity?.email || 'No identity is accepted from this browser payload.'}
              </p>
            </div>
          </div>
          <div>
            <label
              htmlFor="treatment-plan-override-reason"
              className="block text-xs font-bold uppercase tracking-wide text-zinc-400"
            >
              Leadership final-sign override reason
            </label>
            <textarea
              id="treatment-plan-override-reason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Required only when a Clinical Director or CEO final-signs instead of the assigned active BCBA."
              className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-950/90 p-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-amber-400/50"
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Assigned active BCBAs leave this blank. Leadership overrides are stored in AuditLogVault.
            </p>
          </div>
        </div>
      </div>

      <div className="sticky bottom-4 z-20 flex flex-col gap-4 rounded-2xl border border-white/10 bg-zinc-950/90 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isReadyToSubmit ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-amber-400/20 bg-amber-400/10'}`}>
            {isReadyToSubmit ? <CheckCircle className="h-5 w-5 text-emerald-300" aria-hidden="true" /> : <AlertCircle className="h-5 w-5 text-amber-300" aria-hidden="true" />}
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-200">
              {isReadyToSubmit ? 'Ready for verified signature' : `${currentValidation.issues.length} requirement${currentValidation.issues.length === 1 ? '' : 's'} remaining`}
            </p>
            <p className="text-xs text-zinc-500">Draft changes are retained on screen if a save fails.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => handleSave(false)}
            className="cursor-pointer border-white/10 disabled:cursor-not-allowed"
          >
            <Cloud className="mr-2 h-4 w-4" aria-hidden="true" />
            Save draft now
          </Button>
        <Button 
          type="button"
          variant="primary" 
          disabled={isPending} 
          onClick={() => handleSave(true)} 
          aria-describedby={displayedValidationIssues.length ? 'treatment-plan-validation-summary' : undefined}
          className={`cursor-pointer font-bold tracking-wide px-8 transition-all duration-500 disabled:cursor-not-allowed ${
            isReadyToSubmit 
              ? 'bg-green-500 hover:bg-green-600 text-white shadow-[0_0_20px_rgba(34,197,94,0.6)] border border-green-400 scale-105' 
              : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/25'
          }`}
        >
          <Send className="w-4 h-4 mr-2" aria-hidden="true" /> Validate, E-Sign & Send
        </Button>
        </div>
      </div>

      {/* Template Modal */}
      {showTemplateModal && createPortal(
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="goal-library-title" className="bg-zinc-950 border border-brand-purple-500/20 rounded-2xl w-full max-w-3xl max-h-[80vh] flex flex-col shadow-2xl shadow-purple-950/30">
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-zinc-900/50 rounded-t-xl">
              <h2 id="goal-library-title" className="text-lg font-bold text-white flex items-center">
                <Library className="w-5 h-5 text-brand-purple-500 mr-2" />
                Universal Goal Library ({templateType})
              </h2>
              <button type="button" aria-label="Close goal library" onClick={() => setShowTemplateModal(false)} className="cursor-pointer rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b border-white/10 bg-zinc-900 flex gap-4">
              <input 
                ref={templateSearchInput}
                aria-label="Search goal templates"
                type="text" 
                placeholder="Search templates by keyword..." 
                className="flex-1 bg-zinc-950 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-brand-purple-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {templateType === 'SKILL' && (
                <select 
                  aria-label="Filter goal templates by domain"
                  className="w-48 cursor-pointer bg-zinc-950 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-brand-purple-500 outline-none"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                >
                  <option className="bg-zinc-950 text-white" value="">All Domains</option>
                  <option className="bg-zinc-950 text-white" value="Communication">Communication</option>
                  <option className="bg-zinc-950 text-white" value="Play/Leisure">Play & Leisure</option>
                  <option className="bg-zinc-950 text-white" value="Social">Social</option>
                  <option className="bg-zinc-950 text-white" value="Adaptive">Adaptive</option>
                </select>
              )}
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {isFetchingTemplates ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading templates…</div>
              ) : templates.filter(t => 
                  ((t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                  (t.behavior || '').toLowerCase().includes(searchQuery.toLowerCase())) &&
                  (domainFilter ? t.domain === domainFilter : true)
                ).length === 0 ? (
                <div className="relative overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-6 py-10 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-400/10">
                      <Sparkles className="h-4 w-4 text-purple-300" aria-hidden="true" />
                    </div>
                    <p className="font-medium text-zinc-300">No matching templates</p>
                    <p className="mt-1 text-sm text-zinc-500">Adjust the search or author this goal directly.</p>
                  </div>
                </div>
              ) : (
                templates.filter(t => 
                  ((t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                  (t.behavior || '').toLowerCase().includes(searchQuery.toLowerCase())) &&
                  (domainFilter ? t.domain === domainFilter : true)
                ).map((t, idx) => (
                  <div key={idx} className="bg-zinc-900 border border-white/5 rounded-lg p-4 hover:border-brand-purple-500/50 transition-colors flex justify-between items-center gap-4">
                    <div className="flex-1">
                      {t.type === 'SKILL' && (
                        <>
                          <div className="text-xs text-brand-purple-400 font-bold mb-1">{t.domain}</div>
                          <div className="text-sm text-white mb-2">{t.description}</div>
                          <div className="text-xs text-zinc-500">Mastery: {t.mastery}</div>
                        </>
                      )}
                      {t.type === 'BRP' && (
                        <>
                          <div className="text-xs text-red-400 font-bold mb-1">Target: {t.behavior} (Function: {t.function})</div>
                          <div className="text-sm text-zinc-300 mb-1"><span className="text-zinc-500">Topography:</span> {t.topography}</div>
                          <div className="text-xs text-zinc-400 line-clamp-1"><span className="text-zinc-500">Ant:</span> {t.antecedent}</div>
                        </>
                      )}
                      {t.type === 'PARENT' && (
                        <>
                          <div className="text-sm text-white mb-2">{t.description}</div>
                          <div className="text-xs text-zinc-500">Mastery: {t.mastery}</div>
                        </>
                      )}
                      {t.authorName && <div className="text-[10px] text-zinc-600 mt-2">Added by {t.authorName}</div>}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => insertTemplate(t)} className="cursor-pointer shrink-0 border-brand-purple-500/30 text-brand-purple-400 hover:bg-brand-purple-500/10">
                      <Plus className="w-4 h-4 mr-1" /> Use Template
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
