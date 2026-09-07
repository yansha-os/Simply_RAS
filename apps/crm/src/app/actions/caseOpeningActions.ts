'use server';

import { prisma } from '@/lib/prisma';
import type { CaseApplicationStatus } from '@repo/db';
import { revalidatePath } from 'next/cache';
import {
  requireClientAccess,
  requireStaff,
  CASE_COORD_ROLES,
} from '@/lib/auth-guard';
import {
  CASE_OPENING_MANAGER_ROLES,
  buildAssignmentAuditRow,
  isIdempotentParentAcceptance,
  isPrismaWriteConflict,
  validateAssignmentRequest,
  validateAssignmentTarget,
  validateCaseApplicationTransition,
  validateExpectedCaseApplicationStatus,
  validateOwnedClientScope,
} from '@/lib/assignmentSecurity';

const CASE_OPENING_STALE = 'CASE_OPENING_STALE';
const CASE_APPLICATION_STALE = 'CASE_APPLICATION_STALE';
const PARENT_DECISION_STALE = 'PARENT_DECISION_STALE';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function initialsFromName(firstName: string, lastName: string) {
  const f = (firstName || '?').trim().charAt(0).toUpperCase();
  const l = (lastName || '?').trim().charAt(0).toUpperCase();
  return `${f}.${l}.`;
}

function ageBandFromAge(age: number | null | undefined) {
  if (age == null || Number.isNaN(age)) return 'Age band TBD';
  if (age <= 5) return 'Ages 3–5';
  if (age <= 8) return 'Ages 6–8';
  if (age <= 12) return 'Ages 9–12';
  return 'Ages 13+';
}

function makeCaseCode() {
  const n = Math.floor(100 + Math.random() * 900);
  return `RAS-NY-${n}`;
}

export async function listStaffingPendingClientsForOpenings() {
  const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
  if (!gate.ok) return { success: false, error: gate.error, clients: [] };

  try {
    const clients = await prisma.client.findMany({
      where: {
        status: { in: ['STAFFING_PENDING', 'ACTIVE'] },
        ...(gate.user.role === 'CASE_COORDINATOR'
          ? {
              OR: [
                { caseCoordinatorId: gate.user.id },
                { caseCoordinatorId: null },
              ],
            }
          : {}),
      },
      include: {
        bcba: { select: { id: true, firstName: true, lastName: true } },
        paRequests: { select: { type: true, status: true } },
        caseOpenings: {
          where: { status: 'OPEN' },
          select: { id: true, caseCode: true, status: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { success: true, clients };
  } catch (error) {
    console.error('Action failed [listStaffingPendingClientsForOpenings]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to load clients.', clients: [] };
  }
}

function extractZipFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

export async function createCaseOpening(input: {
  clientId: string;
  expectedCaseCoordinatorId: string | null;
  weeklyHours?: number | null;
  borough?: string | null;
  zipCode?: string | null;
  childAge?: number | null;
  scheduleText?: string | null;
  daysOfWeek?: string | null;
  scheduleJson?: Record<string, { start: string; end: string } | null> | null;
  languagePref?: string | null;
  genderPref?: string | null;
  serviceSetting?: string | null;
  sessionLengthMinutes?: number | null;
  listingHighlights?: string | null;
}) {
  const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    if (
      !input ||
      !UUID_PATTERN.test(input.clientId) ||
      !UUID_PATTERN.test(gate.user.id) ||
      (input.expectedCaseCoordinatorId !== null &&
        !UUID_PATTERN.test(input.expectedCaseCoordinatorId))
    ) {
      return { success: false as const, error: 'Invalid case-opening request.' };
    }

    const access = await requireClientAccess(input.clientId);
    if (!access.ok) return { success: false as const, error: access.error };

    const createdById = gate.user.id;
    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
      include: {
        bcba: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          },
        },
        paRequests: { select: { type: true, status: true } },
      },
    });
    if (!client) return { success: false, error: 'Client not found.' };

    const scope = validateOwnedClientScope(
      {
        id: gate.user.id,
        role: gate.user.role,
        isActive: gate.user.isActive !== false,
      },
      client.caseCoordinatorId,
      true
    );
    if (!scope.ok) return { success: false as const, error: scope.error };
    if (client.caseCoordinatorId !== input.expectedCaseCoordinatorId) {
      return {
        success: false as const,
        error: 'The client coordinator changed. Refresh and try again.',
      };
    }

    const bcbaTarget = validateAssignmentTarget(client.bcba, 'BCBA');
    if (!bcbaTarget.ok) {
      return { success: false as const, error: bcbaTarget.error };
    }

    if (client.status !== 'STAFFING_PENDING' && client.status !== 'ACTIVE') {
      return {
        success: false,
        error: 'Client must be STAFFING_PENDING (Treatment PA approved) before posting a job opening.',
      };
    }

    const { getStaffingReadiness } = await import('@/lib/staffingReadiness');
    const readiness = getStaffingReadiness(client);
    if (!readiness.ready && client.status === 'STAFFING_PENDING') {
      const missing = readiness.items.filter((i) => !i.met).map((i) => i.label).join('; ');
      return {
        success: false,
        error: `Staffing readiness incomplete: ${missing}`,
      };
    }

    let caseCode = makeCaseCode();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.caseOpening.findUnique({ where: { caseCode } });
      if (!clash) break;
      caseCode = makeCaseCode();
    }

    let tp: unknown = client.treatmentPlan;
    if (typeof tp === 'string') {
      try {
        tp = JSON.parse(tp);
      } catch {
        tp = {};
      }
    }
    const prefs =
      typeof tp === 'object' &&
      tp !== null &&
      'staffingPreferences' in tp &&
      typeof tp.staffingPreferences === 'object' &&
      tp.staffingPreferences !== null
        ? (tp.staffingPreferences as Record<string, unknown>)
        : {};

    const childAgeRaw = input.childAge ?? client.childAge ?? null;
    // Overview can hold bad demo values (e.g. -18); only persist sane ages
    const childAge =
      typeof childAgeRaw === 'number' && childAgeRaw >= 0 && childAgeRaw <= 30
        ? childAgeRaw
        : null;
    const zipCode =
      input.zipCode?.trim() ||
      extractZipFromAddress(client.parentAddress) ||
      null;

    const weeklyHours =
      input.weeklyHours == null
        ? null
        : Math.round(Number(input.weeklyHours));

    const correlationId = crypto.randomUUID();
    const mutation = await prisma.$transaction(
      async (tx) => {
        const current = await tx.client.findUnique({
          where: { id: client.id },
          include: {
            bcba: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
              },
            },
            paRequests: { select: { type: true, status: true } },
          },
        });
        if (!current) throw new Error('CLIENT_NOT_FOUND');

        const currentScope = validateOwnedClientScope(
          {
            id: gate.user.id,
            role: gate.user.role,
            isActive: gate.user.isActive !== false,
          },
          current.caseCoordinatorId,
          true
        );
        if (!currentScope.ok) return { policyError: currentScope.error } as const;
        if (
          current.caseCoordinatorId !== input.expectedCaseCoordinatorId ||
          (current.status !== 'STAFFING_PENDING' && current.status !== 'ACTIVE')
        ) {
          throw new Error(CASE_OPENING_STALE);
        }
        const currentBcba = validateAssignmentTarget(current.bcba, 'BCBA');
        if (!currentBcba.ok) return { policyError: currentBcba.error } as const;

        const currentReadiness = getStaffingReadiness(current);
        if (!currentReadiness.ready && current.status === 'STAFFING_PENDING') {
          return {
            policyError: `Staffing readiness incomplete: ${currentReadiness.items
              .filter((item) => !item.met)
              .map((item) => item.label)
              .join('; ')}`,
          } as const;
        }

        const existingOpen = await tx.caseOpening.findFirst({
          where: { clientId: current.id, status: 'OPEN' },
          select: { caseCode: true },
        });
        if (existingOpen) {
          return { existingCode: existingOpen.caseCode } as const;
        }

        const nextCoordinatorId =
          current.caseCoordinatorId ??
          (gate.user.role === 'CASE_COORDINATOR' ? gate.user.id : null);
        const claimed = await tx.client.updateMany({
          where: {
            id: current.id,
            status: { in: ['STAFFING_PENDING', 'ACTIVE'] },
            caseCoordinatorId: input.expectedCaseCoordinatorId,
          },
          data: { caseCoordinatorId: nextCoordinatorId },
        });
        if (claimed.count !== 1) throw new Error(CASE_OPENING_STALE);

        const opening = await tx.caseOpening.create({
          data: {
            clientId: current.id,
            createdById,
            caseCode,
            weeklyHours,
            borough: input.borough ?? null,
            zipCode,
            childAge,
            scheduleText: input.scheduleText ?? null,
            daysOfWeek: input.daysOfWeek ?? null,
            scheduleJson: input.scheduleJson ?? undefined,
            languagePref:
              input.languagePref ??
              (typeof prefs.language === 'string' ? prefs.language : null),
            genderPref:
              input.genderPref ??
              (typeof prefs.gender === 'string' ? prefs.gender : null),
            serviceSetting: input.serviceSetting ?? 'In-home ABA (97153)',
            sessionLengthMinutes:
              input.sessionLengthMinutes == null
                ? null
                : Math.round(Number(input.sessionLengthMinutes)),
            listingHighlights: input.listingHighlights ?? null,
            clientInitials: initialsFromName(current.firstName, current.lastName),
            ageBand: ageBandFromAge(childAge),
            bcbaDisplayName: current.bcba
              ? `${current.bcba.firstName} ${current.bcba.lastName}, BCBA`
              : null,
          },
        });

        if (current.caseCoordinatorId !== nextCoordinatorId) {
          await tx.auditLogVault.create({
            data: buildAssignmentAuditRow({
              actorUserId: gate.user.id,
              action: 'ASSIGN',
              entityType: 'CLIENT_CASE_COORDINATOR_ASSIGNMENT',
              entityId: current.id,
              previousId: current.caseCoordinatorId,
              nextId: nextCoordinatorId,
              source: 'CASE_OPENING_CREATE',
              reason: 'Coordinator claimed unassigned client while publishing opening',
              correlationId,
            }),
          });
        }

        return { opening } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in mutation) {
      return { success: false as const, error: mutation.policyError };
    }
    if ('existingCode' in mutation) {
      return {
        success: false as const,
        error: `Client already has open listing ${mutation.existingCode}.`,
      };
    }
    const opening = mutation.opening;

    // JOB_POSTED → active RBTs (soft; skip fan-out when roster is large to avoid noise)
    try {
      const { notifyUsers } = await import('@/app/actions/notifications');
      const MAX_RBT_FANOUT = 30;
      const activeRbts = await prisma.user.findMany({
        where: { role: 'RBT', isActive: true },
        select: { id: true },
        take: MAX_RBT_FANOUT + 1,
      });
      if (activeRbts.length > 0 && activeRbts.length <= MAX_RBT_FANOUT) {
        const place =
          [opening.borough, opening.zipCode].filter(Boolean).join(' · ') || 'NYC area';
        const hours =
          opening.weeklyHours != null ? `${opening.weeklyHours} hrs/wk` : 'hours TBD';
        await notifyUsers({
          userIds: activeRbts.map((r) => r.id),
          title: 'New case opening on job board',
          message: `${opening.caseCode}: ${hours} · ${place}. Check the job board for matches.`,
          type: 'JOB_POSTED',
          linkUrl: '/rbt/job-board',
          // One unread job-board ping is enough while browsing openings
          dedupeHours: 12,
        });
      }
    } catch (notifyErr) {
      console.error(
        'createCaseOpening notify failed:',
        notifyErr instanceof Error ? notifyErr.message : 'Unknown'
      );
    }

    revalidatePath('/', 'layout');
    revalidatePath('/portal-case-coord/openings');
    revalidatePath(`/client/${client.id}`);
    return { success: true, data: opening };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message === 'CLIENT_NOT_FOUND') {
      return { success: false as const, error: 'Client not found.' };
    }
    if (message === CASE_OPENING_STALE || isPrismaWriteConflict(error)) {
      return {
        success: false as const,
        error: 'The client assignment or status changed. Refresh and try again.',
      };
    }
    console.error('Action failed [createCaseOpening]:', message);
    // Surface the real Prisma reason in toast (column missing / unknown arg / etc.)
    const short =
      message.includes('Unknown argument')
        ? 'Database client is out of date — restart CRM after prisma generate, and confirm listing SQL ran.'
        : message.includes('does not exist') || message.includes('column')
          ? 'Missing CaseOpening columns — run the listing enrichment SQL in Supabase.'
          : 'Failed to create case opening.';
    return { success: false, error: short };
  }
}

export async function listCaseOpeningsForCaseCoord() {
  const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
  if (!gate.ok) return { success: false, error: gate.error, openings: [] };

  try {
    const openings = await prisma.caseOpening.findMany({
      where:
        gate.user.role === 'CASE_COORDINATOR'
          ? {
              client: {
                OR: [
                  { caseCoordinatorId: gate.user.id },
                  { caseCoordinatorId: null },
                ],
              },
            }
          : {},
      include: {
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
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        applications: {
          include: {
            rbt: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { success: true, openings };
  } catch (error) {
    console.error('Action failed [listCaseOpeningsForCaseCoord]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to load openings.', openings: [] };
  }
}

function revalidateCaseOpeningSurfaces(clientId?: string | null) {
  revalidatePath('/', 'layout');
  revalidatePath('/portal-case-coord/openings');
  if (clientId) revalidatePath(`/client/${clientId}`);
}

export async function closeCaseOpening(openingId: string) {
  const gate = await requireStaff(CASE_COORD_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    if (!UUID_PATTERN.test(openingId)) {
      return { success: false as const, error: 'Opening not found.' };
    }

    const existing = await prisma.caseOpening.findUnique({
      where: { id: openingId },
      select: {
        clientId: true,
        status: true,
        client: { select: { caseCoordinatorId: true } },
      },
    });
    if (!existing) return { success: false as const, error: 'Opening not found.' };

    const access = await requireClientAccess(existing.clientId);
    if (!access.ok) return { success: false as const, error: access.error };
    const scope = validateOwnedClientScope(
      {
        id: gate.user.id,
        role: gate.user.role,
        isActive: gate.user.isActive !== false,
      },
      existing.client.caseCoordinatorId
    );
    if (!scope.ok) return { success: false as const, error: scope.error };
    if (existing.status !== 'OPEN') {
      return { success: false as const, error: 'Opening is already closed.' };
    }

    const closed = await prisma.caseOpening.updateMany({
      where: {
        id: openingId,
        clientId: existing.clientId,
        status: 'OPEN',
        client: {
          is: { caseCoordinatorId: existing.client.caseCoordinatorId },
        },
      },
      data: { status: 'CLOSED' },
    });
    if (closed.count !== 1) {
      return {
        success: false as const,
        error: 'The opening or client assignment changed. Refresh and try again.',
      };
    }
    revalidateCaseOpeningSurfaces(existing.clientId);
    return { success: true as const };
  } catch (error) {
    console.error('Action failed [closeCaseOpening]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to close opening.' };
  }
}

export async function updateCaseApplicationStatus(
  applicationId: string,
  status: 'MESSAGING' | 'MEET_SCHEDULED' | 'PARENT_PENDING' | 'REJECTED' | 'WITHDRAWN',
  expectedStatus: string,
  extras?: { meetAt?: string | null; meetLink?: string | null; message?: string | null }
) {
  const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    const data: Record<string, unknown> = { status };
    let requestedMeetAt: Date | null | undefined;
    let requestedMeetLink: string | null | undefined;
    if (status === 'MEET_SCHEDULED') {
      requestedMeetAt = extras?.meetAt ? new Date(extras.meetAt) : null;
      if (
        !requestedMeetAt ||
        Number.isNaN(requestedMeetAt.getTime()) ||
        requestedMeetAt.getTime() <= Date.now()
      ) {
        return {
          success: false as const,
          error: 'Choose a valid future date and time for the meet and greet.',
        };
      }
      requestedMeetLink =
        extras?.meetLink?.trim() ||
        `https://meet.jit.si/RAS-Meet-${applicationId.replace(/-/g, '').slice(0, 12)}`;
      data.meetAt = requestedMeetAt;
      data.meetLink = requestedMeetLink;
    } else {
      if (extras?.meetAt !== undefined) {
        requestedMeetAt = extras.meetAt ? new Date(extras.meetAt) : null;
        data.meetAt = requestedMeetAt;
      }
      if (extras?.meetLink !== undefined) {
        requestedMeetLink = extras.meetLink;
        data.meetLink = requestedMeetLink;
      }
    }
    if (extras?.message !== undefined) data.message = extras.message;

    const scopedApp = await prisma.caseApplication.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        opening: {
          select: {
            clientId: true,
            client: { select: { caseCoordinatorId: true } },
          },
        },
      },
    });
    if (!scopedApp) return { success: false as const, error: 'Application not found.' };

    const access = await requireClientAccess(scopedApp.opening.clientId);
    if (!access.ok) return { success: false as const, error: access.error };
    const scope = validateOwnedClientScope(
      {
        id: gate.user.id,
        role: gate.user.role,
        isActive: gate.user.isActive !== false,
      },
      scopedApp.opening.client.caseCoordinatorId
    );
    if (!scope.ok) return { success: false as const, error: scope.error };

    const correlationId = crypto.randomUUID();
    const mutation = await prisma.$transaction(
      async (tx) => {
        const current = await tx.caseApplication.findUnique({
          where: { id: applicationId },
          include: {
            rbt: { select: { id: true, role: true, isActive: true } },
            opening: {
              select: {
                id: true,
                clientId: true,
                caseCode: true,
                status: true,
                client: {
                  select: { caseCoordinatorId: true, status: true },
                },
              },
            },
          },
        });
        if (!current) throw new Error('APPLICATION_NOT_FOUND');

        const currentScope = validateOwnedClientScope(
          {
            id: gate.user.id,
            role: gate.user.role,
            isActive: gate.user.isActive !== false,
          },
          current.opening.client.caseCoordinatorId
        );
        if (!currentScope.ok) return { policyError: currentScope.error } as const;
        if (current.opening.status !== 'OPEN') {
          return { policyError: 'Opening is no longer open.' } as const;
        }
        if (current.opening.client.status === 'DISCHARGED') {
          return {
            policyError: 'Assignment workflow is disabled for discharged clients.',
          } as const;
        }
        const expected = validateExpectedCaseApplicationStatus(
          current.status,
          expectedStatus
        );
        if (!expected.ok) {
          throw new Error(CASE_APPLICATION_STALE);
        }
        const transition = validateCaseApplicationTransition(current.status, status);
        if (!transition.ok) return { policyError: transition.error } as const;

        if (status === 'PARENT_PENDING') {
          const target = validateAssignmentTarget(current.rbt, 'RBT');
          if (!target.ok) return { policyError: target.error } as const;
          const openingClaim = await tx.caseOpening.updateMany({
            where: { id: current.openingId, status: 'OPEN' },
            data: { status: 'OPEN' },
          });
          if (openingClaim.count !== 1) throw new Error(CASE_APPLICATION_STALE);
          const otherSelection = await tx.caseApplication.findFirst({
            where: {
              openingId: current.openingId,
              id: { not: current.id },
              status: 'PARENT_PENDING',
            },
            select: { id: true },
          });
          if (otherSelection) {
            return {
              policyError:
                'Another applicant is already awaiting the parent decision.',
            } as const;
          }
        }

        const updated = await tx.caseApplication.updateMany({
          where: {
            id: current.id,
            openingId: current.openingId,
            status: expectedStatus as CaseApplicationStatus,
          },
          data,
        });
        if (updated.count !== 1) throw new Error(CASE_APPLICATION_STALE);

        if (status === 'PARENT_PENDING') {
          await tx.auditLogVault.create({
            data: buildAssignmentAuditRow({
              actorUserId: gate.user.id,
              action: 'SELECT',
              entityType: 'CASE_APPLICATION_SELECTION',
              entityId: current.id,
              previousId: null,
              nextId: current.rbtUserId,
              source: 'CASE_COORD_MARK_PARENT_PENDING',
              reason: 'Candidate selected for parent decision after meet and greet',
              correlationId,
            }),
          });
        }

        return {
          app: {
            ...current,
            status,
            meetAt:
              requestedMeetAt !== undefined
                ? requestedMeetAt
                : current.meetAt,
            meetLink:
              requestedMeetLink !== undefined
                ? requestedMeetLink
                : current.meetLink,
          },
        } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in mutation) {
      return { success: false as const, error: mutation.policyError };
    }
    const app = mutation.app;

    // Status changes the RBT must act on / know about (actor is staff, recipient is RBT).
    try {
      const { createNotification } = await import('@/app/actions/notifications');
      if (status === 'REJECTED') {
        await createNotification({
          userId: app.rbtUserId,
          title: `Application update · ${app.opening.caseCode}`,
          message: `Your application for ${app.opening.caseCode} was not selected. New openings post to the job board regularly.`,
          type: 'CASE_APPLICATION_REJECTED',
          linkUrl: '/rbt/job-board',
          dedupeHours: 0,
        });
      } else if (status === 'MEET_SCHEDULED' && app.meetAt) {
        await createNotification({
          userId: app.rbtUserId,
          title: `Meet & greet scheduled · ${app.opening.caseCode}`,
          message: `Your meet & greet for ${app.opening.caseCode} is on ${app.meetAt.toLocaleString('en-US', { timeZone: 'America/New_York' })} ET.${app.meetLink ? ` Link: ${app.meetLink}` : ''}`,
          type: 'CASE_MEET_SCHEDULED',
          linkUrl: '/rbt/job-board',
          dedupeHours: 0,
        });
      }
    } catch (notifyErr) {
      console.error(
        'updateCaseApplicationStatus notify failed:',
        notifyErr instanceof Error ? notifyErr.message : 'Unknown'
      );
    }

    revalidateCaseOpeningSurfaces(app.opening.clientId);
    return { success: true as const };
  } catch (error) {
    if (error instanceof Error && error.message === 'APPLICATION_NOT_FOUND') {
      return { success: false as const, error: 'Application not found.' };
    }
    if (
      (error instanceof Error && error.message === CASE_APPLICATION_STALE) ||
      isPrismaWriteConflict(error)
    ) {
      return {
        success: false as const,
        error: 'The application changed in another session. Refresh and try again.',
      };
    }
    console.error('Action failed [updateCaseApplicationStatus]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to update application.' };
  }
}

export async function sendApplicationStaffMessage(applicationId: string, content: string) {
  try {
    const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };

    const trimmed = content.trim();
    if (!trimmed) return { success: false, error: 'Message cannot be empty.' };
    if (!UUID_PATTERN.test(applicationId) || trimmed.length > 5_000) {
      return { success: false, error: 'Invalid message request.' };
    }

    const app = await prisma.caseApplication.findUnique({
      where: { id: applicationId },
      include: {
        opening: {
          include: { client: { select: { caseCoordinatorId: true } } },
        },
      },
    });
    if (!app) return { success: false, error: 'Application not found.' };

    const access = await requireClientAccess(app.opening.clientId);
    if (!access.ok) return { success: false, error: access.error };
    const scope = validateOwnedClientScope(
      {
        id: gate.user.id,
        role: gate.user.role,
        isActive: gate.user.isActive !== false,
      },
      app.opening.client.caseCoordinatorId
    );
    if (!scope.ok) return { success: false, error: scope.error };

    const senderId = gate.user.id;
    if (!UUID_PATTERN.test(senderId)) {
      return {
        success: false,
        error: 'A persisted signed-in staff account is required to send this message.',
      };
    }

    await prisma.staffMessage.create({
      data: {
        senderId,
        receiverId: app.rbtUserId,
        content: `[${app.opening.caseCode}] ${trimmed}`,
      },
    });

    if (app.status === 'APPLIED') {
      await prisma.caseApplication.update({
        where: { id: applicationId },
        data: { status: 'MESSAGING' },
      });
    }

    revalidateCaseOpeningSurfaces(app.opening.clientId);
    return { success: true };
  } catch (error) {
    console.error('Action failed [sendApplicationStaffMessage]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to send message.' };
  }
}

export async function sendParentCaseMessage(clientId: string, content: string) {
  try {
    // Staff (case coord surface) — parents use sendClientMessage instead.
    const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
    if (!gate.ok) return { success: false, error: gate.error };

    const trimmed = content.trim();
    if (!trimmed) return { success: false, error: 'Message cannot be empty.' };
    if (!UUID_PATTERN.test(clientId) || trimmed.length > 5_000) {
      return { success: false, error: 'Invalid message request.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) return { success: false, error: access.error };
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { caseCoordinatorId: true },
    });
    if (!client) return { success: false, error: 'Client not found.' };
    const scope = validateOwnedClientScope(
      {
        id: gate.user.id,
        role: gate.user.role,
        isActive: gate.user.isActive !== false,
      },
      client.caseCoordinatorId
    );
    if (!scope.ok) return { success: false, error: scope.error };

    await prisma.clientMessage.create({
      data: {
        clientId,
        content: trimmed,
        isFromClient: false,
        senderName: 'Case Coordinator',
      },
    });

    revalidatePath(`/client/${clientId}`);
    revalidatePath('/portal-case-coord/openings');
    return { success: true };
  } catch (error) {
    console.error('Action failed [sendParentCaseMessage]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to message parent.' };
  }
}

export async function getApplicationThread(applicationId: string) {
  try {
    const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
    if (!gate.ok) return { success: false, error: gate.error, messages: [], parentMessages: [] };
    if (!UUID_PATTERN.test(applicationId)) {
      return { success: false, error: 'Not found.', messages: [], parentMessages: [] };
    }

    const app = await prisma.caseApplication.findUnique({
      where: { id: applicationId },
      include: {
        rbt: { select: { id: true, firstName: true, lastName: true } },
        opening: {
          select: {
            caseCode: true,
            clientId: true,
            client: { select: { caseCoordinatorId: true } },
          },
        },
      },
    });
    if (!app) return { success: false, error: 'Not found.', messages: [], parentMessages: [] };

    const access = await requireClientAccess(app.opening.clientId);
    if (!access.ok) {
      return { success: false, error: access.error, messages: [], parentMessages: [] };
    }
    const scope = validateOwnedClientScope(
      {
        id: gate.user.id,
        role: gate.user.role,
        isActive: gate.user.isActive !== false,
      },
      app.opening.client.caseCoordinatorId
    );
    if (!scope.ok) {
      return { success: false, error: scope.error, messages: [], parentMessages: [] };
    }

    const messages = await prisma.staffMessage.findMany({
      where: {
        OR: [
          { senderId: gate.user.id, receiverId: app.rbtUserId },
          { senderId: app.rbtUserId, receiverId: gate.user.id },
        ],
        content: { contains: `[${app.opening.caseCode}]` },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    const parentMessages = await prisma.clientMessage.findMany({
      where: { clientId: app.opening.clientId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      success: true,
      messages,
      parentMessages: parentMessages.reverse(),
      application: app,
    };
  } catch (error) {
    console.error('Action failed [getApplicationThread]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false, error: 'Failed to load thread.', messages: [], parentMessages: [] };
  }
}

type ParentDecisionEvidence =
  | 'VERBAL_CONFIRMATION_RECORDED'
  | 'SECURE_MESSAGE_CONFIRMATION'
  | 'SIGNED_FORM_CONFIRMATION';

type ParentDecisionInput = {
  applicationId: string;
  expectedApplicationStatus: string;
  expectedOpeningStatus: string;
  expectedClientRbtId: string | null;
  expectedRbtApproved: boolean;
  decisionEvidence: ParentDecisionEvidence;
};

/** Staff-recorded parent accept. Assigns the selected RBT but never sets ACTIVE. */
export async function recordParentApplicationAcceptance(input: ParentDecisionInput) {
  const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    if (
      !input ||
      !UUID_PATTERN.test(input.applicationId) ||
      ![
        'VERBAL_CONFIRMATION_RECORDED',
        'SECURE_MESSAGE_CONFIRMATION',
        'SIGNED_FORM_CONFIRMATION',
      ].includes(input.decisionEvidence)
    ) {
      return { success: false as const, error: 'Invalid parent-decision request.' };
    }

    const scopedApp = await prisma.caseApplication.findUnique({
      where: { id: input.applicationId },
      select: {
        opening: {
          select: {
            clientId: true,
            client: { select: { caseCoordinatorId: true } },
          },
        },
      },
    });
    if (!scopedApp) return { success: false as const, error: 'Application not found.' };

    const access = await requireClientAccess(scopedApp.opening.clientId);
    if (!access.ok) return { success: false as const, error: access.error };
    const scope = validateOwnedClientScope(
      {
        id: gate.user.id,
        role: gate.user.role,
        isActive: gate.user.isActive !== false,
      },
      scopedApp.opening.client.caseCoordinatorId
    );
    if (!scope.ok) return { success: false as const, error: scope.error };

    const correlationId = crypto.randomUUID();
    const mutation = await prisma.$transaction(
      async (tx) => {
        const current = await tx.caseApplication.findUnique({
          where: { id: input.applicationId },
          include: {
            rbt: { select: { id: true, role: true, isActive: true } },
            opening: {
              include: {
                client: {
                  select: {
                    id: true,
                    status: true,
                    rbtId: true,
                    rbtApproved: true,
                    caseCoordinatorId: true,
                  },
                },
              },
            },
          },
        });
        if (!current) throw new Error('APPLICATION_NOT_FOUND');

        const currentScope = validateOwnedClientScope(
          {
            id: gate.user.id,
            role: gate.user.role,
            isActive: gate.user.isActive !== false,
          },
          current.opening.client.caseCoordinatorId
        );
        if (!currentScope.ok) return { policyError: currentScope.error } as const;
        const target = validateAssignmentTarget(current.rbt, 'RBT');
        if (!target.ok) return { policyError: target.error } as const;
        if (
          current.opening.client.status !== 'STAFFING_PENDING' &&
          current.opening.client.status !== 'ACTIVE'
        ) {
          return {
            policyError: `RBT acceptance is not allowed while the client is ${current.opening.client.status}.`,
          } as const;
        }

        if (
          isIdempotentParentAcceptance({
            applicationStatus: current.status,
            openingStatus: current.opening.status,
            clientRbtId: current.opening.client.rbtId,
            applicantRbtId: current.rbtUserId,
            rbtApproved: current.opening.client.rbtApproved,
          })
        ) {
          return {
            alreadyApplied: true,
            app: current,
            autoRejected: [] as Array<{ rbtUserId: string }>,
          } as const;
        }

        const policy = validateAssignmentRequest({
          actor: {
            id: gate.user.id,
            role: gate.user.role,
            isActive: gate.user.isActive !== false,
          },
          allowedActorRoles: CASE_OPENING_MANAGER_ROLES,
          clientAccessGranted: true,
          requireOwnedClient: true,
          clientCaseCoordinatorId: current.opening.client.caseCoordinatorId,
          target: current.rbt,
          targetRole: 'RBT',
          currentAssignmentId: current.opening.client.rbtId,
          expectedAssignmentId: input.expectedClientRbtId,
          clientStatus: current.opening.client.status,
          allowedClientStatuses: ['STAFFING_PENDING', 'ACTIVE'],
        });
        if (!policy.ok) return { policyError: policy.error } as const;
        if (
          current.status !== input.expectedApplicationStatus ||
          current.status !== 'PARENT_PENDING' ||
          current.opening.status !== input.expectedOpeningStatus ||
          current.opening.status !== 'OPEN' ||
          current.opening.client.rbtApproved !== input.expectedRbtApproved
        ) {
          throw new Error(PARENT_DECISION_STALE);
        }

        const autoRejected = await tx.caseApplication.findMany({
          where: {
            openingId: current.openingId,
            id: { not: current.id },
            status: {
              in: ['APPLIED', 'MESSAGING', 'MEET_SCHEDULED', 'PARENT_PENDING'],
            },
          },
          select: { rbtUserId: true },
        });

        const clientUpdated = await tx.client.updateMany({
          where: {
            id: current.opening.client.id,
            status: { in: ['STAFFING_PENDING', 'ACTIVE'] },
            rbtId: input.expectedClientRbtId,
            rbtApproved: input.expectedRbtApproved,
            caseCoordinatorId: current.opening.client.caseCoordinatorId,
          },
          data: { rbtId: current.rbtUserId, rbtApproved: true },
        });
        const appUpdated = await tx.caseApplication.updateMany({
          where: {
            id: current.id,
            openingId: current.openingId,
            status: 'PARENT_PENDING',
          },
          data: { status: 'APPROVED', parentDecisionAt: new Date() },
        });
        const openingUpdated = await tx.caseOpening.updateMany({
          where: { id: current.openingId, status: 'OPEN' },
          data: { status: 'FILLED' },
        });
        if (
          clientUpdated.count !== 1 ||
          appUpdated.count !== 1 ||
          openingUpdated.count !== 1
        ) {
          throw new Error(PARENT_DECISION_STALE);
        }

        await tx.caseApplication.updateMany({
          where: {
            openingId: current.openingId,
            id: { not: current.id },
            status: {
              in: ['APPLIED', 'MESSAGING', 'MEET_SCHEDULED', 'PARENT_PENDING'],
            },
          },
          data: { status: 'REJECTED' },
        });
        await tx.auditLogVault.createMany({
          data: [
            buildAssignmentAuditRow({
              actorUserId: gate.user.id,
              action: 'ASSIGN',
              entityType: 'CLIENT_RBT_ASSIGNMENT',
              entityId: current.opening.client.id,
              previousId: current.opening.client.rbtId,
              nextId: current.rbtUserId,
              source: 'CASE_OPENING_PARENT_ACCEPT',
              reason: `Parent decision evidence: ${input.decisionEvidence}`,
              correlationId,
            }),
            buildAssignmentAuditRow({
              actorUserId: gate.user.id,
              action: 'ACCEPT',
              entityType: 'CASE_APPLICATION_PARENT_DECISION',
              entityId: current.id,
              previousId: current.opening.client.rbtId,
              nextId: current.rbtUserId,
              source: 'CASE_OPENING_PARENT_ACCEPT',
              reason: `Parent decision evidence: ${input.decisionEvidence}`,
              correlationId,
            }),
          ],
        });

        return { alreadyApplied: false, app: current, autoRejected } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in mutation) {
      return { success: false as const, error: mutation.policyError };
    }

    const app = mutation.app;
    const autoRejected = mutation.autoRejected;

    // Tell persisted recipients only after the transaction commits.
    if (!mutation.alreadyApplied) {
      try {
        const { createNotification, notifyUsers } = await import('@/app/actions/notifications');
        await createNotification({
          userId: app.rbtUserId,
          title: `You got the case · ${app.opening.caseCode}`,
          message: `The family accepted you for ${app.opening.caseCode}. Case Coordination will schedule your first session.`,
          type: 'CASE_APPLICATION_ACCEPTED',
          linkUrl: '/rbt/job-board',
          dedupeHours: 0,
        });
        await notifyUsers({
          userIds: autoRejected
            .map((candidate) => candidate.rbtUserId)
            .filter((id) => id !== app.rbtUserId),
          title: `Application update · ${app.opening.caseCode}`,
          message: `${app.opening.caseCode} was filled by another applicant. New openings post to the job board regularly.`,
          type: 'CASE_APPLICATION_REJECTED',
          linkUrl: '/rbt/job-board',
          dedupeHours: 0,
        });
      } catch (notifyErr) {
        console.error(
          'recordParentApplicationAcceptance notify failed:',
          notifyErr instanceof Error ? notifyErr.message : 'Unknown'
        );
      }
    }

    revalidateCaseOpeningSurfaces(app.opening.client.id);
    return {
      success: true as const,
      activated: false as const,
      alreadyApplied: mutation.alreadyApplied,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'APPLICATION_NOT_FOUND') {
      return { success: false as const, error: 'Application not found.' };
    }
    if (
      (error instanceof Error && error.message === PARENT_DECISION_STALE) ||
      isPrismaWriteConflict(error)
    ) {
      return {
        success: false as const,
        error: 'The application, opening, or client assignment changed. Refresh and try again.',
      };
    }
    console.error('Action failed [recordParentApplicationAcceptance]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false as const, error: 'Failed to accept applicant.' };
  }
}

/** Parent declined — reject app, keep opening OPEN for next RBT. */
export async function recordParentApplicationDecline(input: ParentDecisionInput) {
  const gate = await requireStaff(CASE_OPENING_MANAGER_ROLES);
  if (!gate.ok) return { success: false as const, error: gate.error };

  try {
    if (
      !input ||
      !UUID_PATTERN.test(input.applicationId) ||
      ![
        'VERBAL_CONFIRMATION_RECORDED',
        'SECURE_MESSAGE_CONFIRMATION',
        'SIGNED_FORM_CONFIRMATION',
      ].includes(input.decisionEvidence)
    ) {
      return { success: false as const, error: 'Invalid parent-decision request.' };
    }

    const scopedApp = await prisma.caseApplication.findUnique({
      where: { id: input.applicationId },
      select: {
        opening: {
          select: {
            clientId: true,
            client: { select: { caseCoordinatorId: true } },
          },
        },
      },
    });
    if (!scopedApp) return { success: false as const, error: 'Application not found.' };

    const access = await requireClientAccess(scopedApp.opening.clientId);
    if (!access.ok) return { success: false as const, error: access.error };
    const scope = validateOwnedClientScope(
      {
        id: gate.user.id,
        role: gate.user.role,
        isActive: gate.user.isActive !== false,
      },
      scopedApp.opening.client.caseCoordinatorId
    );
    if (!scope.ok) return { success: false as const, error: scope.error };

    const correlationId = crypto.randomUUID();
    const mutation = await prisma.$transaction(
      async (tx) => {
        const current = await tx.caseApplication.findUnique({
          where: { id: input.applicationId },
          include: {
            rbt: { select: { id: true, role: true, isActive: true } },
            opening: {
              include: {
                client: {
                  select: {
                    id: true,
                    status: true,
                    rbtId: true,
                    rbtApproved: true,
                    caseCoordinatorId: true,
                  },
                },
              },
            },
          },
        });
        if (!current) throw new Error('APPLICATION_NOT_FOUND');

        const currentScope = validateOwnedClientScope(
          {
            id: gate.user.id,
            role: gate.user.role,
            isActive: gate.user.isActive !== false,
          },
          current.opening.client.caseCoordinatorId
        );
        if (!currentScope.ok) return { policyError: currentScope.error } as const;
        const target = validateAssignmentTarget(current.rbt, 'RBT');
        if (!target.ok) return { policyError: target.error } as const;

        if (
          current.status === 'REJECTED' &&
          current.opening.status === 'OPEN' &&
          current.opening.client.rbtId !== current.rbtUserId
        ) {
          return { alreadyApplied: true, app: current, assignmentCleared: false } as const;
        }

        const policy = validateAssignmentRequest({
          actor: {
            id: gate.user.id,
            role: gate.user.role,
            isActive: gate.user.isActive !== false,
          },
          allowedActorRoles: CASE_OPENING_MANAGER_ROLES,
          clientAccessGranted: true,
          requireOwnedClient: true,
          clientCaseCoordinatorId: current.opening.client.caseCoordinatorId,
          target: current.rbt,
          targetRole: 'RBT',
          currentAssignmentId: current.opening.client.rbtId,
          expectedAssignmentId: input.expectedClientRbtId,
          clientStatus: current.opening.client.status,
          allowedClientStatuses: ['STAFFING_PENDING', 'ACTIVE'],
        });
        if (!policy.ok) return { policyError: policy.error } as const;
        if (
          current.status !== input.expectedApplicationStatus ||
          !['PARENT_PENDING', 'APPROVED'].includes(current.status) ||
          current.opening.status !== input.expectedOpeningStatus ||
          !['OPEN', 'FILLED'].includes(current.opening.status) ||
          current.opening.client.rbtApproved !== input.expectedRbtApproved
        ) {
          throw new Error(PARENT_DECISION_STALE);
        }

        const appUpdated = await tx.caseApplication.updateMany({
          where: {
            id: current.id,
            openingId: current.openingId,
            status: input.expectedApplicationStatus,
          },
          data: { status: 'REJECTED', parentDecisionAt: new Date() },
        });
        const openingUpdated = await tx.caseOpening.updateMany({
          where: {
            id: current.openingId,
            status: input.expectedOpeningStatus as 'OPEN' | 'FILLED' | 'CLOSED',
          },
          data: { status: 'OPEN' },
        });
        if (appUpdated.count !== 1 || openingUpdated.count !== 1) {
          throw new Error(PARENT_DECISION_STALE);
        }

        let assignmentCleared = false;
        if (current.opening.client.rbtId === current.rbtUserId) {
          const cleared = await tx.client.updateMany({
            where: {
              id: current.opening.client.id,
              status: { in: ['STAFFING_PENDING', 'ACTIVE'] },
              rbtId: input.expectedClientRbtId,
              rbtApproved: input.expectedRbtApproved,
              caseCoordinatorId: current.opening.client.caseCoordinatorId,
            },
            data: { rbtId: null, rbtApproved: false },
          });
          if (cleared.count !== 1) throw new Error(PARENT_DECISION_STALE);
          assignmentCleared = true;
        }

        const auditRows = [
          buildAssignmentAuditRow({
            actorUserId: gate.user.id,
            action: 'DECLINE',
            entityType: 'CASE_APPLICATION_PARENT_DECISION',
            entityId: current.id,
            previousId: current.rbtUserId,
            nextId: null,
            source: 'CASE_OPENING_PARENT_DECLINE',
            reason: `Parent decision evidence: ${input.decisionEvidence}`,
            correlationId,
          }),
        ];
        if (assignmentCleared) {
          auditRows.push(
            buildAssignmentAuditRow({
              actorUserId: gate.user.id,
              action: 'UNASSIGN',
              entityType: 'CLIENT_RBT_ASSIGNMENT',
              entityId: current.opening.client.id,
              previousId: current.rbtUserId,
              nextId: null,
              source: 'CASE_OPENING_PARENT_DECLINE',
              reason: `Parent decision evidence: ${input.decisionEvidence}`,
              correlationId,
            })
          );
        }
        await tx.auditLogVault.createMany({ data: auditRows });

        return { alreadyApplied: false, app: current, assignmentCleared } as const;
      },
      { isolationLevel: 'Serializable' }
    );
    if ('policyError' in mutation) {
      return { success: false as const, error: mutation.policyError };
    }

    const app = mutation.app;

    // CASE_APPLICATION_REJECTED → applicant RBT (parent declined; opening stays OPEN)
    if (!mutation.alreadyApplied) {
      try {
        const { createNotification } = await import('@/app/actions/notifications');
        await createNotification({
          userId: app.rbtUserId,
          title: `Application update · ${app.opening.caseCode}`,
          message: `Your application for ${app.opening.caseCode} was not selected. New openings post to the job board regularly.`,
          type: 'CASE_APPLICATION_REJECTED',
          linkUrl: '/rbt/job-board',
          dedupeHours: 0,
        });
      } catch (notifyErr) {
        console.error(
          'recordParentApplicationDecline notify failed:',
          notifyErr instanceof Error ? notifyErr.message : 'Unknown'
        );
      }
    }

    revalidateCaseOpeningSurfaces(app.opening.clientId);
    return {
      success: true as const,
      alreadyApplied: mutation.alreadyApplied,
      assignmentCleared: mutation.assignmentCleared,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'APPLICATION_NOT_FOUND') {
      return { success: false as const, error: 'Application not found.' };
    }
    if (
      (error instanceof Error && error.message === PARENT_DECISION_STALE) ||
      isPrismaWriteConflict(error)
    ) {
      return {
        success: false as const,
        error: 'The application, opening, or client assignment changed. Refresh and try again.',
      };
    }
    console.error('Action failed [recordParentApplicationDecline]:', error instanceof Error ? error.message : 'Unknown error');
    return { success: false as const, error: 'Failed to decline applicant.' };
  }
}
