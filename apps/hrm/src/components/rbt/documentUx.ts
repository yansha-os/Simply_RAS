import type { FortyHourCoachStep } from '@/app/actions/fortyHourCourseActions';
import type { OnboardingStepKind } from '@/lib/onboardingDocuments';

export type PhaseId = 1 | 2 | 3 | 4;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const STEP_ORDER: FortyHourCoachStep[] = [
  'NOT_STARTED',
  'REGISTERED',
  'IN_PROGRESS',
  'CERT_READY',
  'UPLOADED',
];

export type DocumentFileValidationError = {
  code: 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED_TYPE';
  message: string;
};

export function validateDocumentFile(
  file: Pick<File, 'name' | 'size' | 'type'>,
  options: { label: string; pdfOnly?: boolean }
): DocumentFileValidationError | null {
  if (file.size <= 0) {
    return {
      code: 'EMPTY',
      message: `${options.label} is empty. Choose a file with content.`,
    };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return {
      code: 'TOO_LARGE',
      message: `${options.label} is too large. The maximum file size is 10MB.`,
    };
  }

  const mime = file.type.trim().toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const supported = options.pdfOnly
    ? mime === 'application/pdf' || (!mime && extension === 'pdf')
    : SUPPORTED_MIME_TYPES.has(mime) || (!mime && extension === 'pdf');

  if (!supported) {
    return {
      code: 'UNSUPPORTED_TYPE',
      message: options.pdfOnly
        ? `${options.label} must be a PDF file.`
        : `${options.label} must be a PDF, JPEG, PNG, or WebP file.`,
    };
  }

  return null;
}

export type ApplicantAccessPresentation = {
  reason: 'EXPIRED' | 'REVOKED' | 'CLOSED' | 'INACTIVE_SESSION' | 'UNKNOWN';
  title: string;
  description: string;
  retryable: boolean;
};

export function classifyApplicantAccessError(message: string): ApplicantAccessPresentation {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes('expired')) {
    return {
      reason: 'EXPIRED',
      title: 'Applicant link expired',
      description:
        'This invite is no longer valid. Ask HR to send a fresh magic link before uploading or signing documents.',
      retryable: false,
    };
  }
  if (normalized.includes('revoked')) {
    return {
      reason: 'REVOKED',
      title: 'Applicant access revoked',
      description:
        'This invite was withdrawn by HR. Document access stays locked until HR issues a new link.',
      retryable: false,
    };
  }
  if (normalized.includes('no longer active') || normalized.includes('rejected')) {
    return {
      reason: 'CLOSED',
      title: 'Application access closed',
      description:
        'This application is no longer active. Do not resubmit documents unless HR asks you to apply again.',
      retryable: false,
    };
  }
  if (
    normalized.includes('no applicant session') ||
    normalized.includes('not active on this device') ||
    normalized.includes('open your magic link') ||
    normalized.includes('not authorized')
  ) {
    return {
      reason: 'INACTIVE_SESSION',
      title: 'Applicant session unavailable',
      description:
        'Open the newest magic link from HR on this device. If that link no longer works, ask HR for a replacement.',
      retryable: false,
    };
  }

  return {
    reason: 'UNKNOWN',
    title: 'Documents temporarily unavailable',
    description:
      message.trim() || 'We could not load your document status. Try again before uploading.',
    retryable: true,
  };
}

export function phaseFromStep(step: FortyHourCoachStep): PhaseId {
  if (step === 'UPLOADED') return 4;
  if (step === 'CERT_READY') return 3;
  if (step === 'IN_PROGRESS' || step === 'REGISTERED') return 2;
  return 1;
}

export function phaseComplete(phase: PhaseId, step: FortyHourCoachStep): boolean {
  const index = STEP_ORDER.indexOf(step);
  if (phase === 1) return index >= STEP_ORDER.indexOf('REGISTERED');
  if (phase === 2 || phase === 3) return index >= STEP_ORDER.indexOf('CERT_READY');
  return step === 'UPLOADED';
}

export function completedPhaseCount(step: FortyHourCoachStep): number {
  if (step === 'UPLOADED') return 4;
  if (step === 'CERT_READY') return 3;
  if (step === 'IN_PROGRESS') return 2;
  if (step === 'REGISTERED') return 1;
  return 0;
}

export function getOnboardingDocumentStatus(
  kind: OnboardingStepKind,
  complete: boolean
): string {
  if (complete) {
    if (kind === 'ESIGN' || kind === 'ACK') return 'Signed';
    if (kind === 'EMBEDDED') return 'Submitted';
    if (kind === 'QUIZ') return 'Passed';
    return 'Uploaded';
  }

  if (kind === 'ESIGN' || kind === 'ACK') return 'Signature required';
  if (kind === 'EMBEDDED') return 'Form required';
  if (kind === 'QUIZ') return 'Quiz required';
  return 'Upload required';
}
