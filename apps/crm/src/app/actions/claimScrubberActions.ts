'use server';

import { prisma } from '@/lib/prisma';
import { requireStaff } from '@/lib/auth-guard';
import {
  scrubClaimBatch,
  type ClaimScrubberBatchSummary,
  type RawClaimInput,
} from '@/lib/claimScrubberEngine';

export async function scrubUnconvertedSessionClaims(): Promise<{
  success: boolean;
  batchSummary?: ClaimScrubberBatchSummary;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'BILLING', 'OPS_DIRECTOR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    // Load completed session notes that are not yet converted
    const sessionNotes = await prisma.sessionNote.findMany({
      where: {
        isConverted: false,
        session: { status: 'COMPLETED' },
      },
      include: {
        session: {
          include: {
            client: {
              include: {
                authorizations: {
                  where: { status: 'APPROVED' },
                  include: { cptCodes: true },
                },
              },
            },
          },
        },
        deficiencies: {
          where: { status: 'OPEN' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const rawClaims: RawClaimInput[] = sessionNotes.map((note) => {
      const s = note.session;
      const approvedAuth = s.client.authorizations[0] || null;
      const matchingCptLine = approvedAuth?.cptCodes.find(
        (c: { code: string }) => c.code === (s.cptCode || '97153')
      );

      return {
        session: {
          id: s.id,
          clientId: s.clientId,
          cptCode: s.cptCode,
          status: s.status,
          scheduledStart: s.scheduledStart,
          scheduledEnd: s.scheduledEnd,
          actualStart: s.actualStart,
          actualEnd: s.actualEnd,
          placeOfServiceCode: s.placeOfServiceCode,
          rbtId: s.rbtId,
          bcbaId: s.bcbaId,
        },
        note: {
          id: note.id,
          billableUnits: note.billableUnits,
          rbtSigned: note.rbtSigned,
          bcbaSigned: note.bcbaSigned,
          parentSigned: note.parentSigned,
          isConverted: note.isConverted,
          openDeficiencyCount: note.deficiencies.length,
        },
        client: {
          firstName: s.client.firstName,
          lastName: s.client.lastName,
          primaryDiagnosisCode: s.client.primaryDiagnosisCode,
          insurancePayer: s.client.insurancePayer,
        },
        auth: approvedAuth
          ? {
              authNumber: approvedAuth.authNumber,
              startDate: approvedAuth.startDate,
              endDate: approvedAuth.endDate,
              remainingUnits: matchingCptLine?.unitsApproved ?? approvedAuth.unitsApproved ?? null,
            }
          : null,
      };
    });

    const batchSummary = scrubClaimBatch(rawClaims);

    return {
      success: true,
      batchSummary,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to scrub session claims.',
    };
  }
}
