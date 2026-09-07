import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  requireClientAccess: vi.fn(),
  requireStaff: vi.fn(),
  prisma: { session: { findMany: vi.fn() } },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
  requireStaff: mocks.requireStaff,
}));

import { getCaregiverTrainingSummary } from './caregiverTrainingActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
});

describe('caregiver training clinical data integrity', () => {
  it('does not invent a fidelity score for a completed session with missing evidence', async () => {
    mocks.prisma.session.findMany.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        scheduledStart: new Date('2026-09-01T13:00:00.000Z'),
        scheduledEnd: new Date('2026-09-01T14:00:00.000Z'),
        actualStart: null,
        actualEnd: null,
        note: { structuredContent: {}, bcbaSignerName: 'BCBA User' },
      },
    ]);

    const result = await getCaregiverTrainingSummary(CLIENT_ID);

    expect(result).toMatchObject({
      success: true,
      trend: { totalSessionsCount: 0, averageFidelity: 0 },
      recentNotes: [],
    });
  });

  it('drops malformed goal objects while retaining validated clinical scores', async () => {
    mocks.prisma.session.findMany.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
        scheduledStart: new Date('2026-09-01T13:00:00.000Z'),
        scheduledEnd: new Date('2026-09-01T14:00:00.000Z'),
        actualStart: new Date('2026-09-01T13:05:00.000Z'),
        actualEnd: new Date('2026-09-01T13:50:00.000Z'),
        note: {
          structuredContent: {
            caregiverFidelityScore: 90,
            goalsAddressed: [{ status: 'MASTERED' }],
          },
          bcbaSignerName: 'BCBA User',
        },
      },
    ]);

    const result = await getCaregiverTrainingSummary(CLIENT_ID);

    expect(result).toMatchObject({
      success: true,
      trend: {
        totalSessionsCount: 1,
        averageFidelity: 90,
        masteredGoalsCount: 0,
      },
      recentNotes: [{ fidelityScore: 90, minutes: 45 }],
    });
  });
});
