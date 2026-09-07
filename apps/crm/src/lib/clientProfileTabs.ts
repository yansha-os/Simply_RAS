import { statusIndex } from './clientStatusGates';

export type ClientProfileTab =
  | 'overview'
  | 'documents'
  | 'messages'
  | 'p2p'
  | 'bcba_documents'
  | 'assign_bcba'
  | 'clinical'
  | 'billing'
  | 'billing_vob'
  | 'billing_assessment_pa'
  | 'billing_treatment_pa'
  | 'billing_auth_units'
  | 'assignments'
  | 'assessment'
  | 'treatment_plan'
  | 'clinical_goals'
  | 'session_emr'
  | 'chart_progress'
  | 'report'
  | 'staffing_integrity'
  | 'case_coord_scheduling'
  | 'session_notes'
  | 'billing_documents'
  | 'billing_handoff';

/** Workflow-scoped billing tabs — progressive disclosure by client status. */
export type BillingWorkflowTab =
  | 'billing_vob'
  | 'billing_assessment_pa'
  | 'billing_treatment_pa'
  | 'billing_auth_units'
  | 'session_notes'
  | 'billing_documents'
  | 'overview';

export type BillingTabVisibility = Record<BillingWorkflowTab, boolean>;

const idx = statusIndex;

export function getBillingTabVisibility(input: {
  clientStatus: string;
  showSessionNotesTab: boolean;
}): BillingTabVisibility {
  const { clientStatus, showSessionNotesTab } = input;
  const s = idx(clientStatus);
  const pastClinicalReview = s >= idx('CLINICAL_REVIEW_APPROVED');
  const beforeAssessmentPaApproved = s < idx('PA_APPROVED');
  const inAssessmentPaPhase =
    s >= idx('VOB_COMPLETED') && s < idx('REPORT_ASSEMBLED');
  const inTreatmentPaPhase =
    s >= idx('REPORT_ASSEMBLED') && s < idx('TX_PA_APPROVED');
  const inAuthUnitsPhase =
    s >= idx('TX_PA_APPROVED') && s < idx('ACTIVE');
  const inClaimsPhase = s >= idx('ACTIVE');

  return {
    billing_vob: pastClinicalReview && beforeAssessmentPaApproved,
    billing_assessment_pa: inAssessmentPaPhase,
    billing_treatment_pa: inTreatmentPaPhase,
    billing_auth_units: inAuthUnitsPhase,
    session_notes: showSessionNotesTab && inClaimsPhase,
    billing_documents: true,
    overview: true,
  };
}

/** Land billing agents on the tab that matches the client's pipeline stage. */
export function getDefaultBillingTab(input: {
  clientStatus: string;
  showSessionNotesTab: boolean;
}): BillingWorkflowTab {
  const visibility = getBillingTabVisibility(input);
  const s = idx(input.clientStatus);

  if (visibility.session_notes && s >= idx('ACTIVE')) {
    return 'session_notes';
  }
  if (visibility.billing_treatment_pa && s >= idx('REPORT_ASSEMBLED')) {
    return 'billing_treatment_pa';
  }
  if (visibility.billing_auth_units && s >= idx('TX_PA_APPROVED')) {
    return 'billing_auth_units';
  }
  if (visibility.billing_assessment_pa && s >= idx('VOB_COMPLETED')) {
    return 'billing_assessment_pa';
  }
  if (visibility.billing_vob) {
    return 'billing_vob';
  }

  const ordered: BillingWorkflowTab[] = [
    'session_notes',
    'billing_auth_units',
    'billing_treatment_pa',
    'billing_assessment_pa',
    'billing_vob',
    'billing_documents',
    'overview',
  ];
  return ordered.find((tab) => visibility[tab]) ?? 'overview';
}

const BILLING_TAB_QUERY: Record<BillingWorkflowTab, string> = {
  billing_vob: 'vob',
  billing_assessment_pa: 'assessment_pa',
  billing_treatment_pa: 'treatment_pa',
  billing_auth_units: 'auth_units',
  session_notes: 'session_notes',
  billing_documents: 'billing_documents',
  overview: 'overview',
};

/** Deep-link billing profile to the workflow tab for a client's current stage. */
export function billingProfileHref(
  clientId: string,
  clientStatus: string,
  showSessionNotesTab = false
): string {
  const tab = getDefaultBillingTab({ clientStatus, showSessionNotesTab });
  return `/client/${clientId}?mode=billing&tab=${BILLING_TAB_QUERY[tab]}`;
}

/** PA queue cards — lane-specific tab when status alone is ambiguous. */
export function billingPaQueueHref(
  clientId: string,
  kind: 'ASSESSMENT' | 'TREATMENT',
  needsVob = false
): string {
  const tab =
    kind === 'TREATMENT'
      ? 'treatment_pa'
      : needsVob
        ? 'vob'
        : 'assessment_pa';
  return `/client/${clientId}?mode=billing&tab=${tab}`;
}

/** Workflow handoff tabs only — used for queue deep-links and stage defaults. */
export type ClinicalSupportHandoffTab =
  | 'clinical'
  | 'assessment'
  | 'report'
  | 'billing_handoff';

export type ClinicalSupportWorkflowTab =
  | ClinicalSupportHandoffTab
  | 'overview'
  | 'documents'
  | 'messages';

export type ClinicalSupportTabVisibility = Record<
  ClinicalSupportWorkflowTab,
  boolean
>;

export function getClinicalSupportTabVisibility(
  clientStatus: string,
): ClinicalSupportTabVisibility {
  const s = idx(clientStatus);
  return {
    clinical: s >= idx('DOCS_APPROVED_INTAKE'),
    assessment: s >= idx('PA_APPROVED'),
    report: s >= idx('ASSESSMENT_SCHEDULED'),
    billing_handoff: s >= idx('REPORT_ASSEMBLED'),
    overview: true,
    documents: false,
    messages: true,
  };
}

/** Land Clinical Support on the tab that matches the client's handoff stage. */
export function getDefaultClinicalSupportTab(
  clientStatus: string,
): ClinicalSupportHandoffTab {
  const s = idx(clientStatus);
  if (s >= idx('REPORT_ASSEMBLED') && s < idx('TX_PA_SUBMITTED')) {
    return 'billing_handoff';
  }
  if (s >= idx('ASSESSMENT_SCHEDULED') && s < idx('REPORT_ASSEMBLED')) {
    return 'report';
  }
  if (s >= idx('PA_APPROVED') && s < idx('ASSESSMENT_SCHEDULED')) {
    return 'assessment';
  }
  if (s >= idx('DOCS_APPROVED_INTAKE')) {
    return 'clinical';
  }
  return 'clinical';
}

const CLINICAL_SUPPORT_TAB_QUERY: Record<ClinicalSupportHandoffTab, string> = {
  clinical: 'clinical',
  assessment: 'assessment',
  report: 'report',
  billing_handoff: 'billing_handoff',
};

/** Deep-link Clinical Support queue cards to the correct profile workflow tab. */
export function clinicalSupportProfileHrefFromStatus(
  clientId: string,
  clientStatus: string,
): string {
  const tab = getDefaultClinicalSupportTab(clientStatus);
  return `/client/${clientId}?mode=clinical&tab=${CLINICAL_SUPPORT_TAB_QUERY[tab]}`;
}

function resolveBillingQueryTab(
  queryTab: string | undefined,
  visibility: BillingTabVisibility,
  defaultTab: BillingWorkflowTab
): ClientProfileTab | null {
  if (!queryTab) return null;

  const alias: Record<string, ClientProfileTab> = {
    vob: 'billing_vob',
    benefits: 'billing_vob',
    billing_vob: 'billing_vob',
    assessment_pa: 'billing_assessment_pa',
    'assessment-pa': 'billing_assessment_pa',
    billing_assessment_pa: 'billing_assessment_pa',
    treatment_pa: 'billing_treatment_pa',
    'treatment-pa': 'billing_treatment_pa',
    billing_treatment_pa: 'billing_treatment_pa',
    auth_units: 'billing_auth_units',
    'auth-units': 'billing_auth_units',
    billing_auth_units: 'billing_auth_units',
    auth: 'billing_auth_units',
    billing: defaultTab,
    pa: defaultTab,
    billing_documents: 'billing_documents',
    'billing-documents': 'billing_documents',
    billing_docs: 'billing_documents',
    documents: 'billing_documents',
    session_notes: 'session_notes',
    'session-notes': 'session_notes',
    claims: 'session_notes',
    plutus: 'session_notes',
    notes: 'session_notes',
    overview: 'overview',
    messages: defaultTab,
  };

  const mapped = alias[queryTab];
  if (!mapped) return null;

  if (mapped in visibility) {
    return visibility[mapped as BillingWorkflowTab] ? mapped : defaultTab;
  }
  return mapped;
}

export type ClientProfileTabSelection = {
  contextKey: string;
  tab: ClientProfileTab;
};

export function shouldShowStaffingIntegrityTab(
  mode: string | undefined,
  status: string
): boolean {
  if (mode !== 'case-coord') return false;

  const currentStatusIndex = statusIndex(status);
  return (
    currentStatusIndex >= 0 &&
    currentStatusIndex >= statusIndex('TX_PA_APPROVED')
  );
}

export function resolveRequestedClientProfileTab(input: {
  mode?: string;
  queryTab?: string;
  clientStatus?: string;
  showSessionNotesTab?: boolean;
  hasP2PAlert: boolean;
  showChartProgressTab: boolean;
  showStaffingIntegrityTab: boolean;
}): ClientProfileTab {
  const {
    mode,
    queryTab,
    clientStatus,
    showSessionNotesTab = false,
    hasP2PAlert,
    showChartProgressTab,
    showStaffingIntegrityTab,
  } = input;
  const isCaseCoordMode = mode === 'case-coord';
  const isClinicalReviewMode = mode === 'clinical';
  const isBcbaMode =
    mode === 'bcba' ||
    mode === 'clinical_director' ||
    mode === 'treatment_plan' ||
    mode === 'assessment_prep' ||
    mode === 'p2p';
  const isBillingMode = mode === 'billing';
  const showClinicalGoalsTab = isBcbaMode || isCaseCoordMode;
  const wantsChartProgress =
    queryTab === 'chart_progress' ||
    queryTab === 'session_history' ||
    queryTab === 'chart';
  const wantsBilling =
    isBillingMode ||
    queryTab === 'billing' ||
    queryTab === 'auth' ||
    queryTab === 'auth_units' ||
    queryTab === 'auth-units' ||
    queryTab === 'pa';
  const wantsClinicalReview =
    queryTab === 'clinical' || queryTab === 'clinical_review';
  const wantsClinicalGoals =
    queryTab === 'clinical_goals' || queryTab === 'goals';
  const wantsStaffingIntegrity =
    queryTab === 'staffing_integrity' ||
    queryTab === 'staffing-integrity' ||
    queryTab === 'integrity' ||
    queryTab === 'hr_staffing';
  const wantsSessionNotes =
    queryTab === 'session_notes' ||
    queryTab === 'session-notes' ||
    queryTab === 'claims' ||
    queryTab === 'plutus' ||
    queryTab === 'notes';
  if (isBillingMode) {
    const billingVisibility = getBillingTabVisibility({
      clientStatus: clientStatus ?? 'INQUIRY',
      showSessionNotesTab,
    });
    const defaultBillingTab = getDefaultBillingTab({
      clientStatus: clientStatus ?? 'INQUIRY',
      showSessionNotesTab,
    });
    const resolvedBillingTab = resolveBillingQueryTab(
      queryTab,
      billingVisibility,
      defaultBillingTab
    );
    if (resolvedBillingTab) return resolvedBillingTab;
    if (wantsSessionNotes && billingVisibility.session_notes) {
      return 'session_notes';
    }
    return defaultBillingTab;
  }

  if (isClinicalReviewMode) {
    const cssVisibility = getClinicalSupportTabVisibility(
      clientStatus ?? 'INQUIRY',
    );
    const defaultCssTab = getDefaultClinicalSupportTab(
      clientStatus ?? 'INQUIRY',
    );

    const cssAlias: Record<string, ClientProfileTab> = {
      clinical: 'clinical',
      clinical_review: 'clinical',
      assessment: 'assessment',
      '97151': 'assessment',
      assessment_prep: 'assessment',
      report: 'report',
      report_assembly: 'report',
      billing_handoff: 'billing_handoff',
      'billing-handoff': 'billing_handoff',
      treatment_pa: 'billing_handoff',
    };

    if (queryTab) {
      const mapped = cssAlias[queryTab];
      if (mapped && mapped in cssVisibility) {
        return cssVisibility[mapped as ClinicalSupportWorkflowTab]
          ? mapped
          : defaultCssTab;
      }
    }

    if (queryTab === 'documents') {
      return cssVisibility.documents ? 'documents' : defaultCssTab;
    }
    if (queryTab === 'messages') return 'messages';
    if (queryTab === 'overview') return 'overview';
    return defaultCssTab;
  }

  if (wantsChartProgress && showChartProgressTab) {
    return 'chart_progress';
  }
  if (wantsClinicalGoals && showClinicalGoalsTab) {
    return 'clinical_goals';
  }

  if (isCaseCoordMode) {
    if (queryTab === 'documents') return 'documents';
    if (queryTab === 'messages') return 'messages';
    if (queryTab === 'overview') return 'overview';
    if (wantsStaffingIntegrity && showStaffingIntegrityTab) {
      return 'staffing_integrity';
    }
    return 'case_coord_scheduling';
  }

  if (wantsBilling) return 'billing';
  if (wantsClinicalReview) return 'clinical';
  if (queryTab === 'treatment_plan' || mode === 'treatment_plan') {
    return 'treatment_plan';
  }
  if (queryTab === 'session_emr') return 'session_emr';
  if (queryTab === 'clinical-documents' || queryTab === 'bcba_documents') {
    return 'bcba_documents';
  }
  if (queryTab === 'assessment' || mode === 'assessment_prep') {
    return 'assessment';
  }
  if (queryTab === 'p2p' || mode === 'p2p') return 'p2p';
  if (!queryTab && isBcbaMode && hasP2PAlert) return 'p2p';

  return 'overview';
}

export function resolveActiveClientProfileTab(
  selection: ClientProfileTabSelection,
  contextKey: string,
  requestedTab: ClientProfileTab
): ClientProfileTab {
  return selection.contextKey === contextKey ? selection.tab : requestedTab;
}
