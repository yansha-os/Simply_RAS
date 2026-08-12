export type ApplicantAccessState = {
  stage: string;
  activationStatus: string;
};

const ONBOARDING_STAGES = new Set([
  'PHONE_SCREEN',
  'INTERVIEW',
  'OFFER',
  'HELP_DESK',
]);

const PORTAL_ACTIVATIONS = new Set([
  'INVITATION_SENT',
  'ACTIVE',
  'ACCOUNT_ACTIVE',
]);

function isInvitedOnboardingState(state: ApplicantAccessState): boolean {
  return (
    ONBOARDING_STAGES.has(state.stage) &&
    PORTAL_ACTIVATIONS.has(state.activationStatus)
  );
}

/**
 * Candidate magic links may bind only after HR invitation. Hired RBTs retain
 * their existing device-login behavior, but terminal candidates never receive
 * candidate-upload authorization.
 */
export function canBindApplicantPortal(state: ApplicantAccessState): boolean {
  if (state.stage === 'HIRED') {
    return (
      state.activationStatus === 'ACTIVE' ||
      state.activationStatus === 'ACCOUNT_ACTIVE'
    );
  }
  return isInvitedOnboardingState(state);
}

/** A persisted candidate device session is valid only in a portal-eligible state. */
export function canUseApplicantDeviceSession(
  state: ApplicantAccessState
): boolean {
  return canBindApplicantPortal(state);
}

/**
 * The token issued at application submission can write only initial document
 * slots while the record is exactly APPLIED/PENDING_HR_REVIEW. After invite,
 * only the newly rotated current token is accepted by the packet lookup.
 */
export function canUseCandidateDocumentToken(
  state: ApplicantAccessState
): boolean {
  if (
    state.stage === 'APPLIED' &&
    state.activationStatus === 'PENDING_HR_REVIEW'
  ) {
    return true;
  }
  return isInvitedOnboardingState(state);
}

/** Device-bound onboarding certificate uploads stop at hire or any terminal state. */
export function canUploadOnboardingCertificate(
  state: ApplicantAccessState
): boolean {
  return isInvitedOnboardingState(state);
}
