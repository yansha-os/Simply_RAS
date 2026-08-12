import { describe, expect, it } from 'vitest';
import {
  canBindApplicantPortal,
  canUploadOnboardingCertificate,
  canUseApplicantDeviceSession,
  canUseCandidateDocumentToken,
} from '../applicantAccessPolicy';

describe('applicant access policy', () => {
  it('treats a new application token as initial-upload-only', () => {
    const pending = {
      stage: 'APPLIED',
      activationStatus: 'PENDING_HR_REVIEW',
    };

    expect(canUseCandidateDocumentToken(pending)).toBe(true);
    expect(canBindApplicantPortal(pending)).toBe(false);
    expect(canUseApplicantDeviceSession(pending)).toBe(false);
    expect(canUploadOnboardingCertificate(pending)).toBe(false);
  });

  it('allows invited onboarding with the current token and device session', () => {
    const invited = {
      stage: 'PHONE_SCREEN',
      activationStatus: 'INVITATION_SENT',
    };

    expect(canUseCandidateDocumentToken(invited)).toBe(true);
    expect(canBindApplicantPortal(invited)).toBe(true);
    expect(canUseApplicantDeviceSession(invited)).toBe(true);
    expect(canUploadOnboardingCertificate(invited)).toBe(true);
  });

  it.each([
    { stage: 'REJECTED', activationStatus: 'REJECTED' },
    { stage: 'WITHDRAWN', activationStatus: 'ACTIVE' },
    { stage: 'TERMINATED', activationStatus: 'ACTIVE' },
  ])('fails closed for terminal or unknown state %#', (state) => {
    expect(canUseCandidateDocumentToken(state)).toBe(false);
    expect(canBindApplicantPortal(state)).toBe(false);
    expect(canUseApplicantDeviceSession(state)).toBe(false);
    expect(canUploadOnboardingCertificate(state)).toBe(false);
  });

  it('keeps hired RBT device login but closes all candidate upload grants', () => {
    const hired = { stage: 'HIRED', activationStatus: 'ACTIVE' };

    expect(canBindApplicantPortal(hired)).toBe(true);
    expect(canUseApplicantDeviceSession(hired)).toBe(true);
    expect(canUseCandidateDocumentToken(hired)).toBe(false);
    expect(canUploadOnboardingCertificate(hired)).toBe(false);
  });
});
