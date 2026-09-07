import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientFindMany: vi.fn(),
  userFindMany: vi.fn(),
  caseOpeningCount: vi.fn(),
  caseApplicationCount: vi.fn(),
  getCurrentUser: vi.fn(),
  getBcbaOpsMetrics: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: { findMany: mocks.clientFindMany },
    user: { findMany: mocks.userFindMany },
    caseOpening: { count: mocks.caseOpeningCount },
    caseApplication: { count: mocks.caseApplicationCount },
  },
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
}));

vi.mock('@/app/actions/bcbaMetricsActions', () => ({
  getBcbaOpsMetrics: mocks.getBcbaOpsMetrics,
}));

vi.mock('@/components/portal-case/IntakeDashboard', () => ({
  default: function IntakeDashboardStub() {
    return null;
  },
}));

vi.mock('@/components/portal-case/IntakeQueue', () => ({
  default: function IntakeQueueStub() {
    return null;
  },
}));

vi.mock('@/components/portal-billing/BillingQueueTabs', () => ({
  default: function BillingQueueTabsStub() {
    return null;
  },
}));

vi.mock('@/components/portal-billing/BillingDashboard', () => ({
  default: function BillingDashboardStub() {
    return null;
  },
}));

vi.mock('@/components/portal-case-coord/CaseCoordDashboard', () => ({
  default: function CaseCoordDashboardStub() {
    return null;
  },
}));

vi.mock('@/components/portal-case-coord/CaseCoordClientsView', () => ({
  default: function CaseCoordClientsViewStub() {
    return null;
  },
}));

vi.mock('@/components/portal-clinical/BcbaMetricsDashboard', () => ({
  default: function BcbaMetricsDashboardStub() {
    return null;
  },
}));

vi.mock('@/components/portal-clinical/BcbaDashboard', () => ({
  default: function BcbaDashboardStub() {
    return null;
  },
}));

import BillingClientsPage from './portal-billing/clients/page';
import BillingPortalPage from './portal-billing/page';
import IntakeClientsPage from './portal-case/clients/page';
import CasePortalPage from './portal-case/page';
import CaseCoordClientsPage from './portal-case-coord/clients/page';
import CaseCoordPortalPage from './portal-case-coord/page';
import BcbaClientsPage from './portal-clinical/bcbas/page';
import ClinicalPortalPage from './portal-clinical/page';

const STAFF_ID = '11111111-1111-4111-8111-111111111111';
const BCBA_ID = '22222222-2222-4222-8222-222222222222';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';

type ElementProps = Record<string, unknown> & { children?: React.ReactNode };

function staff(role: string, overrides: Record<string, unknown> = {}) {
  return {
    id: STAFF_ID,
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

function findElementWithProps(
  node: React.ReactNode,
  requiredProps: string[]
): React.ReactElement<ElementProps> | null {
  if (!React.isValidElement(node)) return null;
  const element = node as React.ReactElement<ElementProps>;
  if (requiredProps.every((key) => key in element.props)) return element;

  for (const child of React.Children.toArray(element.props.children)) {
    const match = findElementWithProps(child, requiredProps);
    if (match) return match;
  }
  return null;
}

function expectNoProtectedReads() {
  expect(mocks.clientFindMany).not.toHaveBeenCalled();
  expect(mocks.userFindMany).not.toHaveBeenCalled();
  expect(mocks.caseOpeningCount).not.toHaveBeenCalled();
  expect(mocks.caseApplicationCount).not.toHaveBeenCalled();
  expect(mocks.getBcbaOpsMetrics).not.toHaveBeenCalled();
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.notFound.mockImplementation(() => {
    throw new Error(NOT_FOUND);
  });
  mocks.getCurrentUser.mockResolvedValue(staff('CEO'));
  mocks.clientFindMany.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.caseOpeningCount.mockResolvedValue(0);
  mocks.caseApplicationCount.mockResolvedValue(0);
  mocks.getBcbaOpsMetrics.mockResolvedValue({
    success: true,
    metrics: {
      activeCaseload: 0,
      unsignedNotes: 0,
      sessionsAwaitingSign: 0,
      readyForPlutus: 0,
      p2pAlerts: 0,
      assessmentPrep: 0,
      txPlansInProgress: 0,
      activeClients: [],
      unsignedPreviews: [],
      txPlanClients: [],
      p2pClients: [],
      bcbaLoads: [],
      viewerRole: 'CEO',
      scopedToBcbaId: null,
      isDirector: true,
    },
  });
});

describe('intake portal loaders', () => {
  it('denies a cross-role actor before the dashboard client query', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('RBT'));

    await expect(CasePortalPage()).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('denies an inactive intake actor before the clients queries', async () => {
    mocks.getCurrentUser.mockResolvedValue(
      staff('INTAKE_PA_COORDINATOR', { isActive: false })
    );

    await expect(IntakeClientsPage()).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('renders the dashboard from status and case-coordination rows', async () => {
    const rows = [
      { status: 'INQUIRY', caseCoordinatorId: null },
      { status: 'DOCS_SUBMITTED', caseCoordinatorId: 'coordinator-1' },
    ];
    mocks.getCurrentUser.mockResolvedValue(staff('INTAKE_PA_COORDINATOR'));
    mocks.clientFindMany.mockResolvedValue(rows);

    const page = await CasePortalPage();
    const dashboard = findElementWithProps(page, ['clients']);

    expect(dashboard?.props.clients).toEqual(rows);
    expect(mocks.clientFindMany).toHaveBeenCalledWith({
      select: { status: true, caseCoordinatorId: true },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('renders the intake queue without packet JSON or message content', async () => {
    const clients = [
      {
        id: CLIENT_ID,
        firstName: 'Ari',
        lastName: 'Client',
        guardianName: 'Parent',
        status: 'INQUIRY',
        caseCoordinatorId: null,
        updatedAt: new Date('2026-08-12T12:00:00.000Z'),
        messages: [],
      },
    ];
    mocks.getCurrentUser.mockResolvedValue(staff('INTAKE_PA_COORDINATOR'));
    mocks.clientFindMany.mockResolvedValue(clients);

    const page = await IntakeClientsPage();
    const queue = findElementWithProps(page, ['clients']);

    expect(queue?.props.clients).toEqual(clients);
    expect(queue?.props).not.toHaveProperty('coordinators');
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.clientFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        status: true,
        caseCoordinatorId: true,
        updatedAt: true,
        messages: {
          where: { isFromClient: true, readAt: null },
          select: { isFromClient: true, readAt: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('billing portal loaders', () => {
  it('denies a clinical cross-role actor before either billing query', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('BCBA', { id: BCBA_ID }));

    await expect(BillingPortalPage()).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('denies a missing actor before either clients query', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    await expect(BillingClientsPage()).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('renders the authorized dashboard with live PA metrics and no queue mutations', async () => {
    const rawTreatmentClient = {
      id: CLIENT_ID,
      firstName: 'Bill',
      lastName: 'Client',
      status: 'REPORT_ASSEMBLED',
      updatedAt: new Date('2026-08-12T12:00:00.000Z'),
      treatmentPlan: {
        parentSignature: 'raw-signature-value',
        clinicalNarrative: 'must not cross the page boundary',
      },
      paRequests: [],
      messages: [],
    };
    mocks.getCurrentUser.mockResolvedValue(staff('BILLING'));
    mocks.clientFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([rawTreatmentClient]);

    const page = await BillingPortalPage();
    const dashboard = findElementWithProps(page, ['metrics']);

    expect(React.isValidElement(page)).toBe(true);
    expect(dashboard?.props.metrics).toEqual({
      assessmentRoster: 0,
      treatmentRoster: 1,
      pendingVob: 0,
      assessmentInFlight: 0,
      assessmentExpiring: 0,
      treatmentReady: 1,
      treatmentInFlight: 0,
      treatmentExpiring: 0,
      deniedAttention: 0,
    });
    expect(findElementWithProps(page, ['assessmentClients', 'treatmentClients'])).toBeNull();
    expect(JSON.stringify(dashboard?.props)).not.toContain('raw-signature-value');
    expect(JSON.stringify(dashboard?.props)).not.toContain('clinicalNarrative');
    expect(mocks.clientFindMany).toHaveBeenCalledTimes(2);
  });

  it('renders the authorized clients queue with sanitized treatment-plan data', async () => {
    const rawTreatmentClient = {
      id: CLIENT_ID,
      firstName: 'Bill',
      lastName: 'Client',
      status: 'REPORT_ASSEMBLED',
      updatedAt: new Date('2026-08-12T12:00:00.000Z'),
      treatmentPlan: {
        parentSignature: 'raw-signature-value',
        clinicalNarrative: 'must not cross the page boundary',
      },
      paRequests: [],
      messages: [],
    };
    mocks.getCurrentUser.mockResolvedValue(staff('BILLING'));
    mocks.clientFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([rawTreatmentClient]);

    const page = await BillingClientsPage();
    const queue = findElementWithProps(page, ['assessmentClients', 'treatmentClients']);
    const treatmentClients = queue?.props.treatmentClients as Array<{
      treatmentPlan: unknown;
    }>;

    expect(React.isValidElement(page)).toBe(true);
    expect(treatmentClients[0].treatmentPlan).toEqual({ parentSignature: true });
    expect(JSON.stringify(queue?.props)).not.toContain('raw-signature-value');
    expect(JSON.stringify(queue?.props)).not.toContain('clinicalNarrative');
    expect(mocks.clientFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.clientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          updatedAt: true,
          treatmentPlan: true,
          paRequests: {
            select: {
              id: true,
              type: true,
              status: true,
              vobCompleted: true,
              providerCredentialed: true,
              authNumber: true,
              approvedUnits: true,
              effectiveDate: true,
              expirationDate: true,
              p2pResolved: true,
              p2pNotes: true,
              updatedAt: true,
            },
          },
          messages: {
            where: { isFromClient: true, readAt: null },
            select: { isFromClient: true, readAt: true },
          },
        }),
      })
    );
  });
});

describe('case-coordination portal loaders', () => {
  it('denies a billing cross-role actor before dashboard metrics queries', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('BILLING'));

    await expect(CaseCoordPortalPage()).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('denies a synthetic actor before the clients roster queries', async () => {
    mocks.getCurrentUser.mockResolvedValue(
      staff('CASE_COORDINATOR', { id: 'mock-user-id' })
    );

    await expect(
      CaseCoordClientsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('rejects a malformed status filter before Prisma', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('CASE_COORDINATOR'));

    await expect(
      CaseCoordClientsPage({
        searchParams: Promise.resolve({ status: ['ACTIVE'] }) as never,
      })
    ).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('renders dashboard metrics from the narrow roster projection', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('CASE_COORDINATOR'));
    mocks.clientFindMany.mockResolvedValue([
      {
        id: CLIENT_ID,
        firstName: 'Case',
        lastName: 'Client',
        status: 'STAFFING_PENDING',
        caseCoordinatorId: STAFF_ID,
        rbtId: null,
        rbtApproved: false,
      },
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: STAFF_ID, firstName: 'Case', lastName: 'Coordinator' },
    ]);
    mocks.caseOpeningCount.mockResolvedValue(2);
    mocks.caseApplicationCount.mockResolvedValue(3);

    const page = await CaseCoordPortalPage();

    expect(page.props.metrics).toEqual({
      staffingPending: 1,
      openOpenings: 2,
      pendingApps: 3,
      activeCases: 0,
      meetAndGreetsPending: 0,
      totalCaseload: 1,
    });
    expect(mocks.clientFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        status: true,
        caseCoordinatorId: true,
        rbtId: true,
        rbtApproved: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('denies an intake actor from the case-coord clients roster', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('INTAKE_PA_COORDINATOR'));

    await expect(
      CaseCoordClientsPage({
        searchParams: Promise.resolve({ status: 'ACTIVE' }),
      }),
    ).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('renders the clients roster with only displayed staff fields', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('CASE_COORDINATOR'));
    mocks.clientFindMany.mockResolvedValue([]);

    const page = await CaseCoordClientsPage({
      searchParams: Promise.resolve({ status: 'ACTIVE' }),
    });

    expect(page.props.initialStatusFilter).toBe('ACTIVE');
    expect(mocks.clientFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        status: true,
        caseCoordinatorId: true,
        rbtId: true,
        rbtApproved: true,
        bcba: { select: { firstName: true, lastName: true } },
        rbt: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  });
});

describe('clinical portal loaders', () => {
  it('denies a billing cross-role actor before metrics or BCBA queries', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('BILLING'));

    await expect(ClinicalPortalPage()).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('denies an inactive BCBA before caseload queries', async () => {
    mocks.getCurrentUser.mockResolvedValue(
      staff('BCBA', { id: BCBA_ID, isActive: false })
    );

    await expect(BcbaClientsPage()).rejects.toThrow(NOT_FOUND);
    expectNoProtectedReads();
  });

  it('renders BCBA metrics without loading the agency BCBA directory', async () => {
    const metrics = {
      activeCaseload: 1,
      unsignedNotes: 0,
      sessionsAwaitingSign: 0,
      readyForPlutus: 0,
      p2pAlerts: 0,
      assessmentPrep: 0,
      txPlansInProgress: 0,
      activeClients: [],
      unsignedPreviews: [],
      txPlanClients: [],
      p2pClients: [],
      bcbaLoads: [],
      viewerRole: 'BCBA',
      scopedToBcbaId: BCBA_ID,
      isDirector: false,
    };
    mocks.getCurrentUser.mockResolvedValue(staff('BCBA', { id: BCBA_ID }));
    mocks.getBcbaOpsMetrics.mockResolvedValue({ success: true, metrics });

    const page = await ClinicalPortalPage();
    const dashboard = findElementWithProps(page, ['metrics']);

    expect(dashboard?.props.metrics).toEqual(metrics);
    expect('bcbas' in (dashboard?.props ?? {})).toBe(false);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getBcbaOpsMetrics.mock.invocationCallOrder[0]
    );
  });

  it('filters the BCBA queue and directory to the persisted BCBA actor', async () => {
    mocks.getCurrentUser.mockResolvedValue(staff('BCBA', { id: BCBA_ID }));
    mocks.clientFindMany.mockResolvedValue([
      {
        id: CLIENT_ID,
        firstName: 'Clinical',
        lastName: 'Client',
        guardianName: 'Parent',
        status: 'ACTIVE',
        bcbaId: BCBA_ID,
        updatedAt: new Date('2026-08-12T12:00:00.000Z'),
        paRequests: [],
        authorizations: [],
        messages: [],
        rbt: null,
        caseCoordinator: null,
      },
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: BCBA_ID, firstName: 'Assigned', lastName: 'BCBA' },
    ]);

    const page = await BcbaClientsPage();
    const dashboard = findElementWithProps(page, ['clients', 'bcbas']);
    const clientQuery = mocks.clientFindMany.mock.calls[0][0];

    expect(React.isValidElement(page)).toBe(true);
    expect((dashboard?.props.clients as Array<{ bcbaId: string }>)[0].bcbaId).toBe(
      BCBA_ID
    );
    expect(clientQuery.where).toEqual(
      expect.objectContaining({
        bcbaId: BCBA_ID,
        OR: expect.any(Array),
      })
    );
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: { role: 'BCBA', isActive: true, id: BCBA_ID },
      select: { id: true, firstName: true, lastName: true },
    });
  });
});
