import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  notifyAssessmentPaDecisionHandoff,
  notifyAssessmentScheduledHandoff,
  notifyClinicalReviewApprovedHandoff,
  notifyIntakeSentToClinicalHandoff,
} from '../intakeWorkflowNotifications';
import { prisma } from '@/lib/prisma';
import { notifyRoles, notifyUsers } from '@/lib/notificationDispatcher';
import type { Prisma } from '@prisma/client';

type ClientSummaryRow = Prisma.ClientGetPayload<{
  select: {
    firstName: true;
    lastName: true;
    bcbaId: true;
    clinicalSupportId: true;
  };
}>;

type StaffIdRow = Prisma.UserGetPayload<{ select: { id: true } }>;

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/notificationDispatcher', () => ({
  notifyRoles: vi.fn(),
  notifyUsers: vi.fn(),
}));

describe('intakeWorkflowNotifications', () => {
  const clientId = '12345678-1234-4234-8234-123456789abc';
  const bcbaId = '33333333-3333-4333-8333-333333333333';
  const cssId = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
    const client = {
      firstName: 'Alex',
      lastName: 'Rivera',
      bcbaId,
      clinicalSupportId: null,
    } satisfies ClientSummaryRow;
    const staff = [{ id: cssId }] satisfies StaffIdRow[];

    // Vitest preserves Prisma's unselected overload at the mocked module boundary.
    vi.mocked(prisma.client.findUnique).mockResolvedValue(client as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue(staff as never);
    vi.mocked(notifyRoles).mockResolvedValue({ success: true, notified: 1 });
    vi.mocked(notifyUsers).mockResolvedValue({ success: true, notified: 1 });
  });

  it('notifies Clinical Support when intake sends to clinical', async () => {
    await notifyIntakeSentToClinicalHandoff(clientId);

    expect(notifyRoles).toHaveBeenCalledWith(
      ['CLINICAL_SUPPORT'],
      expect.objectContaining({
        type: 'INTAKE_SENT_TO_CLINICAL',
        linkUrl: `/client/${clientId}?mode=clinical&tab=clinical`,
      })
    );
  });

  it('notifies billing when clinical review is approved', async () => {
    await notifyClinicalReviewApprovedHandoff(clientId, 'actor-1');

    expect(notifyUsers).toHaveBeenCalledWith(
      [cssId],
      expect.objectContaining({
        type: 'CLINICAL_REVIEW_APPROVED',
        linkUrl: `/client/${clientId}?mode=billing&tab=vob`,
      })
    );
  });

  it('notifies CSS and BCBA when assessment PA is approved', async () => {
    await notifyAssessmentPaDecisionHandoff({
      clientId,
      clientName: 'Alex Rivera',
      decision: 'APPROVED',
      actorUserId: 'actor-1',
    });

    expect(notifyUsers).toHaveBeenCalledWith(
      expect.arrayContaining([cssId, bcbaId]),
      expect.objectContaining({
        type: 'ASSESSMENT_PA_APPROVED',
      })
    );
  });

  it('notifies BCBA and CSS when 97151 is scheduled', async () => {
    const scheduledStart = new Date('2026-08-25T14:00:00.000Z');

    await notifyAssessmentScheduledHandoff({
      clientId,
      scheduledStart,
      bcbaId,
      actorUserId: 'actor-1',
    });

    expect(notifyUsers).toHaveBeenCalledWith(
      [bcbaId],
      expect.objectContaining({
        type: 'ASSESSMENT_SCHEDULED',
        linkUrl: `/client/${clientId}?mode=assessment_prep&tab=assessment`,
      })
    );
    expect(notifyUsers).toHaveBeenCalledWith(
      [cssId],
      expect.objectContaining({
        type: 'ASSESSMENT_SCHEDULED',
        linkUrl: `/client/${clientId}?mode=clinical&tab=report`,
      })
    );
  });
});
