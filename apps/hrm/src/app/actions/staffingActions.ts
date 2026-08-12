'use server';

/**
 * Legacy HR → case RBT dispatch is retired.
 * Case matching: CRM CaseOpening + HRM Job Board + Case Coord parent accept.
 * HR focuses on ATS applicant-cycle progress.
 */
export async function dispatchRbtCandidate(_clientId: string, _rbtCandidateId: string, _candidateName: string) {
  return {
    success: false,
    error:
      'Case RBT assignment moved to the Job Board. Post an opening in CRM Case Coord → Job Openings; RBTs apply in HRM.',
  };
}
