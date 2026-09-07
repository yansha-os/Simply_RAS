/**
 * Client-profile Claims tab — derive workflow status from SessionNote fields.
 * Mirrors PA-style stages without duplicating the global /portal-billing/claims kanban.
 */

export type ClaimWorkflowStatus =
  | 'AWAITING_BCBA'
  | 'READY_TO_SUBMIT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'DENIED';

export type ClaimOutcomeValue = 'APPROVED' | 'DENIED_CLERICAL' | 'DENIED_CLINICAL';

export type ClaimStatusInput = {
  rbtSigned: boolean;
  bcbaSigned: boolean;
  isConverted: boolean;
  claimOutcome: ClaimOutcomeValue | null | undefined;
};

export function deriveClaimWorkflowStatus(note: ClaimStatusInput): ClaimWorkflowStatus {
  if (note.claimOutcome === 'APPROVED') return 'APPROVED';
  if (note.claimOutcome === 'DENIED_CLERICAL' || note.claimOutcome === 'DENIED_CLINICAL') {
    return 'DENIED';
  }
  if (note.isConverted) return 'SUBMITTED';
  if (note.bcbaSigned) return 'READY_TO_SUBMIT';
  if (note.rbtSigned) return 'AWAITING_BCBA';
  return 'AWAITING_BCBA';
}

export function claimStatusLabel(status: ClaimWorkflowStatus): string {
  switch (status) {
    case 'AWAITING_BCBA':
      return 'Awaiting BCBA';
    case 'READY_TO_SUBMIT':
      return 'Ready to submit';
    case 'SUBMITTED':
      return 'Submitted';
    case 'APPROVED':
      return 'Approved';
    case 'DENIED':
      return 'Denied';
  }
}

export function claimOutcomeLabel(outcome: ClaimOutcomeValue | null | undefined): string | null {
  if (!outcome) return null;
  if (outcome === 'APPROVED') return 'Approved';
  if (outcome === 'DENIED_CLERICAL') return 'Denied (clerical)';
  if (outcome === 'DENIED_CLINICAL') return 'Denied (clinical)';
  return outcome;
}

export type ClaimStatusCounts = Record<ClaimWorkflowStatus, number>;

export function countClaimStatuses<T extends ClaimStatusInput>(notes: T[]): ClaimStatusCounts {
  const counts: ClaimStatusCounts = {
    AWAITING_BCBA: 0,
    READY_TO_SUBMIT: 0,
    SUBMITTED: 0,
    APPROVED: 0,
    DENIED: 0,
  };
  for (const note of notes) {
    counts[deriveClaimWorkflowStatus(note)] += 1;
  }
  return counts;
}

export const CLAIM_STATUS_ORDER: ClaimWorkflowStatus[] = [
  'AWAITING_BCBA',
  'READY_TO_SUBMIT',
  'SUBMITTED',
  'APPROVED',
  'DENIED',
];
