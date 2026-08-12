'use server';

/**
 * Dual-run billing audit worksheet actions (cutover checklist gate 10 —
 * "≥10 cohort notes pass internal checklist").
 *
 * Lists fully signed SessionNotes with every claim-critical field so
 * Billing/Clinical can reconcile them side-by-side against Artemis exports,
 * and persists a per-note "audited / discrepancy" marker.
 *
 * Persistence choice: markers are append-only `AuditLogVault` EDIT rows
 * (`metadata.dualRunAudit`) — no schema change, and the marker history
 * (who/when/what) IS the audit trail the ≥10-note gate wants. Latest row per
 * note wins; a CLEARED row resets the marker.
 */

import type { Prisma, Role } from '@repo/db';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/auth-guard';
import { writeAuditLog } from '@/lib/auditLog';
import {
  checklistPassedFromSnapshot,
  failedChecklistLabels,
} from '@/lib/noteConvertGate';
import {
  clinicDateKey,
  clinicWallTimeToDate,
} from '@/lib/clinicTimezone';

/** Who may run the dual-run audit: Billing + Finance + clinical leadership. */
const DUAL_RUN_AUDIT_ROLES: readonly Role[] = [
  'CEO',
  'CLINICAL_DIRECTOR',
  'BILLING',
  'FINANCE',
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DualRunAuditMark = 'AUDITED' | 'DISCREPANCY';

export type DualRunAuditMarker = {
  mark: DualRunAuditMark | null;
  note: string | null;
  markedByName: string | null;
  markedAt: string | null; // ISO
};

export type DualRunAuditRow = {
  noteId: string;
  clientId: string | null;
  clientName: string;
  /** Date of service — clinic-TZ calendar day (YYYY-MM-DD). */
  dosDateKey: string | null;
  /** DOS instant (actualStart ?? scheduledStart), ISO. */
  dosIso: string | null;
  cptCode: string | null;
  billableUnits: number | null;
  durationMinutes: number;
  rbtName: string | null;
  rbtSignerName: string | null;
  rbtSignedAt: string | null; // ISO
  bcbaName: string | null;
  bcbaSignerName: string | null;
  bcbaSignedAt: string | null; // ISO
  plutusClaimRef: string | null;
  isConverted: boolean;
  convertedAt: string | null; // ISO
  checklist: 'PASS' | 'FAIL' | 'MISSING';
  failedChecklistItems: string[];
  audit: DualRunAuditMarker;
};

export type DualRunAuditClientOption = {
  id: string;
  name: string;
};

export type ListDualRunAuditResult =
  | {
      success: true;
      rows: DualRunAuditRow[];
      clients: DualRunAuditClientOption[];
    }
  | {
      success: false;
      error: string;
      rows: DualRunAuditRow[];
      clients: DualRunAuditClientOption[];
    };

/** Parse "YYYY-MM-DD" as a clinic-TZ day boundary (start or end of day). */
function parseClinicDate(value: string, boundary: 'start' | 'end'): Date | null {
  const m = DATE_ONLY_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date =
    boundary === 'start'
      ? clinicWallTimeToDate(Number(y), Number(mo), Number(d))
      : clinicWallTimeToDate(Number(y), Number(mo), Number(d), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

function fullName(
  user: { firstName: string | null; lastName: string | null } | null | undefined
): string | null {
  if (!user) return null;
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
}

/**
 * List fully signed notes (rbtSigned && bcbaSigned) whose DOS falls inside the
 * clinic-TZ date range, with the latest audit marker per note.
 */
export async function listDualRunAuditNotes(input: {
  from: string; // YYYY-MM-DD (clinic TZ)
  to: string; // YYYY-MM-DD (clinic TZ)
  clientId?: string;
}): Promise<ListDualRunAuditResult> {
  const gate = await requireStaff(DUAL_RUN_AUDIT_ROLES);
  if (!gate.ok) return { success: false, error: gate.error, rows: [], clients: [] };

  const fromDate = parseClinicDate(input.from, 'start');
  const toDate = parseClinicDate(input.to, 'end');
  if (!fromDate || !toDate) {
    return {
      success: false,
      error: 'Invalid date range — use YYYY-MM-DD for both dates.',
      rows: [],
      clients: [],
    };
  }
  if (fromDate.getTime() > toDate.getTime()) {
    return {
      success: false,
      error: 'Date range is inverted — "from" must be on or before "to".',
      rows: [],
      clients: [],
    };
  }

  try {
    // DOS = actualStart when present, else scheduledStart.
    const dosRange = {
      OR: [
        { actualStart: { gte: fromDate, lte: toDate } },
        { actualStart: null, scheduledStart: { gte: fromDate, lte: toDate } },
      ],
      ...(input.clientId ? { clientId: input.clientId } : {}),
    };

    const [notes, clients] = await Promise.all([
      prisma.sessionNote.findMany({
        where: {
          rbtSigned: true,
          bcbaSigned: true,
          session: dosRange,
        },
        include: {
          session: {
            select: {
              id: true,
              clientId: true,
              cptCode: true,
              scheduledStart: true,
              scheduledEnd: true,
              actualStart: true,
              actualEnd: true,
              client: { select: { id: true, firstName: true, lastName: true } },
              rbt: { select: { firstName: true, lastName: true } },
              bcba: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [{ session: { scheduledStart: 'asc' } }],
        take: 500,
      }),
      prisma.client.findMany({
        where: {
          sessions: { some: { note: { rbtSigned: true, bcbaSigned: true } } },
        },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    // Latest dual-run marker per note from the append-only vault.
    const noteIds = notes.map((n) => n.id);
    const markerByNoteId = new Map<string, DualRunAuditMarker>();
    if (noteIds.length > 0) {
      const vaultRows = await prisma.auditLogVault.findMany({
        where: {
          resourceType: 'SESSION_NOTE',
          action: 'EDIT',
          resourceId: { in: noteIds },
        },
        orderBy: { timestamp: 'asc' },
        select: { resourceId: true, metadata: true, timestamp: true },
      });
      for (const row of vaultRows) {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        const mark = meta.dualRunAudit;
        if (mark !== 'AUDITED' && mark !== 'DISCREPANCY' && mark !== 'CLEARED') {
          continue; // unrelated EDIT entry
        }
        markerByNoteId.set(row.resourceId, {
          mark: mark === 'CLEARED' ? null : mark,
          note:
            typeof meta.auditNote === 'string' && meta.auditNote ? meta.auditNote : null,
          markedByName:
            typeof meta.markedByName === 'string' && meta.markedByName
              ? meta.markedByName
              : null,
          markedAt: row.timestamp.toISOString(),
        });
      }
    }

    const rows: DualRunAuditRow[] = notes.map((note) => {
      const s = note.session;
      const dos = s?.actualStart ?? s?.scheduledStart ?? null;
      const start = s?.actualStart ?? s?.scheduledStart;
      const end = s?.actualEnd ?? s?.scheduledEnd;
      const durationMinutes =
        start && end
          ? Math.max(
              0,
              Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
            )
          : 0;

      const passed = checklistPassedFromSnapshot(note.checklistSnapshot);
      const checklist: DualRunAuditRow['checklist'] =
        passed === null ? 'MISSING' : passed ? 'PASS' : 'FAIL';

      return {
        noteId: note.id,
        clientId: s?.client?.id ?? null,
        clientName: fullName(s?.client) ?? 'Unknown client',
        dosDateKey: dos ? clinicDateKey(dos) : null,
        dosIso: iso(dos),
        cptCode: s?.cptCode ?? null,
        billableUnits: note.billableUnits,
        durationMinutes,
        rbtName: fullName(s?.rbt),
        rbtSignerName: note.rbtSignerName,
        rbtSignedAt: iso(note.rbtSignedAt),
        bcbaName: fullName(s?.bcba),
        bcbaSignerName: note.bcbaSignerName,
        bcbaSignedAt: iso(note.bcbaSignedAt),
        plutusClaimRef: note.plutusClaimRef,
        isConverted: note.isConverted,
        convertedAt: iso(note.convertedAt),
        checklist,
        failedChecklistItems:
          checklist === 'FAIL' ? failedChecklistLabels(note.checklistSnapshot) : [],
        audit:
          markerByNoteId.get(note.id) ?? {
            mark: null,
            note: null,
            markedByName: null,
            markedAt: null,
          },
      };
    });

    // PHI-safe breadcrumb (ids/counts only) — worksheet views are auditable too.
    void writeAuditLog({
      actorUserId: gate.user.id,
      action: 'VIEW',
      entityType: 'DUAL_RUN_AUDIT',
      entityId: `${input.from}..${input.to}`,
      meta: { noteCount: rows.length, clientFilter: input.clientId ?? null },
    });

    return {
      success: true,
      rows,
      clients: clients.map((c) => ({
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.id,
      })),
    };
  } catch (error) {
    console.error(
      'listDualRunAuditNotes failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false,
      error: 'Failed to load audit worksheet. Please try again.',
      rows: [],
      clients: [],
    };
  }
}

/**
 * Persist an audit marker for one note as an AuditLogVault EDIT row.
 * `mark: null` clears the marker (writes a CLEARED row — history stays).
 * Written with a direct create (not fire-and-forget) so failures surface in the UI.
 */
export async function setDualRunAuditMark(
  noteId: string,
  mark: DualRunAuditMark | null,
  note?: string
): Promise<
  | { success: true; marker: DualRunAuditMarker }
  | { success: false; error: string }
> {
  const gate = await requireStaff(DUAL_RUN_AUDIT_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  const trimmedNote = (note ?? '').trim().slice(0, 500);
  if (mark === 'DISCREPANCY' && !trimmedNote) {
    return {
      success: false,
      error: 'Describe the discrepancy (what differs vs Artemis) before flagging.',
    };
  }

  try {
    const exists = await prisma.sessionNote.findUnique({
      where: { id: noteId },
      select: { id: true, rbtSigned: true, bcbaSigned: true },
    });
    if (!exists) return { success: false, error: 'Session note not found.' };
    if (!exists.rbtSigned || !exists.bcbaSigned) {
      return {
        success: false,
        error: 'Only fully signed notes (RBT + BCBA) can be audited.',
      };
    }

    const actorId = gate.user.id;
    const actorIsUuid = UUID_RE.test(actorId);
    const markedByName =
      [gate.user.firstName, gate.user.lastName].filter(Boolean).join(' ') ||
      gate.user.email ||
      'Staff';

    const row = await prisma.auditLogVault.create({
      data: {
        userId: actorIsUuid ? actorId : null,
        action: 'EDIT',
        resourceType: 'SESSION_NOTE',
        resourceId: noteId,
        metadata: {
          dualRunAudit: mark ?? 'CLEARED',
          ...(trimmedNote ? { auditNote: trimmedNote } : {}),
          markedByName,
          ...(!actorIsUuid ? { actorLabel: actorId } : {}),
        } as Prisma.InputJsonValue,
      },
      select: { timestamp: true },
    });

    revalidatePath('/portal-billing/audit');

    return {
      success: true,
      marker: {
        mark,
        note: trimmedNote || null,
        markedByName,
        markedAt: row.timestamp.toISOString(),
      },
    };
  } catch (error) {
    console.error(
      'setDualRunAuditMark failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false, error: 'Failed to save audit marker. Please try again.' };
  }
}

/** Fire-and-forget EXPORT breadcrumb when the CSV is generated client-side. */
export async function logDualRunAuditExport(input: {
  from: string;
  to: string;
  rowCount: number;
}): Promise<{ success: boolean; error?: string }> {
  const gate = await requireStaff(DUAL_RUN_AUDIT_ROLES);
  if (!gate.ok) return { success: false, error: gate.error };

  void writeAuditLog({
    actorUserId: gate.user.id,
    action: 'EXPORT',
    entityType: 'DUAL_RUN_AUDIT_CSV',
    entityId: `${input.from}..${input.to}`,
    meta: { rowCount: input.rowCount },
  });
  return { success: true };
}
