import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  clientFindMany: vi.fn(),
  noteDeficiencyFindMany: vi.fn(),
  sessionNoteFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: { findMany: mocks.clientFindMany },
    noteDeficiency: { findMany: mocks.noteDeficiencyFindMany },
    sessionNote: { findMany: mocks.sessionNoteFindMany },
  },
}));

import { listClinicalReviewQueue } from './clinicalReviewActions';

const BCBA_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const EMPTY_COUNTS = { packet: 0, unsigned: 0, deficiency: 0, total: 0 };

function staff(role: string, overrides: Record<string, unknown> = {}) {
  return {
    id: BCBA_ID,
    email: 'staff@example.test',
    firstName: 'Test',
    lastName: 'Staff',
    role,
    isActive: true,
    createdAt: new Date('2026-08-12T12:00:00.000Z'),
    updatedAt: new Date('2026-08-12T12:00:00.000Z'),
    ...overrides,
  };
}

function expectNoReviewQueries() {
  expect(mocks.clientFindMany).not.toHaveBeenCalled();
  expect(mocks.noteDeficiencyFindMany).not.toHaveBeenCalled();
  expect(mocks.sessionNoteFindMany).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.clientFindMany.mockResolvedValue([]);
  mocks.noteDeficiencyFindMany.mockResolvedValue([]);
  mocks.sessionNoteFindMany.mockResolvedValue([]);
});

describe('listClinicalReviewQueue read boundary', () => {
  it.each([
    ['anonymous actor', null],
    ['inactive BCBA', staff('BCBA', { isActive: false })],
    ['wrong-role actor', staff('BILLING')],
    ['role-only synthetic impersonation', staff('BCBA', { id: 'mock-user-id' })],
  ])('denies %s without executing a review query', async (_label, actor) => {
    mocks.getCurrentUser.mockResolvedValue(actor);

    await expect(listClinicalReviewQueue()).resolves.toMatchObject({
      success: false,
      accessDenied: true,
      error: 'Not found.',
      items: [],
      counts: EMPTY_COUNTS,
    });
    expectNoReviewQueries();
  });

  it('returns assigned packet, deficiency, and unsigned-note rows for a BCBA', async () => {
    const packetUpdatedAt = new Date('2026-08-12T13:00:00.000Z');
    const deficiencyCreatedAt = new Date('2026-08-12T14:00:00.000Z');
    const noteCreatedAt = new Date('2026-08-12T15:00:00.000Z');
    const scheduledStart = new Date('2026-08-11T16:00:00.000Z');
    mocks.getCurrentUser.mockResolvedValue(staff('BCBA'));
    mocks.clientFindMany.mockResolvedValue([
      {
        id: CLIENT_ID,
        firstName: 'Assigned',
        lastName: 'Client',
        status: 'DOCS_APPROVED_INTAKE',
        intakePacket: {
          id: '33333333-3333-4333-8333-333333333333',
          intakeFormComplete: true,
          consentFormComplete: true,
          insuranceCardFrontUploaded: true,
          insuranceCardBackUploaded: true,
          diagnosticEvalUploaded: true,
          physicianRxUploaded: false,
          updatedAt: packetUpdatedAt,
        },
      },
    ]);
    mocks.noteDeficiencyFindMany.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        description: 'Missing clinical detail.',
        createdAt: deficiencyCreatedAt,
        note: {
          id: '55555555-5555-4555-8555-555555555555',
          session: {
            id: '66666666-6666-4666-8666-666666666666',
            client: {
              id: CLIENT_ID,
              firstName: 'Assigned',
              lastName: 'Client',
              status: 'ACTIVE',
            },
          },
        },
      },
    ]);
    mocks.sessionNoteFindMany.mockResolvedValue([
      {
        id: '77777777-7777-4777-8777-777777777777',
        rbtSignedAt: null,
        createdAt: noteCreatedAt,
        billableUnits: 4,
        session: {
          id: '88888888-8888-4888-8888-888888888888',
          cptCode: '97153',
          scheduledStart,
          client: {
            id: CLIENT_ID,
            firstName: 'Assigned',
            lastName: 'Client',
            status: 'ACTIVE',
          },
        },
      },
    ]);

    const result = await listClinicalReviewQueue();

    expect(result).toMatchObject({
      success: true,
      viewerRole: 'BCBA',
      scopedToBcbaId: BCBA_ID,
      counts: { packet: 1, unsigned: 1, deficiency: 1, total: 3 },
    });
    expect(result.items.map((item) => item.clientId)).toEqual([
      CLIENT_ID,
      CLIENT_ID,
      CLIENT_ID,
    ]);
  });

  it('excludes cross-client packets and notes from every BCBA query', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('BCBA'));

    await listClinicalReviewQueue();

    expect(mocks.clientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'DOCS_APPROVED_INTAKE', bcbaId: BCBA_ID },
      })
    );
    expect(mocks.noteDeficiencyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'OPEN',
          note: { session: { client: { bcbaId: BCBA_ID } } },
        },
      })
    );
    expect(mocks.sessionNoteFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          rbtSigned: true,
          bcbaSigned: false,
          session: { client: { bcbaId: BCBA_ID } },
        },
      })
    );
  });

  it('keeps explicitly global clinical leadership broad with narrow projections', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('CLINICAL_DIRECTOR'));

    const result = await listClinicalReviewQueue();

    expect(result).toMatchObject({
      success: true,
      viewerRole: 'CLINICAL_DIRECTOR',
      scopedToBcbaId: null,
    });
    expect(mocks.clientFindMany).toHaveBeenCalledWith({
      where: { status: 'DOCS_APPROVED_INTAKE' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        intakePacket: {
          select: {
            id: true,
            intakeFormComplete: true,
            consentFormComplete: true,
            insuranceCardFrontUploaded: true,
            insuranceCardBackUploaded: true,
            diagnosticEvalUploaded: true,
            physicianRxUploaded: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    expect(mocks.noteDeficiencyFindMany).toHaveBeenCalledWith({
      where: { status: 'OPEN' },
      select: {
        id: true,
        description: true,
        createdAt: true,
        note: {
          select: {
            id: true,
            session: {
              select: {
                id: true,
                client: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    expect(mocks.sessionNoteFindMany).toHaveBeenCalledWith({
      where: { rbtSigned: true, bcbaSigned: false },
      select: {
        id: true,
        rbtSignedAt: true,
        createdAt: true,
        billableUnits: true,
        session: {
          select: {
            id: true,
            cptCode: true,
            scheduledStart: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [{ rbtSignedAt: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });

    const queryShape = JSON.stringify([
      ...mocks.clientFindMany.mock.calls,
      ...mocks.noteDeficiencyFindMany.mock.calls,
      ...mocks.sessionNoteFindMany.mock.calls,
    ]);
    expect(queryShape).not.toContain('magicLinkToken');
    expect(queryShape).not.toContain('deviceFingerprint');
    expect(queryShape).not.toContain('formData');
    expect(queryShape).not.toContain('clinicalContent');
    expect(queryShape).not.toContain('structuredContent');
  });
});
