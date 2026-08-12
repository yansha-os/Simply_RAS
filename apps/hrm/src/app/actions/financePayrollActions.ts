'use server';

import type { Role } from '@repo/db';
import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth-guard';
import {
  buildFinancePayrollRollup,
  normalizeFinancePayrollRange,
  readSignedLs54Rate,
  type FinancePayrollRangeInput,
  type FinancePayrollRate,
  type FinancePayrollReport,
  type FinancePayrollSessionInput,
} from '@/components/finance-payroll/financePayrollModel';

const FINANCE_PAYROLL_ROLES =
  ['FINANCE', 'CEO'] as const satisfies readonly Role[];
const MAX_FINANCE_PAYROLL_ROWS = 10_000;

export async function getFinancePayrollRollup(
  input: FinancePayrollRangeInput = {},
) {
  const gate = await requireStaff(FINANCE_PAYROLL_ROLES);
  if (!gate.ok) {
    return {
      success: false as const,
      error: gate.error,
      data: null,
    };
  }

  try {
    const normalized = normalizeFinancePayrollRange(input);
    if (!normalized.ok) {
      return {
        success: false as const,
        error: normalized.error,
        data: null,
      };
    }

    const sessions = await prisma.session.findMany({
      where: {
        rbtId: { not: null },
        cptCode: { not: '97151' },
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
        scheduledStart: {
          gte: normalized.range.start,
          lte: normalized.range.end,
        },
      },
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        actualStart: true,
        actualEnd: true,
        rbt: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        note: {
          select: {
            billableUnits: true,
            checklistSnapshot: true,
            structuredContent: true,
            parentSigned: true,
            parentSignedAt: true,
            parentSignerName: true,
            rbtSigned: true,
            rbtSignedAt: true,
            rbtSignerName: true,
            bcbaSigned: true,
            bcbaSignedAt: true,
            bcbaSignerName: true,
            isConverted: true,
            deficiencies: {
              where: { status: 'OPEN' },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
      take: MAX_FINANCE_PAYROLL_ROWS + 1,
    });

    if (sessions.length > MAX_FINANCE_PAYROLL_ROWS) {
      return {
        success: false as const,
        error:
          'This range contains too many sessions to report safely. Choose a shorter range.',
        data: null,
      };
    }

    const rbtIds = [
      ...new Set(
        sessions
          .map((session) => session.rbt?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const wageNotices =
      rbtIds.length === 0
        ? []
        : await prisma.atsCandidate.findMany({
            where: { userId: { in: rbtIds } },
            select: {
              userId: true,
              onboardingPacket: {
                select: {
                  ls54Status: true,
                  ls54Payload: true,
                },
              },
            },
            orderBy: { updatedAt: 'desc' },
          });

    const ratesByRbt: Record<string, FinancePayrollRate> = {};
    for (const wageNotice of wageNotices) {
      if (!wageNotice.userId || ratesByRbt[wageNotice.userId]) continue;
      const hourlyRate = readSignedLs54Rate(
        wageNotice.onboardingPacket?.ls54Status,
        wageNotice.onboardingPacket?.ls54Payload,
      );
      if (hourlyRate !== null) {
        ratesByRbt[wageNotice.userId] = {
          hourlyRate,
          source: 'SIGNED_LS54',
        };
      }
    }

    const payrollSessions = sessions.flatMap(
      (session): FinancePayrollSessionInput[] => {
        if (!session.rbt) return [];
        const note = session.note;
        const start = session.actualStart || session.scheduledStart;
        const end = session.actualEnd || session.scheduledEnd;
        return [
          {
            sessionId: session.id,
            rbtId: session.rbt.id,
            rbtName:
              `${session.rbt.firstName} ${session.rbt.lastName}`.trim() ||
              'Unnamed RBT',
            sessionStatus: session.status,
            startMs: start.getTime(),
            endMs: end.getTime(),
            noteUnits: note?.billableUnits ?? null,
            hasNote: Boolean(note),
            parentSigned: Boolean(note?.parentSigned),
            parentSignedAt: note?.parentSignedAt ?? null,
            parentSignerName: note?.parentSignerName ?? null,
            rbtSigned: Boolean(note?.rbtSigned),
            rbtSignedAt: note?.rbtSignedAt ?? null,
            rbtSignerName: note?.rbtSignerName ?? null,
            bcbaSigned: Boolean(note?.bcbaSigned),
            bcbaSignedAt: note?.bcbaSignedAt ?? null,
            bcbaSignerName: note?.bcbaSignerName ?? null,
            isConverted: Boolean(note?.isConverted),
            checklistSnapshot: note?.checklistSnapshot ?? null,
            openDeficiencyCount: note?.deficiencies.length ?? 0,
            submissionFingerprint: extractSubmissionFingerprint(
              note?.structuredContent,
            ),
          },
        ];
      },
    );
    const rollup = buildFinancePayrollRollup(
      payrollSessions,
      ratesByRbt,
    );
    const data: FinancePayrollReport = {
      range: {
        from: normalized.range.from,
        to: normalized.range.to,
        dayCount: normalized.range.dayCount,
        timeZone: normalized.range.timeZone,
      },
      generatedAt: new Date().toISOString(),
      ...rollup,
    };

    return {
      success: true as const,
      data,
    };
  } catch (error) {
    console.error(
      'Action failed [getFinancePayrollRollup]:',
      error instanceof Error ? error.message : 'Unknown error',
    );
    return {
      success: false as const,
      error: 'Failed to load the Finance payroll estimate.',
      data: null,
    };
  }
}
