import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => {
  const storageUpload = vi.fn();
  const storageFrom = vi.fn(() => ({ upload: storageUpload }));
  const storageClient = { storage: { from: storageFrom } };

  return {
    storageUpload,
    storageFrom,
    storageClient,
    revalidatePath: vi.fn(),
    cookieGet: vi.fn((name: string) => {
      if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
      if (name === 'device_fingerprint') return { value: FINGERPRINT };
      return undefined;
    }),
    prisma: {
      applicantDeviceSession: {
        findUnique: vi.fn(),
      },
      atsCandidate: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      candidateOnboardingPacket: {
        findUnique: vi.fn(),
        update: vi.fn(),
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
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));

import { uploadFortyHourCertificate } from './fortyHourCourseActions';

function candidateWithIncompleteCertificate() {
  return {
    id: CANDIDATE_ID,
    stage: 'INTERVIEW',
    activationStatus: 'ACTIVE',
    dossier: {
      progress: {
        tasksDone: true,
        availabilityDone: true,
        simulationDone: true,
        interviewBooked: true,
        interviewPassed: true,
        certUploaded: false,
      },
    },
    onboardingPacket: {
      formData: {
        fortyHourCoach: {
          step: 'CERT_READY',
          registeredAt: '2026-08-01T12:00:00.000Z',
          inProgressAt: '2026-08-02T12:00:00.000Z',
          certificateReadyAt: '2026-08-03T12:00:00.000Z',
          uploadedAt: null,
          certFileName: null,
          certStoragePath: null,
        },
      },
      tasksDone: true,
      availabilityDone: true,
      simulationDone: true,
      interviewBooked: true,
      interviewPassed: true,
      certUploaded: false,
      backgroundCleared: false,
      clearedForHire: false,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.applicantDeviceSession.findUnique.mockResolvedValue({
    revokedAt: null,
    candidate: {
      stage: 'INTERVIEW',
      activationStatus: 'ACTIVE',
    },
  });
  mocks.prisma.atsCandidate.findUnique.mockResolvedValue(
    candidateWithIncompleteCertificate()
  );
});

describe('uploadFortyHourCertificate evidence integrity', () => {
  it('fails closed without updating certificate progress when Storage rejects the upload', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.storageUpload.mockResolvedValue({
      data: null,
      error: { message: 'storage unavailable' },
    });
    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'certificate.pdf', {
        type: 'application/pdf',
      })
    );

    try {
      const result = await uploadFortyHourCertificate(formData);

      expect(result).toMatchObject({ success: false });
      expect(result.error).toMatch(/upload|stor/i);
      expect(mocks.storageUpload).toHaveBeenCalledTimes(1);
      expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
      expect(mocks.prisma.candidateOnboardingPacket.update).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('marks certificate completion only after Storage returns the durable object path', async () => {
    mocks.storageUpload.mockImplementation(async (storagePath: string) => ({
      data: { path: storagePath },
      error: null,
    }));
    mocks.prisma.atsCandidate.update.mockResolvedValue({});
    const formData = new FormData();
    formData.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'certificate.pdf', {
        type: 'application/pdf',
      })
    );

    const result = await uploadFortyHourCertificate(formData);

    expect(result).toMatchObject({ success: true });
    if (!result.success) throw new Error(result.error);
    expect(result.data.certStoragePath).toMatch(
      new RegExp(`^${CANDIDATE_ID}/40hr-cert-`)
    );
    expect(mocks.prisma.atsCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CANDIDATE_ID },
        data: expect.objectContaining({
          stage: expect.any(String),
          onboardingPacket: {
            update: expect.objectContaining({ certUploaded: true }),
          },
        }),
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/ats');
  });

  it('rejects a missing file before reading candidate progress or touching Storage', async () => {
    const result = await uploadFortyHourCertificate(new FormData());

    expect(result).toEqual({ success: false, error: 'No file selected.' });
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
    expect(mocks.storageUpload).not.toHaveBeenCalled();
    expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ['REJECTED', 'REJECTED'],
    ['HIRED', 'ACTIVE'],
  ])(
    'denies certificate upload for terminal %s candidates before Storage',
    async (stage, activationStatus) => {
      mocks.prisma.atsCandidate.findUnique.mockResolvedValue({
        ...candidateWithIncompleteCertificate(),
        stage,
        activationStatus,
      });
      const formData = new FormData();
      formData.append(
        'file',
        new File([new Uint8Array([1, 2, 3])], 'certificate.pdf', {
          type: 'application/pdf',
        })
      );

      const result = await uploadFortyHourCertificate(formData);

      expect(result).toMatchObject({ success: false });
      expect(result.error).toMatch(/not active|not authorized|closed|status/i);
      expect(mocks.storageUpload).not.toHaveBeenCalled();
      expect(mocks.prisma.atsCandidate.update).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );
});
