'use server';

/**
 * Sandbox pilot cohort membership — tag pretend clients for QA filtering.
 */

import type { DualRunMode, Role } from '@repo/db';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth-guard';

const COHORT_OPS_ROLES: readonly Role[] = [
  'CEO',
  'OPS_DIRECTOR',
  'CLINICAL_DIRECTOR',
  'BILLING',
];

const COHORT_LABEL_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export type DualRunCohortSummary = {
  cohort: string;
  clientCount: number;
  modes: Partial<Record<DualRunMode, number>>;
};

export type DualRunCohortClientRow = {
  id: string;
  name: string;
  status: string;
  dualRunCohort: string | null;
  dualRunMode: DualRunMode | null;
};

function normalizeCohortLabel(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  if (!COHORT_LABEL_RE.test(trimmed)) return null;
  return trimmed;
}

function fullName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
}

/** Distinct cohort labels currently assigned on clients. */
export async function listDualRunCohorts(): Promise<
  | { success: true; cohorts: DualRunCohortSummary[] }
  | { success: false; error: string; cohorts: DualRunCohortSummary[] }
> {
  const gate = await requireStaff(COHORT_OPS_ROLES);
  if (!gate.ok) return { success: false, error: gate.error, cohorts: [] };

  try {
    const rows = await prisma.client.findMany({
      where: { dualRunCohort: { not: null } },
      select: { dualRunCohort: true, dualRunMode: true },
    });

    const byCohort = new Map<string, DualRunCohortSummary>();
    for (const row of rows) {
      const cohort = row.dualRunCohort;
      if (!cohort) continue;
      const entry =
        byCohort.get(cohort) ??
        ({ cohort, clientCount: 0, modes: {} } satisfies DualRunCohortSummary);
      entry.clientCount += 1;
      if (row.dualRunMode) {
        entry.modes[row.dualRunMode] = (entry.modes[row.dualRunMode] ?? 0) + 1;
      }
      byCohort.set(cohort, entry);
    }

    const cohorts = [...byCohort.values()].sort((a, b) =>
      a.cohort.localeCompare(b.cohort),
    );
    return { success: true, cohorts };
  } catch (error) {
    console.error(
      'listDualRunCohorts failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return {
      success: false,
      error: 'Failed to load sandbox cohorts.',
      cohorts: [],
    };
  }
}

/** Clients in a cohort (or all cohort-tagged clients when cohort omitted). */
export async function listDualRunCohortClients(cohort?: string): Promise<
  | { success: true; clients: DualRunCohortClientRow[] }
  | { success: false; error: string; clients: DualRunCohortClientRow[] }
> {
  const gate = await requireStaff(COHORT_OPS_ROLES);
  if (!gate.ok) return { success: false, error: gate.error, clients: [] };

  const normalized = cohort ? normalizeCohortLabel(cohort) : null;
  if (cohort && !normalized) {
    return {
      success: false,
      error: 'Invalid cohort label — use letters, numbers, dash, underscore (max 64).',
      clients: [],
    };
  }

  try {
    const clients = await prisma.client.findMany({
      where: normalized
        ? { dualRunCohort: normalized }
        : { dualRunCohort: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        dualRunCohort: true,
        dualRunMode: true,
      },
      orderBy: [{ dualRunCohort: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      take: 200,
    });

    return {
      success: true,
      clients: clients.map((c) => ({
        id: c.id,
        name: fullName(c.firstName, c.lastName),
        status: c.status,
        dualRunCohort: c.dualRunCohort,
        dualRunMode: c.dualRunMode,
      })),
    };
  } catch (error) {
    console.error(
      'listDualRunCohortClients failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return {
      success: false,
      error: 'Failed to load cohort clients.',
      clients: [],
    };
  }
}

/** Assign or clear dual-run cohort membership on one client. */
export async function setClientDualRunCohort(
  clientId: string,
  cohort: string | null,
  mode: DualRunMode | null,
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireStaff(COHORT_OPS_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const normalizedCohort = normalizeCohortLabel(cohort);
  if (cohort && !normalizedCohort) {
    return {
      success: false,
      error: 'Invalid cohort label — use letters, numbers, dash, underscore (max 64).',
    };
  }
  if (normalizedCohort && !mode) {
    return {
      success: false,
      error: 'Select a pilot phase (Sandbox / Cutover ready / Live) when assigning a cohort.',
    };
  }
  if (!normalizedCohort && mode) {
    return {
      success: false,
      error: 'Clear the cohort label to remove pilot phase.',
    };
  }

  try {
    const updated = await prisma.client.updateMany({
      where: { id: clientId },
      data: {
        dualRunCohort: normalizedCohort,
        dualRunMode: normalizedCohort ? mode : null,
      },
    });
    if (updated.count === 0) {
      return { success: false, error: 'Client not found.' };
    }

    revalidatePath(`/client/${clientId}`);
    return { success: true };
  } catch (error) {
    console.error(
      'setClientDualRunCohort failed:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return { success: false, error: 'Failed to update cohort membership.' };
  }
}
