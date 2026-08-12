import React from 'react';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import CaseOpeningsMarketplace from '@/components/portal-case-coord/CaseOpeningsMarketplace';
import { requireStaff } from '@/lib/auth-guard';
import { CASE_OPENING_MANAGER_ROLES } from '@/lib/assignmentSecurity';
import { notFound } from 'next/navigation';

/** Always fetch fresh applications — HRM apply writes to shared DB outside this app's revalidatePath. */
export const dynamic = 'force-dynamic';

const CASE_OPENING_INCLUDE = {
  client: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      guardianName: true,
      guardianPhone: true,
      bcbaId: true,
      rbtId: true,
      rbtApproved: true,
      caseCoordinatorId: true,
      treatmentPlan: true,
      paRequests: { select: { type: true, status: true } },
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  applications: {
    include: {
      rbt: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
} as const satisfies Prisma.CaseOpeningInclude;

const ELIGIBLE_CLIENT_INCLUDE = {
  bcba: { select: { firstName: true, lastName: true } },
  paRequests: { select: { type: true, status: true } },
  caseOpenings: {
    where: { status: 'OPEN' },
    select: { id: true, caseCode: true },
  },
} as const satisfies Prisma.ClientInclude;

type CaseOpeningRow = Prisma.CaseOpeningGetPayload<{
  include: typeof CASE_OPENING_INCLUDE;
}>;

type SerializedCaseOpening = Omit<CaseOpeningRow, 'applications'> & {
  applications: Array<
    Omit<CaseOpeningRow['applications'][number], 'meetAt' | 'createdAt'> & {
      meetAt: string | null;
      createdAt: string;
    }
  >;
};

export default async function CaseCoordOpeningsPage() {
  const access = await requireStaff(CASE_OPENING_MANAGER_ROLES);
  if (!access.ok) notFound();

  const managedClientWhere: Prisma.ClientWhereInput =
    access.user.role === 'CASE_COORDINATOR'
      ? {
          OR: [
            { caseCoordinatorId: access.user.id },
            { caseCoordinatorId: null },
          ],
        }
      : {};
  const openingsWhere: Prisma.CaseOpeningWhereInput =
    access.user.role === 'CASE_COORDINATOR'
      ? { client: managedClientWhere }
      : {};

  const [openings, eligibleClients] = await Promise.all([
    prisma.caseOpening.findMany({
      where: openingsWhere,
      include: CASE_OPENING_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.client.findMany({
      where: {
        status: { in: ['STAFFING_PENDING', 'ACTIVE'] },
        ...managedClientWhere,
      },
      include: ELIGIBLE_CLIENT_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const serializedOpenings: SerializedCaseOpening[] = openings.map((o) => ({
    ...o,
    applications: o.applications.map((a) => ({
      ...a,
      meetAt: a.meetAt?.toISOString() ?? null,
      createdAt: a.createdAt?.toISOString() ?? null,
    })),
  }));

  return (
    <CaseOpeningsMarketplace openings={serializedOpenings} eligibleClients={eligibleClients} />
  );
}
