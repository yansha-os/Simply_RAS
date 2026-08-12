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
  | 'assignments'
  | 'assessment'
  | 'treatment_plan'
  | 'clinical_goals'
  | 'session_emr'
  | 'chart_progress'
  | 'report'
  | 'staffing_integrity'
  | 'case_coord_scheduling';

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
  hasP2PAlert: boolean;
  showChartProgressTab: boolean;
  showStaffingIntegrityTab: boolean;
}): ClientProfileTab {
  const {
    mode,
    queryTab,
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
  const showClinicalGoalsTab =
    isBcbaMode || isClinicalReviewMode || isCaseCoordMode;
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
  const wantsClinicalGoals =
    queryTab === 'clinical_goals' || queryTab === 'goals';
  const wantsStaffingIntegrity =
    queryTab === 'staffing_integrity' ||
    queryTab === 'staffing-integrity' ||
    queryTab === 'integrity' ||
    queryTab === 'hr_staffing';

  if (isBillingMode) {
    if (queryTab === 'documents') return 'documents';
    if (queryTab === 'messages') return 'messages';
    if (queryTab === 'overview') return 'overview';
    return 'billing';
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
