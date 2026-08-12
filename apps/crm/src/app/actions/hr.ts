'use server';

import type { Role } from '@repo/db';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import {
  CASE_COORD_ROLES,
  HR_ROLES,
  LEADERSHIP_ROLES,
  requireClientAccess,
  requireStaff,
} from '@/lib/auth-guard';

const ASSIGNMENT_STAFF_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
} as const;

const GLOBAL_CASE_COORDINATOR_MANAGERS: readonly Role[] = [
  ...LEADERSHIP_ROLES,
  'INTAKE_PA_COORDINATOR',
  'CLINICAL_SUPPORT',
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function canManageEveryCoordinatorAssignment(role: Role) {
  return GLOBAL_CASE_COORDINATOR_MANAGERS.includes(role);
}

export type AssignmentStaff = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
};

export type ClientAssignmentSnapshot = {
  clientId: string;
  bcbaId: string | null;
  rbtId: string | null;
  caseCoordinatorId: string | null;
  rbtApproved: boolean;
  bcba: AssignmentStaff | null;
  rbt: AssignmentStaff | null;
  caseCoordinator: AssignmentStaff | null;
  caseCoordinatorOptions: AssignmentStaff[];
  canAssignCaseCoordinator: boolean;
};

type UpdateCaseCoordinatorInput = {
  clientId: string;
  caseCoordinatorId: string | null;
  expectedCaseCoordinatorId: string | null;
};

export async function assignHrStaff(_clientId: string, data: { bcbaId?: string | null, rbtId?: string | null }) {
  const gate = await requireStaff(HR_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  try {
    // Case RBT matching moved to CaseOpening job board + Case Coord.
    // BCBA assignment belongs to Clinical Director (assignBcba).
    if (data.rbtId !== undefined) {
      return {
        success: false,
        error: 'RBT case assignment is via the Job Board / Case Coord — not HR dispatch.',
      };
    }
    if (data.bcbaId !== undefined) {
      return {
        success: false,
        error: 'BCBA assignment is owned by the Clinical Director. Use Clinical portal assignBcba.',
      };
    }

    return { success: false, error: 'No assignment fields provided.' };
  } catch (error) {
    console.error('Action failed [assignHrStaff]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Operation failed. Please try again.' };
  }
}

export async function getHrStaffingOptions() {
  const gate = await requireStaff();
  if (!gate.ok) return { success: false, bcbas: [], rbts: [], error: gate.error };

  try {
    const [bcbas, rbts] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'BCBA', isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.user.findMany({
        where: { role: 'RBT', isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    return { success: true, bcbas, rbts };
  } catch (error) {
    console.error(
      'Action failed [getHrStaffingOptions]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      bcbas: [],
      rbts: [],
      error: 'Unable to load staffing options. Please try again.',
    };
  }
}

/**
 * Canonical, client-scoped assignment read for the profile tab.
 *
 * Client assignment relations are one-to-one (`User?`) in Prisma, so they are
 * returned as direct objects rather than arrays. Regular Case Coordinators may
 * claim an unassigned client or manage their own assignment; broader assignment
 * changes remain limited to leadership, Intake, and Clinical Support.
 */
export async function getClientAssignmentSnapshot(clientId: string) {
  const staffGate = await requireStaff();
  if (!staffGate.ok) {
    return { success: false as const, data: null, error: staffGate.error };
  }

  try {
    if (!isUuid(clientId)) {
      return { success: false as const, data: null, error: 'Invalid client.' };
    }

    const accessGate = await requireClientAccess(clientId);
    if (!accessGate.ok) {
      return { success: false as const, data: null, error: accessGate.error };
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        bcbaId: true,
        rbtId: true,
        caseCoordinatorId: true,
        rbtApproved: true,
        bcba: { select: ASSIGNMENT_STAFF_SELECT },
        rbt: { select: ASSIGNMENT_STAFF_SELECT },
        caseCoordinator: { select: ASSIGNMENT_STAFF_SELECT },
      },
    });
    if (!client) {
      return { success: false as const, data: null, error: 'Client not found.' };
    }

    const actorRole = staffGate.user.role as Role;
    const canManageEveryAssignment = canManageEveryCoordinatorAssignment(actorRole);
    const canManageOwnAssignment =
      actorRole === 'CASE_COORDINATOR' &&
      (client.caseCoordinatorId === null || client.caseCoordinatorId === staffGate.user.id);
    const canAssignCaseCoordinator = canManageEveryAssignment || canManageOwnAssignment;

    const caseCoordinatorOptions = canAssignCaseCoordinator
      ? await prisma.user.findMany({
          where: {
            role: 'CASE_COORDINATOR',
            isActive: true,
            ...(canManageEveryAssignment ? {} : { id: staffGate.user.id }),
          },
          select: ASSIGNMENT_STAFF_SELECT,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
      : [];

    const data: ClientAssignmentSnapshot = {
      clientId: client.id,
      bcbaId: client.bcbaId,
      rbtId: client.rbtId,
      caseCoordinatorId: client.caseCoordinatorId,
      rbtApproved: client.rbtApproved,
      bcba: client.bcba,
      rbt: client.rbt,
      caseCoordinator: client.caseCoordinator,
      caseCoordinatorOptions,
      canAssignCaseCoordinator,
    };

    return { success: true as const, data };
  } catch (error) {
    console.error(
      'Action failed [getClientAssignmentSnapshot]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false as const,
      data: null,
      error: 'Unable to load current assignments. Please try again.',
    };
  }
}

/**
 * Race-safe coordinator write for the client profile.
 *
 * The expected current coordinator is part of the update predicate, preventing
 * a stale browser from overwriting a newer assignment. The target is validated
 * as an active Case Coordinator, and both authorization and mutation are scoped
 * to the same canonical Client row.
 */
export async function updateClientCaseCoordinator(input: UpdateCaseCoordinatorInput) {
  const roleGate = await requireStaff(CASE_COORD_ROLES);
  if (!roleGate.ok) return { success: false as const, error: roleGate.error };

  try {
    if (
      !input ||
      !isUuid(input.clientId) ||
      !isNullableUuid(input.caseCoordinatorId) ||
      !isNullableUuid(input.expectedCaseCoordinatorId)
    ) {
      return { success: false as const, error: 'Invalid assignment request.' };
    }

    const accessGate = await requireClientAccess(input.clientId);
    if (!accessGate.ok) {
      return { success: false as const, error: accessGate.error };
    }

    const current = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { id: true, caseCoordinatorId: true },
    });
    if (!current) {
      return { success: false as const, error: 'Client not found.' };
    }
    if (current.caseCoordinatorId !== input.expectedCaseCoordinatorId) {
      return {
        success: false as const,
        error: 'This assignment changed in another session. Reloaded data is required before saving.',
      };
    }

    const actorRole = roleGate.user.role as Role;
    if (!canManageEveryCoordinatorAssignment(actorRole)) {
      const managesOwnClient =
        actorRole === 'CASE_COORDINATOR' &&
        (current.caseCoordinatorId === null || current.caseCoordinatorId === roleGate.user.id);
      const onlyTargetsSelf =
        input.caseCoordinatorId === null || input.caseCoordinatorId === roleGate.user.id;
      if (!managesOwnClient || !onlyTargetsSelf) {
        return {
          success: false as const,
          error: 'You may only claim an unassigned client or update your own coordinator assignment.',
        };
      }
    }

    const targetCoordinator = input.caseCoordinatorId
      ? await prisma.user.findFirst({
          where: {
            id: input.caseCoordinatorId,
            role: 'CASE_COORDINATOR',
            isActive: true,
          },
          select: ASSIGNMENT_STAFF_SELECT,
        })
      : null;
    if (input.caseCoordinatorId && !targetCoordinator) {
      return {
        success: false as const,
        error: 'Select an active Case Coordinator.',
      };
    }

    const updated = await prisma.client.updateMany({
      where: {
        id: input.clientId,
        caseCoordinatorId: input.expectedCaseCoordinatorId,
      },
      data: { caseCoordinatorId: input.caseCoordinatorId },
    });
    if (updated.count !== 1) {
      return {
        success: false as const,
        error: 'This assignment changed in another session. Refresh and try again.',
      };
    }

    revalidatePath('/', 'layout');
    revalidatePath(`/client/${input.clientId}`);
    revalidatePath('/portal-case/clients');
    revalidatePath('/portal-case-coord');

    return {
      success: true as const,
      data: {
        caseCoordinatorId: input.caseCoordinatorId,
        caseCoordinator: targetCoordinator,
      },
    };
  } catch (error) {
    console.error(
      'Action failed [updateClientCaseCoordinator]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false as const,
      error: 'Unable to update the Case Coordinator. Please try again.',
    };
  }
}
