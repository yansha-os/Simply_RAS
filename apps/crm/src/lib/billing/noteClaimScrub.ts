import {
  scrubSingleClaim,
  type ClaimScrubResult,
  type RawClaimInput,
} from '@/lib/claimScrubberEngine';

export type NoteScrubSource = {
  id: string;
  billableUnits: number | null;
  rbtSigned: boolean;
  bcbaSigned: boolean;
  parentSigned: boolean;
  isConverted: boolean;
  deficiencies?: Array<{ id: string }>;
  session: {
    id: string;
    clientId: string;
    cptCode: string | null;
    status: string;
    scheduledStart: Date | string;
    scheduledEnd: Date | string;
    actualStart?: Date | string | null;
    actualEnd?: Date | string | null;
    placeOfServiceCode?: string | null;
    rbtId?: string | null;
    bcbaId?: string | null;
    client: {
      firstName: string;
      lastName: string;
      primaryDiagnosisCode?: string | null;
      insurancePayer?: string | null;
      authorizations?: Array<{
        authNumber: string | null;
        startDate?: Date | string | null;
        endDate?: Date | string | null;
        status?: string;
        unitsApproved?: number | null;
        cptCodes?: Array<{ code: string; unitsApproved?: number | null }>;
      }>;
    };
  };
};

function resolveAuth(note: NoteScrubSource): RawClaimInput['auth'] {
  const approved =
    note.session.client.authorizations?.find(
      (a) => a.status === 'APPROVED' || !a.status,
    ) ?? note.session.client.authorizations?.[0];
  if (!approved) return null;
  const cpt = (note.session.cptCode || '97153').trim().toUpperCase();
  const line = approved.cptCodes?.find((c) => c.code === cpt);
  return {
    authNumber: approved.authNumber,
    startDate: approved.startDate ?? null,
    endDate: approved.endDate ?? null,
    remainingUnits: line?.unitsApproved ?? approved.unitsApproved ?? null,
  };
}

export function scrubNoteForConvert(note: NoteScrubSource): ClaimScrubResult {
  const s = note.session;
  return scrubSingleClaim({
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
      openDeficiencyCount: note.deficiencies?.length ?? 0,
    },
    client: {
      firstName: s.client.firstName,
      lastName: s.client.lastName,
      primaryDiagnosisCode: s.client.primaryDiagnosisCode,
      insurancePayer: s.client.insurancePayer,
    },
    auth: resolveAuth(note),
  });
}
