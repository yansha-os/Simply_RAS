/**
 * Native EDI X12 837P Claim Payload Generator & Clearinghouse Engine
 * P3-optional stub — MVP billing stays manual Plutus tracker (no EDI).
 */

export interface ClaimLineInput {
  cptCode: string; // e.g. "97153"
  modifier?: string; // e.g. "HN" (RBT) or "HO" (BCBA)
  durationMinutes: number;
  payerRules: 'MEDICAID_8_MIN' | 'STRICT_15_MIN';
  ratePerUnit: number;
  diagnosisCode?: string; // e.g. "F84.0"
}

export interface ClaimHeaderInput {
  claimId: string;
  patientFirstName: string;
  patientLastName: string;
  memberId: string;
  payerName: string;
  renderingProviderNpi: string;
  renderingProviderName: string;
  authNumber?: string;
  serviceDate: string; // YYYY-MM-DD
  lines: ClaimLineInput[];
}

/**
 * Calculates billing units based on payer rules.
 * Respects Medical Billing Guardrails: Never hardcode 1hr = 4 units universally.
 */
export function calculateBillingUnits(durationMinutes: number, rule: 'MEDICAID_8_MIN' | 'STRICT_15_MIN'): number {
  if (rule === 'STRICT_15_MIN') {
    return Math.floor(durationMinutes / 15);
  }

  // Medicaid 8-minute rule, closed form. Matches the CMS tier table at every
  // boundary (8–22 → 1, 23–37 → 2, …) and keeps counting past 97 min, where the
  // old hard-coded table fell back to floor(min/15) and undercounted 98–104 min
  // sessions by one unit. Must stay identical to HRM's
  // `billableUnitsFromSeconds` (apps/hrm/src/lib/sessionStudio.ts).
  if (durationMinutes < 8) return 0;
  return Math.floor((durationMinutes + 7) / 15);
}

/**
 * Generates an ANSI X12 837P Professional Claim Transaction Payload
 */
export function generateX12_837P_Payload(header: ClaimHeaderInput): { rawEdiText: string; totalBilledAmount: number; totalUnits: number } {
  const dateFormatted = header.serviceDate.replace(/-/g, '');
  let totalBilled = 0;
  let totalUnitsCount = 0;

  const segmentLines: string[] = [];

  // ISA & GS Interchange Header
  segmentLines.push(`ISA*00*          *00*          *ZZ*SUBMITTERID    *ZZ*CLEARINGHOUSE  *${dateFormatted}*1200*^*00501*000000001*0*P*:~`);
  segmentLines.push(`GS*HC*SUBMITTERID*CLEARINGHOUSE*${dateFormatted}*1200*1*X*005010X222A1~`);

  // Transaction Set Header (ST)
  segmentLines.push(`ST*837*0001*005010X222A1~`);
  segmentLines.push(`BHT*0019*00*CLAIM${header.claimId}*${dateFormatted}*1200*CH~`);

  // Submitter & Receiver Loops (1000A & 1000B)
  segmentLines.push(`NM1*41*2*SIMPLE RAS ABA CLINIC*****46*TAXID123456~`);
  segmentLines.push(`PER*IC*BILLING DEPT*TE*8005550199~`);
  segmentLines.push(`NM1*40*2*${header.payerName.toUpperCase()}*****46*PAYERID999~`);

  // Billing Provider (Loop 2000A / 2010AA)
  segmentLines.push(`HL*1**20*1~`);
  segmentLines.push(`NM1*85*2*SIMPLE RAS CLINICAL SERVICES*****XX*${header.renderingProviderNpi}~`);
  segmentLines.push(`N3*100 HEALTHCARE WAY~`);
  segmentLines.push(`N4*MIAMI*FL*33101~`);

  // Subscriber / Patient (Loop 2000B / 2010BA)
  segmentLines.push(`HL*2*1*22*0~`);
  segmentLines.push(`SBR*P*18*******CI~`);
  segmentLines.push(`NM1*IL*1*${header.patientLastName.toUpperCase()}*${header.patientFirstName.toUpperCase()}****MI*${header.memberId}~`);

  // Claim Info (Loop 2300)
  if (header.authNumber) {
    segmentLines.push(`REF*G1*${header.authNumber}~`);
  }
  segmentLines.push(`HI*BK:${header.lines[0]?.diagnosisCode || 'F84.0'}~`);

  // Service Lines (Loop 2400)
  header.lines.forEach((line, idx) => {
    const units = calculateBillingUnits(line.durationMinutes, line.payerRules);
    const lineCharge = units * line.ratePerUnit;
    totalBilled += lineCharge;
    totalUnitsCount += units;

    const modifierSegment = line.modifier ? `:${line.modifier}` : '';
    segmentLines.push(`LX*${idx + 1}~`);
    segmentLines.push(`SV1*HC:${line.cptCode}${modifierSegment}*${lineCharge.toFixed(2)}*UN*${units}***1~`);
    segmentLines.push(`DTP*472*D8*${dateFormatted}~`);
  });

  // Transaction Set Trailer (SE & GE & IEA)
  segmentLines.push(`SE*${segmentLines.length + 1}*0001~`);
  segmentLines.push(`GE*1*1~`);
  segmentLines.push(`IEA*1*000000001~`);

  return {
    rawEdiText: segmentLines.join('\n'),
    totalBilledAmount: totalBilled,
    totalUnits: totalUnitsCount,
  };
}
