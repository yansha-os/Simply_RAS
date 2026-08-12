'use server';

import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { prisma } from '@/lib/prisma';
import { resolveActingRbtUserId } from '@/lib/resolveActingRbt';
import { requireStaff } from '@/lib/auth-guard';
import {
  derivePayHoldFromFlags,
  estimateUnitsFromWindow,
  resolvePayrollUnits,
  type PayrollUnitsSource,
} from '@/lib/rbtPayHolds';

const HOURLY_RATE_DEFAULT = 28;
/** Payroll summary lookback — covers the current + prior pay periods. */
const PAYROLL_WINDOW_DAYS = 90;
/** Safety cap only (≈ full-caseload volume for the window), not a page size. */
const PAYROLL_MAX_ROWS = 500;

export type PayableSessionRow = {
  sessionId: string;
  noteId: string | null;
  clientName: string;
  cptCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  location: string | null;
  status: string;
  rbtSigned: boolean;
  parentSigned: boolean;
  bcbaSigned: boolean;
  isConverted: boolean;
  /** Payroll units — SessionNote.billableUnits when persisted, else duration estimate */
  estimatedUnits: number;
  /** Slice 7 — 'NOTE' when units come from the signed note, 'ESTIMATE' otherwise */
  unitsSource: PayrollUnitsSource;
  estimatedPay: number;
  payable: boolean;
  holdReason: string | null;
};

/**
 * Bridge G: durable payroll signals from Session + SessionNote.
 * Payable when bcbaSigned (preferred) or isConverted; unsigned notes are holds.
 * Slice 7: prefers SessionNote.billableUnits over duration estimates and
 * surfaces IN_PROGRESS sessions as DB-backed incomplete holds.
 */
export async function listRbtPayrollSessions(rbtUserId?: string) {
  const gate = await requireStaff();
  if (!gate.ok) {
    return {
      success: false as const,
      sessions: [] as PayableSessionRow[],
      summary: null,
      error: gate.error,
    };
  }

  try {
    const resolvedId = await resolveActingRbtUserId(rbtUserId);
    if (!resolvedId) {
      return {
        success: false as const,
        sessions: [] as PayableSessionRow[],
        summary: null,
        error: 'No RBT user resolved for payroll.',
      };
    }

    // Query by pay-period window instead of a silent recent-60 cap (audit M7):
    // older unpaid-but-payable sessions inside the window can no longer drop out.
    const windowStart = new Date(Date.now() - PAYROLL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const sessions = await prisma.session.findMany({
      where: {
        rbtId: resolvedId,
        cptCode: { not: '97151' },
        status: { in: ['COMPLETED', 'IN_PROGRESS', 'SCHEDULED'] },
        scheduledStart: { gte: windowStart },
      },
      include: {
        client: { select: { firstName: true, lastName: true } },
        note: {
          select: {
            id: true,
            rbtSigned: true,
            parentSigned: true,
            parentSignedAt: true,
            parentSignerName: true,
            bcbaSigned: true,
            bcbaSignedAt: true,
            bcbaSignerName: true,
            rbtSignedAt: true,
            rbtSignerName: true,
            isConverted: true,
            billableUnits: true,
            checklistSnapshot: true,
            structuredContent: true,
            deficiencies: {
              where: { status: 'OPEN' },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { scheduledStart: 'desc' },
      take: PAYROLL_MAX_ROWS,
    });

    const rows: PayableSessionRow[] = sessions.map((s) => {
      const start = s.actualStart || s.scheduledStart;
      const end = s.actualEnd || s.scheduledEnd;
      const note = s.note;
      const fallbackUnits = estimateUnitsFromWindow(start.getTime(), end.getTime());
      const { units, source: unitsSource } = resolvePayrollUnits(
        note?.billableUnits,
        fallbackUnits
      );
      const estimatedPay = Math.round(units * (HOURLY_RATE_DEFAULT / 4) * 100) / 100;
      const bcbaSigned = Boolean(note?.bcbaSigned);
      const isConverted = Boolean(note?.isConverted);
      const rbtSigned = Boolean(note?.rbtSigned);
      const { payable, holdReason } = derivePayHoldFromFlags({
        hasNote: Boolean(note),
        sessionStatus: s.status,
        parentSigned: Boolean(note?.parentSigned),
        parentSignedAt: note?.parentSignedAt ?? null,
        parentSignerName: note?.parentSignerName ?? null,
        rbtSigned,
        rbtSignedAt: note?.rbtSignedAt ?? null,
        rbtSignerName: note?.rbtSignerName ?? null,
        bcbaSigned,
        bcbaSignedAt: note?.bcbaSignedAt ?? null,
        bcbaSignerName: note?.bcbaSignerName ?? null,
        isConverted,
        checklistSnapshot: note?.checklistSnapshot ?? null,
        openDeficiencyCount: note?.deficiencies.length ?? 0,
        billableUnits: note?.billableUnits ?? null,
        submissionFingerprint: extractSubmissionFingerprint(note?.structuredContent),
      });

      return {
        sessionId: s.id,
        noteId: note?.id ?? null,
        clientName: `${s.client.firstName} ${s.client.lastName}`,
        cptCode: s.cptCode || '97153',
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        location: s.location,
        status: s.status,
        rbtSigned,
        parentSigned: Boolean(note?.parentSigned),
        bcbaSigned,
        isConverted,
        estimatedUnits: units,
        unitsSource,
        estimatedPay,
        payable,
        holdReason,
      };
    });

    const payableRows = rows.filter((r) => r.payable);
    const heldRows = rows.filter((r) => !r.payable);
    const approvedPay = payableRows.reduce((sum, r) => sum + r.estimatedPay, 0);
    const heldPay = heldRows.reduce((sum, r) => sum + r.estimatedPay, 0);
    const billableHours = payableRows.reduce((sum, r) => sum + r.estimatedUnits / 4, 0);

    return {
      success: true as const,
      sessions: rows,
      summary: {
        rbtUserId: resolvedId,
        hourlyRate: HOURLY_RATE_DEFAULT,
        payableCount: payableRows.length,
        heldCount: heldRows.length,
        billableHours: Math.round(billableHours * 100) / 100,
        approvedForPayroll: Math.round(approvedPay * 100) / 100,
        amountHeld: Math.round(heldPay * 100) / 100,
        // Earnings truth is durable/payable only. Unfinished duration values
        // remain explicitly labeled estimates in held rows.
        grossEarned: Math.round(approvedPay * 100) / 100,
        grossEstimate: Math.round((approvedPay + heldPay) * 100) / 100,
      },
    };
  } catch (error) {
    console.error(
      'Action failed [listRbtPayrollSessions]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return {
      success: false as const,
      sessions: [] as PayableSessionRow[],
      summary: null,
      error: 'Failed to load payroll sessions.',
    };
  }
}

/** Sessions the RBT can work in Session Studio / schedule (shared Session model). */
export async function listRbtScheduledSessions(rbtUserId?: string) {
  try {
    const resolvedId = await resolveActingRbtUserId(rbtUserId);
    if (!resolvedId) {
      return { success: false as const, sessions: [], error: 'No RBT user resolved.' };
    }

    // Include SCHEDULED + IN_PROGRESS for LIVE calendar; keep COMPLETED for studio resume.
    // Do not exclude by CPT here — Case Coord therapy rows are 97153; 97151 is rare for RBT EVV.
    const sessions = await prisma.session.findMany({
      where: {
        rbtId: resolvedId,
        status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] },
      },
      include: {
        client: { select: { id: true, firstName: true, lastName: true } },
        bcba: { select: { firstName: true, lastName: true } },
        note: { select: { id: true, rbtSigned: true, bcbaSigned: true, isConverted: true } },
      },
      orderBy: { scheduledStart: 'asc' },
      take: 40,
    });

    return {
      success: true as const,
      sessions: sessions.map((s) => ({
        id: s.id,
        clientId: s.client.id,
        clientName: `${s.client.firstName} ${s.client.lastName}`,
        bcbaName: s.bcba ? `${s.bcba.firstName} ${s.bcba.lastName}` : 'Supervising BCBA',
        scheduledStart: s.scheduledStart.toISOString(),
        scheduledEnd: s.scheduledEnd.toISOString(),
        location: s.location,
        status: s.status,
        cptCode: s.cptCode,
        hasNote: Boolean(s.note),
        bcbaSigned: Boolean(s.note?.bcbaSigned),
      })),
    };
  } catch (error) {
    console.error(
      'Action failed [listRbtScheduledSessions]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false as const, sessions: [], error: 'Failed to load schedule.' };
  }
}
