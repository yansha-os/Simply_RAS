import { beforeEach, describe, expect, it, vi } from 'vitest';

const CANDIDATE_ID = '11111111-1111-4111-8111-111111111111';
const FINGERPRINT = '22222222-2222-4222-8222-222222222222';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireRole: vi.fn(),
  resolveFingerprintValidCandidate: vi.fn(),
  cookieGet: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    atsCandidate: { findUnique: vi.fn(), update: vi.fn() },
    atsHelpTicket: { findMany: vi.fn(), findFirst: vi.fn() },
    atsHelpMessage: { create: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock('@/lib/auth-guard', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/candidateDeviceSession', () => ({
  CANDIDATE_SESSION_COOKIE: 'ras_device_session_token',
  DEVICE_FINGERPRINT_COOKIE: 'device_fingerprint',
  resolveFingerprintValidCandidate: mocks.resolveFingerprintValidCandidate,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
}));

import { createHelpTicket, listHelpTickets, sendHelpMessage } from './helpDeskActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue({
    id: '33333333-3333-4333-8333-333333333333',
    role: 'APPLICANT',
    isActive: true,
    firstName: 'Applicant',
    lastName: 'User',
  });
  mocks.resolveFingerprintValidCandidate.mockResolvedValue(null);
  mocks.cookieGet.mockImplementation((name: string) => {
    if (name === 'ras_device_session_token') return { value: CANDIDATE_ID };
    if (name === 'device_fingerprint') return { value: FINGERPRINT };
    return undefined;
  });
});

describe('HRM applicant help-desk identity scope', () => {
  it('does not create a ticket from raw candidate cookies without a valid device session', async () => {
    const result = await createHelpTicket({
      candidateId: CANDIDATE_ID,
      category: 'GENERAL_QUESTION',
      subject: 'Question',
      message: 'Please help.',
    });

    expect(result).toMatchObject({ success: false });
    expect(mocks.resolveFingerprintValidCandidate).toHaveBeenCalledWith(
      CANDIDATE_ID,
      FINGERPRINT
    );
    expect(mocks.prisma.atsCandidate.findUnique).not.toHaveBeenCalled();
  });

  it('does not list another applicant ticket set from raw candidate cookies', async () => {
    const result = await listHelpTickets({ candidateId: CANDIDATE_ID });

    expect(result).toMatchObject({ success: false, data: [] });
    expect(mocks.prisma.atsHelpTicket.findMany).not.toHaveBeenCalled();
  });

  it('does not disclose ticket state or write messages without a valid device session', async () => {
    const result = await sendHelpMessage(
      '44444444-4444-4444-8444-444444444444',
      { text: 'Hello', senderSide: 'CANDIDATE' }
    );

    expect(result).toEqual({ success: false, error: 'FORBIDDEN: Not your ticket.' });
    expect(mocks.prisma.atsHelpTicket.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.atsHelpMessage.create).not.toHaveBeenCalled();
  });

  it('does not allow an applicant to submit a message as HR', async () => {
    const result = await sendHelpMessage(
      '44444444-4444-4444-8444-444444444444',
      { text: 'Fake staff reply', senderSide: 'HR' }
    );

    expect(result).toEqual({
      success: false,
      error: 'FORBIDDEN: Invalid sender identity.',
    });
    expect(mocks.resolveFingerprintValidCandidate).not.toHaveBeenCalled();
    expect(mocks.prisma.atsHelpTicket.findFirst).not.toHaveBeenCalled();
  });
});
