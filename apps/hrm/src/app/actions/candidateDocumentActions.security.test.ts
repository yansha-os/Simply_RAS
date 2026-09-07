import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const CURRENT_TOKEN = 'current-candidate-upload-token';
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

const mocks = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  const storageFrom = vi.fn(() => ({
    upload,
    remove,
    createSignedUrl: vi.fn(),
  }));
  const storageClient = {
    storage: { from: storageFrom },
    auth: { getUser: vi.fn() },
  };

  return {
    upload,
    remove,
    storageFrom,
    storageClient,
    revalidatePath: vi.fn(),
    requireRole: vi.fn(),
    prisma: {
      candidateOnboardingPacket: {
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      atsCandidate: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mocks.storageClient,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.storageClient),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { attachApplicantDocuments } from './candidateDocumentActions';

function authorizedPacket(stage: string, activationStatus: string) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    resumeStoragePath: null,
    govtIdStoragePath: null,
    formData: {},
    magicLinkExpiresAt: new Date('2099-08-19T12:00:00.000Z'),
    magicLinkRevokedAt: null,
    candidate: {
      id: CANDIDATE_ID,
      stage,
      activationStatus,
    },
  };
}

function resumeFormData() {
  const formData = new FormData();
  formData.append(
    'resume',
    new File([PDF_BYTES], 'resume.pdf', {
      type: 'application/pdf',
    })
  );
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockImplementation(async (storagePath: string) => ({
    data: { path: storagePath },
    error: null,
  }));
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.prisma.candidateOnboardingPacket.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.atsCandidate.findUnique.mockResolvedValue({ dossier: {} });
  mocks.prisma.atsCandidate.update.mockResolvedValue({});
});

describe('attachApplicantDocuments authoritative candidate state', () => {
  it('allows the current upload-only token to persist an initial pending resume', async () => {
    mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(
      authorizedPacket('APPLIED', 'PENDING_HR_REVIEW')
    );

    const result = await attachApplicantDocuments(
      CANDIDATE_ID,
      CURRENT_TOKEN,
      resumeFormData()
    );

    expect(result).toEqual({ success: true });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.candidateOnboardingPacket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resumeFileName: 'resume.pdf',
          resumeStoragePath: expect.stringContaining(`${CANDIDATE_ID}/resume-`),
        }),
      })
    );
  });

  it('allows the current rotated token during invited onboarding', async () => {
    mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(
      authorizedPacket('PHONE_SCREEN', 'INVITATION_SENT')
    );

    const result = await attachApplicantDocuments(
      CANDIDATE_ID,
      CURRENT_TOKEN,
      resumeFormData()
    );

    expect(result).toEqual({ success: true });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it('keeps the pending 40-hour certificate durable before marking completion', async () => {
    mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(
      authorizedPacket('APPLIED', 'PENDING_HR_REVIEW')
    );
    const formData = new FormData();
    formData.append(
      'fortyHourCert',
      new File([PDF_BYTES], 'certificate.pdf', {
        type: 'application/pdf',
      })
    );

    const result = await attachApplicantDocuments(
      CANDIDATE_ID,
      CURRENT_TOKEN,
      formData
    );

    expect(result).toEqual({ success: true });
    const packetUpdate =
      mocks.prisma.candidateOnboardingPacket.updateMany.mock.calls[0]?.[0];
    expect(packetUpdate?.data).toMatchObject({
      certUploaded: true,
      formData: {
        fortyHourCoach: {
          step: 'UPLOADED',
          certFileName: 'certificate.pdf',
          certStoragePath: expect.stringContaining(
            `${CANDIDATE_ID}/40hr-cert-`
          ),
          source: 'APPLICATION',
        },
      },
    });
    expect(mocks.prisma.atsCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          dossier: expect.objectContaining({
            fortyHourCertFileName: 'certificate.pdf',
            progress: expect.objectContaining({ certUploaded: true }),
          }),
        },
      })
    );
  });

  it('rejects a token rotated away by HR before touching Storage', async () => {
    mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(null);

    const result = await attachApplicantDocuments(
      CANDIDATE_ID,
      'old-pre-approval-token',
      resumeFormData()
    );

    expect(result).toMatchObject({ success: false });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.prisma.candidateOnboardingPacket.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
  });

  it('accepts only the resume, government ID, and certificate application slots', async () => {
    mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(
      authorizedPacket('APPLIED', 'PENDING_HR_REVIEW')
    );
    const formData = new FormData();
    formData.append(
      'onboardingForm',
      new File([new Uint8Array([1])], 'w4.pdf', {
        type: 'application/pdf',
      })
    );

    const result = await attachApplicantDocuments(
      CANDIDATE_ID,
      CURRENT_TOKEN,
      formData
    );

    expect(result).toEqual({ success: false, error: 'No documents provided.' });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.prisma.candidateOnboardingPacket.updateMany).not.toHaveBeenCalled();
  });

  it('rejects forged document content before touching Storage', async () => {
    mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(
      authorizedPacket('APPLIED', 'PENDING_HR_REVIEW')
    );
    const formData = new FormData();
    formData.append(
      'resume',
      new File([new TextEncoder().encode('<script>alert(1)</script>')], 'resume.pdf', {
        type: 'application/pdf',
      })
    );

    const result = await attachApplicantDocuments(
      CANDIDATE_ID,
      CURRENT_TOKEN,
      formData
    );

    expect(result).toEqual({
      success: false,
      error: 'resume: file content does not match its declared type.',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.prisma.candidateOnboardingPacket.updateMany).not.toHaveBeenCalled();
  });

  it('removes an earlier new object when a later document is invalid', async () => {
    mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(
      authorizedPacket('APPLIED', 'PENDING_HR_REVIEW')
    );
    const formData = new FormData();
    formData.append(
      'resume',
      new File([PDF_BYTES], 'resume.pdf', { type: 'application/pdf' })
    );
    formData.append(
      'govtId',
      new File([new TextEncoder().encode('not a PDF')], 'id.pdf', {
        type: 'application/pdf',
      })
    );

    const result = await attachApplicantDocuments(
      CANDIDATE_ID,
      CURRENT_TOKEN,
      formData
    );

    expect(result).toMatchObject({ success: false });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith([
      expect.stringContaining(`${CANDIDATE_ID}/resume-`),
    ]);
    expect(mocks.prisma.candidateOnboardingPacket.updateMany).not.toHaveBeenCalled();
  });

  it('removes new objects when upload authorization changes before commit', async () => {
    mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(
      authorizedPacket('APPLIED', 'PENDING_HR_REVIEW')
    );
    mocks.prisma.candidateOnboardingPacket.updateMany.mockResolvedValue({ count: 0 });

    const result = await attachApplicantDocuments(
      CANDIDATE_ID,
      CURRENT_TOKEN,
      resumeFormData()
    );

    expect(result).toEqual({
      success: false,
      error: 'Upload authorization changed. Open the current link and try again.',
    });
    expect(mocks.remove).toHaveBeenCalledWith([
      expect.stringContaining(`${CANDIDATE_ID}/resume-`),
    ]);
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
  });

  it.each([
    ['REJECTED', 'REJECTED'],
    ['HIRED', 'ACTIVE'],
    ['WITHDRAWN', 'ACTIVE'],
  ])(
    'denies %s candidates before Storage or dossier mutation',
    async (stage, activationStatus) => {
      mocks.prisma.candidateOnboardingPacket.findFirst.mockResolvedValue(
        authorizedPacket(stage, activationStatus)
      );

      const result = await attachApplicantDocuments(
        CANDIDATE_ID,
        CURRENT_TOKEN,
        resumeFormData()
      );

      expect(result).toMatchObject({ success: false });
      expect(result.error).toMatch(/not authorized|inactive|closed|status/i);
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.prisma.candidateOnboardingPacket.updateMany).not.toHaveBeenCalled();
      expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
      expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );
});
