import React from 'react';
import { prisma } from '@/lib/prisma';
import BcbaDashboard from '@/components/portal-clinical/BcbaDashboard';
import { CLINICAL_ROLES, requirePersistedStaff } from '@/lib/auth-guard';
import {
  clinicWallClock,
  endOfClinicDayForDateOnly,
  startOfClinicDay,
  startOfClinicDayForDateOnly,
} from '@/lib/clinicTimezone';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

type AuthorizationWindow = {
  startDate: Date | null;
  endDate: Date | null;
};

type PaWindow = {
  status: string;
  effectiveDate: Date | null;
  expirationDate: Date | null;
};

const authExpirationFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Pick the soonest approved window that has started and remains valid through
 * the current clinic day. Auth dates are date-only DB values, so day math uses
 * clinic calendar fields instead of host-timezone millisecond rounding.
 */
function nearestActiveAuthorization(
  authorizations: AuthorizationWindow[],
  paRequests: PaWindow[],
  now: Date
) {
  const windows = [
    ...authorizations,
    ...paRequests
      .filter((pa) => pa.status === 'APPROVED')
      .map((pa) => ({ startDate: pa.effectiveDate, endDate: pa.expirationDate })),
  ].filter((window): window is AuthorizationWindow & { endDate: Date } => {
    if (!window.endDate) return false;
    if (window.startDate && startOfClinicDayForDateOnly(window.startDate) > now) return false;
    return endOfClinicDayForDateOnly(window.endDate) >= now;
  });

  const nearest = windows.sort(
    (a, b) =>
      startOfClinicDayForDateOnly(a.endDate).getTime() -
      startOfClinicDayForDateOnly(b.endDate).getTime()
  )[0];
  if (!nearest) return null;

  const today = clinicWallClock(startOfClinicDay(now));
  const expiration = clinicWallClock(startOfClinicDayForDateOnly(nearest.endDate));
  const daysRemaining = Math.round(
    (Date.UTC(expiration.year, expiration.month - 1, expiration.day) -
      Date.UTC(today.year, today.month - 1, today.day)) /
      86_400_000
  );

  return {
    daysRemaining,
    expiresOn: authExpirationFormatter.format(nearest.endDate),
  };
}

export default async function BcbaClientsPage() {
  const access = await requirePersistedStaff(CLINICAL_ROLES);
  if (!access.ok) notFound();

  const isBcba = access.user.role === 'BCBA';
  const now = new Date();

  // Fetch clients that are in the BCBA phases, staffing pending, or have a pending P2P alert
  const clients = await prisma.client.findMany({
    where: {
      ...(isBcba ? { bcbaId: access.user.id } : {}),
      OR: [
        { status: { in: ['STAFFING_PENDING', 'PA_SUBMITTED', 'PA_APPROVED', 'ASSESSMENT_SCHEDULED', 'REPORT_ASSEMBLED', 'TX_PA_SUBMITTED', 'TX_PA_APPROVED', 'ACTIVE'] } },
        { paRequests: { some: { status: 'DENIED_CLINICAL', p2pResolved: false } } }
      ]
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      status: true,
      bcbaId: true,
      updatedAt: true,
      paRequests: {
        where: { status: { in: ['APPROVED', 'DENIED_CLINICAL'] } },
        select: {
          status: true,
          p2pResolved: true,
          effectiveDate: true,
          expirationDate: true,
        },
      },
      authorizations: {
        where: { status: 'APPROVED', endDate: { not: null } },
        select: {
          startDate: true,
          endDate: true,
        },
      },
      messages: {
        where: { isFromClient: true, readAt: null },
        select: { isFromClient: true, readAt: true },
      },
      rbt: {
        select: { firstName: true, lastName: true },
      },
      caseCoordinator: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: {
      updatedAt: 'asc'
    }
  });

  const dashboardClients = clients.map(({ authorizations, paRequests, ...client }) => ({
    ...client,
    paRequests: paRequests.map(({ status, p2pResolved }) => ({ status, p2pResolved })),
    authorizationExpiry: nearestActiveAuthorization(authorizations, paRequests, now),
  }));

  const allBcbas = await prisma.user.findMany({
    where: {
      role: 'BCBA',
      isActive: true,
      ...(isBcba ? { id: access.user.id } : {}),
    },
    select: { id: true, firstName: true, lastName: true }
  });

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-heading tracking-wide">BCBA Portal &amp; Caseload</h1>
          <p className="text-zinc-400 mt-1 text-sm font-sans">Manage BCBA Assignments, Assessment Prep, Treatment Plans, and Peer-to-Peer alerts.</p>
        </div>
        
        <BcbaDashboard clients={dashboardClients} bcbas={allBcbas} />
      </div>
    </div>
  );
}
