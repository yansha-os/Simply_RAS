import { beforeEach, describe, expect, it, vi } from 'vitest';

const RECORDING_ID = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const INTERVIEW_ID = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => {
  const remove = vi.fn();
  const storageFrom = vi.fn(() => ({ remove }));
  return {
    remove,
    storageClient: { storage: { from: storageFrom } },
    requireStaff: vi.fn(),
    revalidatePath: vi.fn(),
    prisma: {
      atsInterviewRecording: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
      },
      atsInterview: {
        findUnique: vi.fn(),
      },
      atsCandidate: {
        findUnique: vi.fn(),
      },
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireStaff: mocks.requireStaff,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mocks.storageClient,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mocks.storageClient),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createInterviewRecordingUpload,
  deleteInterviewRecording,
  discardUnfinalizedInterviewRecording,
  finalizeInterviewRecording,
  listInterviewRecordings,
} from './interviewRecordingActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ ok: true, user: { id: 'staff-id' } });
  mocks.prisma.atsInterviewRecording.findMany.mockResolvedValue([]);
  mocks.prisma.atsInterviewRecording.findUnique.mockResolvedValue({
    id: RECORDING_ID,
    candidateId: CANDIDATE_ID,
    interviewId: INTERVIEW_ID,
    storageBucket: 'ats-interview-recordings',
    storagePath: `${CANDIDATE_ID}/${INTERVIEW_ID}/${RECORDING_ID}.webm`,
    mimeType: 'video/webm',
  });
  mocks.prisma.atsInterviewRecording.delete.mockResolvedValue({});
  mocks.prisma.atsInterview.findUnique.mockResolvedValue({ id: INTERVIEW_ID });
});

describe('interview recording action authorization', () => {
  it('blocks upload authorization before candidate lookup', async () => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Not authorized.' });

    const result = await createInterviewRecordingUpload({
      candidateId: CANDIDATE_ID,
      mimeType: 'video/webm',
      byteSize: 8,
    });

    expect(result).toEqual({ success: false, error: 'Not authorized.' });
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
  });

  it('blocks finalization before recording lookup', async () => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Not authorized.' });

    const result = await finalizeInterviewRecording({
      recordingId: RECORDING_ID,
      candidateId: CANDIDATE_ID,
      mimeType: 'video/webm',
    });

    expect(result).toEqual({ success: false, error: 'Not authorized.' });
    expect(mocks.prisma.atsInterviewRecording.findUnique).not.toHaveBeenCalled();
  });

  it('blocks deletion before recording lookup', async () => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Not authorized.' });

    const result = await deleteInterviewRecording(RECORDING_ID);

    expect(result).toEqual({ success: false, error: 'Not authorized.' });
    expect(mocks.prisma.atsInterviewRecording.findUnique).not.toHaveBeenCalled();
  });
});

describe('interview recording archive completeness', () => {
  it('short-circuits before database access when authorization fails', async () => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Not authorized.' });

    const result = await listInterviewRecordings(CANDIDATE_ID);

    expect(result).toEqual({ success: false, error: 'Not authorized.', data: [] });
    expect(mocks.prisma.atsInterviewRecording.findMany).not.toHaveBeenCalled();
  });

  it('reports persisted recordings that cannot be loaded instead of claiming success', async () => {
    mocks.prisma.atsInterviewRecording.findMany.mockResolvedValue([
      {
        id: RECORDING_ID,
        candidateId: CANDIDATE_ID,
        interviewId: INTERVIEW_ID,
        storageBucket: 'another-private-bucket',
        storagePath: `victim/${RECORDING_ID}.webm`,
        mimeType: 'video/webm',
        title: 'Interview recording',
        durationSeconds: 30,
        byteSize: BigInt(8),
        createdAt: new Date('2026-09-11T12:00:00.000Z'),
      },
    ]);

    const result = await listInterviewRecordings(CANDIDATE_ID);

    expect(result).toEqual({
      success: false,
      error: '1 secure recording could not be loaded.',
      data: [],
    });
  });
});

describe('unfinalized interview recording cleanup', () => {
  it('short-circuits before database or storage access when authorization fails', async () => {
    mocks.requireStaff.mockResolvedValue({ ok: false, error: 'Not authorized.' });

    const result = await discardUnfinalizedInterviewRecording({
      recordingId: RECORDING_ID,
      candidateId: CANDIDATE_ID,
      mimeType: 'video/webm',
    });

    expect(result).toEqual({ success: false, error: 'Not authorized.' });
    expect(mocks.prisma.atsInterviewRecording.findUnique).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('deletes only the server-derived temporary storage path', async () => {
    mocks.prisma.atsInterviewRecording.findUnique.mockResolvedValue(null);
    mocks.remove.mockResolvedValue({ error: null });

    const result = await discardUnfinalizedInterviewRecording({
      recordingId: RECORDING_ID,
      candidateId: CANDIDATE_ID,
      mimeType: 'video/webm',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.remove).toHaveBeenCalledWith([
      `${CANDIDATE_ID}/${INTERVIEW_ID}/${RECORDING_ID}.webm`,
    ]);
  });

  it('refuses to discard a recording after metadata is finalized', async () => {
    mocks.prisma.atsInterviewRecording.findUnique.mockResolvedValue({ id: RECORDING_ID });

    const result = await discardUnfinalizedInterviewRecording({
      recordingId: RECORDING_ID,
      candidateId: CANDIDATE_ID,
      mimeType: 'video/webm',
    });

    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/finalized/i) });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe('interview recording deletion integrity', () => {
  it('retains metadata when Storage deletion fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.remove.mockResolvedValue({ error: { message: 'storage unavailable' } });

    try {
      const result = await deleteInterviewRecording(RECORDING_ID);

      expect(result).toMatchObject({ success: false });
      expect(result.error).toMatch(/remains tracked/i);
      expect(mocks.prisma.atsInterviewRecording.delete).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('deletes metadata only after Storage confirms deletion', async () => {
    mocks.remove.mockResolvedValue({ error: null });

    const result = await deleteInterviewRecording(RECORDING_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.prisma.atsInterviewRecording.delete).toHaveBeenCalledWith({
      where: { id: RECORDING_ID },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/ats/applicant/${CANDIDATE_ID}`
    );
  });

  it('refuses to delete an object when persisted storage metadata escapes the canonical path', async () => {
    mocks.prisma.atsInterviewRecording.findUnique.mockResolvedValue({
      id: RECORDING_ID,
      candidateId: CANDIDATE_ID,
      interviewId: INTERVIEW_ID,
      storageBucket: 'another-private-bucket',
      storagePath: `victim/${RECORDING_ID}.webm`,
      mimeType: 'video/webm',
    });

    const result = await deleteInterviewRecording(RECORDING_ID);

    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/metadata/i) });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.prisma.atsInterviewRecording.delete).not.toHaveBeenCalled();
  });
});
