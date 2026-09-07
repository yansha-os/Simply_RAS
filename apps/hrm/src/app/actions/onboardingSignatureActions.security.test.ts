import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  const storageFrom = vi.fn(() => ({ upload, remove }));
  return {
    upload,
    remove,
    storageClient: { storage: { from: storageFrom } },
    cookieGet: vi.fn((name: string) => {
      if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
      if (name === 'device_fingerprint') return { value: FINGERPRINT };
      return undefined;
    }),
    prisma: {
      applicantDeviceSession: { findUnique: vi.fn() },
      onboardingSignatureEvent: { create: vi.fn(), count: vi.fn() },
      candidateOnboardingPacket: {
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mocks.storageClient,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.storageClient),
}));
vi.mock('@/lib/devToolsGate', () => ({ isDevToolsEnabled: () => false }));
vi.mock('@/lib/auth-guard', () => ({ requireRole: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
  headers: vi.fn(async () => ({ get: vi.fn(() => null) })),
}));

import {
  recordOnboardingAdvance,
  recordOnboardingSignature,
  uploadOnboardingFile,
} from './onboardingSignatureActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.applicantDeviceSession.findUnique.mockResolvedValue({
    revokedAt: null,
    boundAt: new Date(),
    candidate: { stage: 'INTERVIEW', activationStatus: 'ACTIVE' },
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.prisma.onboardingSignatureEvent.create.mockResolvedValue({
    auditHash: 'audit-hash',
    createdAt: new Date('2026-09-06T12:00:00.000Z'),
  });
  mocks.prisma.candidateOnboardingPacket.updateMany.mockResolvedValue({ count: 1 });
});

describe('onboarding action integrity', () => {
  it('does not let an e-signature complete the embedded W-4 step', async () => {
    const result = await recordOnboardingSignature({
      stepNumber: 20,
      signerName: 'Applicant Name',
      consents: { read: true, agree: true, eSign: true },
    });

    expect(result).toMatchObject({ success: false });
    expect(mocks.prisma.onboardingSignatureEvent.create).not.toHaveBeenCalled();
    expect(mocks.prisma.candidateOnboardingPacket.updateMany).not.toHaveBeenCalled();
  });

  it('does not let file upload complete an e-signature step', async () => {
    const formData = new FormData();
    formData.append('stepNumber', '1');
    formData.append(
      'file',
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'document.pdf', {
        type: 'application/pdf',
      })
    );

    const result = await uploadOnboardingFile(formData);

    expect(result).toMatchObject({ success: false });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects a forged PDF before touching Storage', async () => {
    const formData = new FormData();
    formData.append('stepNumber', '24');
    formData.append(
      'file',
      new File([new TextEncoder().encode('<html>not a PDF</html>')], 'card.pdf', {
        type: 'application/pdf',
      })
    );

    const result = await uploadOnboardingFile(formData);

    expect(result).toEqual({
      success: false,
      error: 'The file content does not match its declared type.',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.prisma.onboardingSignatureEvent.create).not.toHaveBeenCalled();
  });

  it('removes a newly uploaded object when its audit event cannot be persisted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.prisma.onboardingSignatureEvent.create.mockRejectedValue(new Error('database unavailable'));
    const formData = new FormData();
    formData.append('stepNumber', '24');
    formData.append(
      'file',
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'i9.pdf', {
        type: 'application/pdf',
      })
    );

    try {
      const result = await uploadOnboardingFile(formData);

      expect(result).toMatchObject({ success: false });
      expect(mocks.remove).toHaveBeenCalledWith([
        expect.stringMatching(new RegExp(`^onboarding/${CANDIDATE_ID}/`)),
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rejects non-sequential advance audit events', async () => {
    const result = await recordOnboardingAdvance(1, 3);

    expect(result).toEqual({
      success: false,
      error: 'Onboarding steps must be advanced in order.',
    });
    expect(mocks.prisma.onboardingSignatureEvent.create).not.toHaveBeenCalled();
  });
});
