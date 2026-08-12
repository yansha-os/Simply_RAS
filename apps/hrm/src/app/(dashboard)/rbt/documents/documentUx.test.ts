import { describe, expect, it } from 'vitest';

import {
  classifyApplicantAccessError,
  completedPhaseCount,
  getOnboardingDocumentStatus,
  phaseComplete,
  phaseFromStep,
  validateDocumentFile,
} from '@/components/rbt/documentUx';

const file = (overrides: Partial<{ name: string; size: number; type: string }> = {}) => ({
  name: 'certificate.pdf',
  size: 1024,
  type: 'application/pdf',
  ...overrides,
});

describe('validateDocumentFile', () => {
  it('distinguishes empty, oversized, and unsupported files', () => {
    expect(validateDocumentFile(file({ size: 0 }), { label: 'Certificate' })).toEqual({
      code: 'EMPTY',
      message: 'Certificate is empty. Choose a file with content.',
    });
    expect(
      validateDocumentFile(file({ size: 10 * 1024 * 1024 + 1 }), {
        label: 'Certificate',
      })
    ).toEqual({
      code: 'TOO_LARGE',
      message: 'Certificate is too large. The maximum file size is 10MB.',
    });
    expect(
      validateDocumentFile(file({ name: 'certificate.gif', type: 'image/gif' }), {
        label: 'Certificate',
      })
    ).toEqual({
      code: 'UNSUPPORTED_TYPE',
      message: 'Certificate must be a PDF, JPEG, PNG, or WebP file.',
    });
  });

  it('accepts the server-supported document types and a MIME-less PDF', () => {
    for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
      expect(validateDocumentFile(file({ type }), { label: 'Certificate' })).toBeNull();
    }
    expect(
      validateDocumentFile(file({ name: 'scan.PDF', type: '' }), {
        label: 'Certificate',
      })
    ).toBeNull();
  });

  it('rejects MIME-less images because the server can only safely infer PDF', () => {
    expect(
      validateDocumentFile(file({ name: 'scan.jpg', type: '' }), {
        label: 'Certificate',
      })
    ).toMatchObject({ code: 'UNSUPPORTED_TYPE' });
  });

  it('enforces PDF-only upload fields', () => {
    expect(
      validateDocumentFile(file({ name: 'scan.png', type: 'image/png' }), {
        label: 'Completed form',
        pdfOnly: true,
      })
    ).toEqual({
      code: 'UNSUPPORTED_TYPE',
      message: 'Completed form must be a PDF file.',
    });
  });
});

describe('classifyApplicantAccessError', () => {
  it.each([
    ['This upload link has expired.', 'EXPIRED', 'Applicant link expired'],
    ['This upload link has been revoked.', 'REVOKED', 'Applicant access revoked'],
    ['This application is no longer active.', 'CLOSED', 'Application access closed'],
    [
      'Applicant session is not active on this device.',
      'INACTIVE_SESSION',
      'Applicant session unavailable',
    ],
  ] as const)('maps "%s" to a specific blocked state', (message, reason, title) => {
    expect(classifyApplicantAccessError(message)).toMatchObject({ reason, title });
  });

  it('keeps unexpected load failures retryable', () => {
    expect(classifyApplicantAccessError('Database temporarily unavailable')).toMatchObject({
      reason: 'UNKNOWN',
      retryable: true,
      title: 'Documents temporarily unavailable',
    });
  });
});

describe('course phase status', () => {
  it('derives the active phase and accurate completed count', () => {
    expect(phaseFromStep('NOT_STARTED')).toBe(1);
    expect(phaseFromStep('REGISTERED')).toBe(2);
    expect(phaseFromStep('CERT_READY')).toBe(3);
    expect(phaseFromStep('UPLOADED')).toBe(4);
    expect(completedPhaseCount('IN_PROGRESS')).toBe(2);
    expect(completedPhaseCount('UPLOADED')).toBe(4);
  });

  it('does not mark the course complete until the certificate is ready', () => {
    expect(phaseComplete(2, 'IN_PROGRESS')).toBe(false);
    expect(phaseComplete(2, 'CERT_READY')).toBe(true);
    expect(phaseComplete(4, 'CERT_READY')).toBe(false);
    expect(phaseComplete(4, 'UPLOADED')).toBe(true);
  });
});

describe('getOnboardingDocumentStatus', () => {
  it('uses action-specific completion labels instead of calling every step signed', () => {
    expect(getOnboardingDocumentStatus('ESIGN', true)).toBe('Signed');
    expect(getOnboardingDocumentStatus('EMBEDDED', true)).toBe('Submitted');
    expect(getOnboardingDocumentStatus('UPLOAD', true)).toBe('Uploaded');
    expect(getOnboardingDocumentStatus('QUIZ', true)).toBe('Passed');
  });

  it('describes the action still required for incomplete steps', () => {
    expect(getOnboardingDocumentStatus('ESIGN', false)).toBe('Signature required');
    expect(getOnboardingDocumentStatus('UPLOAD', false)).toBe('Upload required');
    expect(getOnboardingDocumentStatus('QUIZ', false)).toBe('Quiz required');
  });
});
