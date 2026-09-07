import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { prisma } from '@/lib/prisma';
import {
  evaluateAuthUnitHardStop,
  type AuthUnitHardStop,
} from '@/lib/billing/authUnits';
import { scrubNoteForConvert } from '@/lib/billing/noteClaimScrub';
import {
  hasBlockingScrubDefects,
  type ClaimScrubResult,
} from '@/lib/claimScrubberEngine';
import { evaluateCredentialHardStop } from '@/lib/staffCredentials';
import { getCredentialStatus } from '@/lib/staffCredentials.server';

const noteInclude = {
  session: {
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          status: true,
          insurancePayer: true,
          memberId: true,
          medicaidId: true,
          primaryDiagnosisCode: true,
          authorizations: {
            where: { status: 'APPROVED' as const },
            select: {
              authNumber: true,
              type: true,
              status: true,
              startDate: true,
              endDate: true,
              unitsApproved: true,
              cptCodes: { select: { code: true, unitsApproved: true } },
            },
            orderBy: { updatedAt: 'desc' as const },
            take: 3,
          },
        },
      },
      rbt: { select: { id: true, firstName: true, lastName: true } },
      bcba: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  deficiencies: {
    where: { status: 'OPEN' as const },
  },
} as const;

export type SessionClaimsQueuePayload = Awaited<ReturnType<typeof loadSessionClaimsQueue>>;

export async function loadSessionClaimsQueue() {
  const [awaitingBcba, readyToBill, claimFiled, awaitingCount, readyCount, filedCount] =
    await Promise.all([
      prisma.sessionNote.findMany({
        where: { rbtSigned: true, bcbaSigned: false },
        include: noteInclude,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.findMany({
        where: { bcbaSigned: true, isConverted: false },
        include: noteInclude,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.findMany({
        where: { isConverted: true },
        include: noteInclude,
        orderBy: { convertedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.count({ where: { rbtSigned: true, bcbaSigned: false } }),
      prisma.sessionNote.count({ where: { bcbaSigned: true, isConverted: false } }),
      prisma.sessionNote.count({ where: { isConverted: true } }),
    ]);

  const authUnitStatusByNoteId: Record<string, AuthUnitHardStop> = {};
  try {
    const readyClientIds = [
      ...new Set(
        readyToBill
          .map((n) => n.session?.clientId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const ledgerByClient = new Map(
      await Promise.all(
        readyClientIds.map(async (clientId) => {
          const [authorizations, paRequests, sessions] = await Promise.all([
            prisma.authorization.findMany({
              where: { clientId },
              include: { cptCodes: true },
            }),
            prisma.pARequest.findMany({ where: { clientId } }),
            prisma.session.findMany({
              where: { clientId },
              select: {
                id: true,
                status: true,
                cptCode: true,
                scheduledStart: true,
                scheduledEnd: true,
                actualStart: true,
                actualEnd: true,
                note: {
                  select: {
                    billableUnits: true,
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
                    checklistSnapshot: true,
                    structuredContent: true,
                    deficiencies: {
                      where: { status: 'OPEN' },
                      select: { id: true },
                    },
                  },
                },
              },
            }),
          ]);

          return [
            clientId,
            {
              authorizations,
              paRequests,
              sessions: sessions.map((session) => ({
                ...session,
                note: session.note
                  ? {
                      billableUnits: session.note.billableUnits,
                      parentSigned: session.note.parentSigned,
                      parentSignedAt: session.note.parentSignedAt,
                      parentSignerName: session.note.parentSignerName,
                      rbtSigned: session.note.rbtSigned,
                      rbtSignedAt: session.note.rbtSignedAt,
                      rbtSignerName: session.note.rbtSignerName,
                      bcbaSigned: session.note.bcbaSigned,
                      bcbaSignedAt: session.note.bcbaSignedAt,
                      bcbaSignerName: session.note.bcbaSignerName,
                      isConverted: session.note.isConverted,
                      checklistSnapshot: session.note.checklistSnapshot,
                      openDeficiencyCount: session.note.deficiencies.length,
                      submissionFingerprint: extractSubmissionFingerprint(
                        session.note.structuredContent,
                      ),
                    }
                  : null,
              })),
            },
          ] as const;
        }),
      ),
    );

    for (const note of readyToBill) {
      const clientId = note.session?.clientId;
      const sessionId = note.session?.id;
      const ledger = clientId ? ledgerByClient.get(clientId) : undefined;
      if (!clientId || !sessionId || !ledger) continue;
      authUnitStatusByNoteId[note.id] = evaluateAuthUnitHardStop({
        clientId,
        targetSessionId: sessionId,
        ...ledger,
      });
    }
  } catch (error) {
    console.error(
      'session claims queue auth-unit warnings failed:',
      error instanceof Error ? error.message : 'Unknown',
    );
  }

  const scrubStatusByNoteId: Record<string, ClaimScrubResult> = {};
  const convertBlockersByNoteId: Record<string, string[]> = {};
  try {
    for (const note of readyToBill) {
      if (!note.session) continue;
      const scrub = scrubNoteForConvert({
        id: note.id,
        billableUnits: note.billableUnits,
        rbtSigned: note.rbtSigned,
        bcbaSigned: note.bcbaSigned,
        parentSigned: note.parentSigned,
        isConverted: note.isConverted,
        deficiencies: note.deficiencies,
        session: {
          id: note.session.id,
          clientId: note.session.clientId,
          cptCode: note.session.cptCode,
          status: note.session.status,
          scheduledStart: note.session.scheduledStart,
          scheduledEnd: note.session.scheduledEnd,
          actualStart: note.session.actualStart,
          actualEnd: note.session.actualEnd,
          placeOfServiceCode: note.session.placeOfServiceCode,
          rbtId: note.session.rbtId,
          bcbaId: note.session.bcbaId,
          client: {
            firstName: note.session.client.firstName,
            lastName: note.session.client.lastName,
            primaryDiagnosisCode: note.session.client.primaryDiagnosisCode,
            insurancePayer: note.session.client.insurancePayer,
            authorizations: note.session.client.authorizations,
          },
        },
      });
      scrubStatusByNoteId[note.id] = scrub;

      const blockers: string[] = [];
      if (hasBlockingScrubDefects(scrub)) {
        blockers.push(
          ...scrub.defects
            .filter((d) => d.severity === 'BLOCKING')
            .map((d) => d.message),
        );
      }

      const [rbtStatus, bcbaStatus] = await Promise.all([
        note.session.rbtId ? getCredentialStatus(note.session.rbtId) : null,
        note.session.bcbaId ? getCredentialStatus(note.session.bcbaId) : null,
      ]);
      const credentialVerdict = evaluateCredentialHardStop({
        clientStatus: note.session.client.status,
        rbtStatus,
        bcbaStatus,
      });
      if (!credentialVerdict.ok) blockers.push(...credentialVerdict.blockers);

      if (blockers.length > 0) convertBlockersByNoteId[note.id] = blockers;
    }
  } catch (error) {
    console.error(
      'session claims queue scrub/credential warnings failed:',
      error instanceof Error ? error.message : 'Unknown',
    );
  }

  return {
    awaitingBcba,
    readyToBill,
    claimFiled,
    queueCounts: {
      awaiting: awaitingCount,
      ready: readyCount,
      converted: filedCount,
    },
    authUnitStatusByNoteId,
    scrubStatusByNoteId,
    convertBlockersByNoteId,
  };
}
