/**
 * Pre-submission claim field checklist (prototype / sandbox QA aid).
 *
 * Checks basic documentation presence (auth window, POS, signatures, deficiencies, units).
 * This is NOT payer-rule enforcement, EDI submission, or a first-pass clean-claim guarantee.
 * Automated coding/modifier/claim rules stay frozen until contracts are confirmed.
 */

export type ClaimScrubDefectCode =
  | 'MISSING_AUTH_NUMBER'
  | 'AUTH_DATE_WINDOW_EXPIRED'
  | 'AUTH_UNITS_EXCEEDED'
  | 'MISSING_CMS_POS'
  | 'MISSING_RENDERING_PROVIDER'
  | 'MISSING_BCBA_COSIGN'
  | 'MISSING_CAREGIVER_SIGNATURE'
  | 'OPEN_NOTE_DEFICIENCIES'
  | 'INVALID_BILLABLE_UNITS'
  | 'MISSING_DIAGNOSIS_CODE';

export interface ClaimScrubDefect {
  code: ClaimScrubDefectCode;
  severity: 'BLOCKING' | 'WARNING';
  message: string;
  remediationStep: string;
}

export interface ClaimScrubResult {
  sessionId: string;
  noteId: string;
  clientId: string;
  clientName: string;
  cptCode: string;
  dateOfService: string;
  billableUnits: number;
  status: 'CLEAN' | 'DEFECTIVE';
  defects: ClaimScrubDefect[];
  plutusReady: boolean;
}

export interface ClaimScrubberBatchSummary {
  totalNotesScrubbed: number;
  cleanClaimsCount: number;
  defectiveClaimsCount: number;
  cleanClaimRatePct: number;
  totalBillableUnits: number;
  totalEstimatedRevenue: number; // units * rate
  defectTaxonomy: Record<ClaimScrubDefectCode, number>;
  claims: ClaimScrubResult[];
}

export interface RawClaimInput {
  session: {
    id: string;
    clientId: string;
    cptCode?: string | null;
    status: string;
    scheduledStart: Date | string;
    scheduledEnd: Date | string;
    actualStart?: Date | string | null;
    actualEnd?: Date | string | null;
    placeOfServiceCode?: string | null;
    rbtId?: string | null;
    bcbaId?: string | null;
  };
  note: {
    id: string;
    billableUnits?: number | null;
    rbtSigned: boolean;
    bcbaSigned: boolean;
    parentSigned: boolean;
    isConverted: boolean;
    openDeficiencyCount?: number;
  };
  client: {
    firstName: string;
    lastName: string;
    primaryDiagnosisCode?: string | null;
    insurancePayer?: string | null;
  };
  auth?: {
    authNumber?: string | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    remainingUnits?: number | null;
  } | null;
}

const VALID_POS_CODES = new Set(['02', '10', '11', '12', '99']);

/**
 * Scrubs a single session note claim against payer rules
 */
export function scrubSingleClaim(claim: RawClaimInput): ClaimScrubResult {
  const defects: ClaimScrubDefect[] = [];
  const { session, note, client, auth } = claim;

  const cpt = (session.cptCode || '97153').trim().toUpperCase();
  const dos = new Date(session.scheduledStart);
  const dosStr = dos.toISOString().split('T')[0];
  const dosMs = dos.getTime();

  // 1. Diagnosis Code
  if (!client.primaryDiagnosisCode || client.primaryDiagnosisCode.trim().length === 0) {
    defects.push({
      code: 'MISSING_DIAGNOSIS_CODE',
      severity: 'BLOCKING',
      message: 'Client chart is missing primary ICD-10 diagnosis code (e.g. F84.0).',
      remediationStep: 'Add primary diagnosis code to client profile.',
    });
  }

  // 2. Authorization Verification
  if (!auth || !auth.authNumber || auth.authNumber.trim().length === 0) {
    defects.push({
      code: 'MISSING_AUTH_NUMBER',
      severity: 'BLOCKING',
      message: 'No active prior authorization number linked to this date of service.',
      remediationStep: 'Verify approved prior authorization in client Billing tab.',
    });
  } else {
    if (auth.startDate && auth.endDate) {
      const startMs = new Date(auth.startDate).getTime();
      const endMs = new Date(auth.endDate).getTime() + 86400000; // end of day
      if (dosMs < startMs || dosMs > endMs) {
        defects.push({
          code: 'AUTH_DATE_WINDOW_EXPIRED',
          severity: 'BLOCKING',
          message: `Date of service (${dosStr}) falls outside authorization window.`,
          remediationStep: 'Ensure date of service matches authorized dates or submit mid-cycle PA.',
        });
      }
    }

    if (typeof auth.remainingUnits === 'number' && auth.remainingUnits <= 0) {
      defects.push({
        code: 'AUTH_UNITS_EXCEEDED',
        severity: 'BLOCKING',
        message: 'Prior authorization units are completely exhausted for this CPT code.',
        remediationStep: 'Submit re-authorization request before submitting claim.',
      });
    }
  }

  // 3. Place of Service
  const pos = (session.placeOfServiceCode || '').trim();
  if (!pos || !VALID_POS_CODES.has(pos)) {
    defects.push({
      code: 'MISSING_CMS_POS',
      severity: 'BLOCKING',
      message: `Invalid or missing CMS Place of Service code ("${pos || 'EMPTY'}").`,
      remediationStep: 'Set valid CMS Place of Service (e.g. 12 for Home, 11 for Clinic).',
    });
  }

  // 4. Rendering & Supervisory Providers
  if (cpt === '97153' && !session.rbtId) {
    defects.push({
      code: 'MISSING_RENDERING_PROVIDER',
      severity: 'BLOCKING',
      message: 'Rendering RBT provider ID is missing for 97153 direct session.',
      remediationStep: 'Assign rendering RBT to session.',
    });
  }

  // 5. BCBA Co-Sign
  if (!note.bcbaSigned) {
    defects.push({
      code: 'MISSING_BCBA_COSIGN',
      severity: 'BLOCKING',
      message: 'Supervising BCBA clinical e-signature is missing.',
      remediationStep: 'Supervising BCBA must review and sign note in clinical portal.',
    });
  }

  // 6. Caregiver Signature (required for direct in-home 97153)
  if (cpt === '97153' && pos === '12' && !note.parentSigned) {
    defects.push({
      code: 'MISSING_CAREGIVER_SIGNATURE',
      severity: 'BLOCKING',
      message: 'Caregiver / parent verification signature is missing for in-home session.',
      remediationStep: 'Collect caregiver attestation or record formal parent sign-off.',
    });
  }

  // 7. Open Deficiencies
  if ((note.openDeficiencyCount || 0) > 0) {
    defects.push({
      code: 'OPEN_NOTE_DEFICIENCIES',
      severity: 'BLOCKING',
      message: `Note has ${note.openDeficiencyCount} unresolved clinical deficiency item(s).`,
      remediationStep: 'RBT / BCBA must resolve all flagged note deficiencies before claim conversion.',
    });
  }

  // 8. Billable Units
  const units = typeof note.billableUnits === 'number' && Number.isFinite(note.billableUnits)
    ? Math.max(0, Math.floor(note.billableUnits))
    : 0;

  if (units <= 0) {
    defects.push({
      code: 'INVALID_BILLABLE_UNITS',
      severity: 'BLOCKING',
      message: 'Durable billable units must be a positive integer greater than 0.',
      remediationStep: 'Re-calculate and persist durable billable units based on actual duration.',
    });
  }

  const isClean = defects.length === 0;

  return {
    sessionId: session.id,
    noteId: note.id,
    clientId: session.clientId,
    clientName: `${client.firstName} ${client.lastName}`,
    cptCode: cpt,
    dateOfService: dosStr,
    billableUnits: units,
    status: isClean ? 'CLEAN' : 'DEFECTIVE',
    defects,
    plutusReady: isClean && !note.isConverted,
  };
}

/**
 * Scrubs a batch of session note claims and computes the batch summary
 */
export function scrubClaimBatch(
  claims: RawClaimInput[],
  unitRateDollar = 27.5 // standard ~110/hr blended Medicaid/Commercial rate
): ClaimScrubberBatchSummary {
  const defectTaxonomy: Record<ClaimScrubDefectCode, number> = {
    MISSING_AUTH_NUMBER: 0,
    AUTH_DATE_WINDOW_EXPIRED: 0,
    AUTH_UNITS_EXCEEDED: 0,
    MISSING_CMS_POS: 0,
    MISSING_RENDERING_PROVIDER: 0,
    MISSING_BCBA_COSIGN: 0,
    MISSING_CAREGIVER_SIGNATURE: 0,
    OPEN_NOTE_DEFICIENCIES: 0,
    INVALID_BILLABLE_UNITS: 0,
    MISSING_DIAGNOSIS_CODE: 0,
  };

  const results: ClaimScrubResult[] = [];
  let cleanCount = 0;
  let defectiveCount = 0;
  let totalUnits = 0;

  for (const claim of claims) {
    const res = scrubSingleClaim(claim);
    results.push(res);

    if (res.status === 'CLEAN') {
      cleanCount++;
      totalUnits += res.billableUnits;
    } else {
      defectiveCount++;
      for (const d of res.defects) {
        defectTaxonomy[d.code]++;
      }
    }
  }

  const total = claims.length;
  const cleanClaimRatePct = total > 0 ? Math.round((cleanCount / total) * 100) : 100;
  const totalEstimatedRevenue = Math.round(totalUnits * unitRateDollar);

  return {
    totalNotesScrubbed: total,
    cleanClaimsCount: cleanCount,
    defectiveClaimsCount: defectiveCount,
    cleanClaimRatePct,
    totalBillableUnits: totalUnits,
    totalEstimatedRevenue,
    defectTaxonomy,
    claims: results,
  };
}

/** True when any defect would block Plutus convert (BLOCKING = critical). */
export function hasBlockingScrubDefects(result: ClaimScrubResult): boolean {
  return result.defects.some((d) => d.severity === 'BLOCKING');
}

export function blockingScrubDefectLabels(result: ClaimScrubResult): string[] {
  return result.defects.filter((d) => d.severity === 'BLOCKING').map((d) => d.message);
}
