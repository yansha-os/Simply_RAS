/**
 * Native EDI X12 835 Electronic Remittance Advice (ERA) Parser & Auto-Posting Engine
 * P3-optional stub — MVP billing stays manual Plutus tracker (no EDI).
 */

export interface RemittanceClaimResult {
  claimId: string;
  patientName: string;
  billedAmount: number;
  paidAmount: number;
  status: 'PAID' | 'DENIED' | 'PARTIAL';
  denialReasonCode?: string;
  denialDescription?: string;
}

export function parseX12_835_ERA(rawEdi835Text: string): RemittanceClaimResult[] {
  const results: RemittanceClaimResult[] = [];
  const lines = rawEdi835Text.split('\n').map((l) => l.trim()).filter(Boolean);

  let currentClaim: RemittanceClaimResult | null = null;

  for (const line of lines) {
    // CLP Segment: Claim Payment Information (CLP*ClaimID*Status*Billed*Paid...)
    if (line.startsWith('CLP*')) {
      if (currentClaim?.claimId) {
        results.push(currentClaim);
      }
      const parts = line.split('*');
      const billed = parseFloat(parts[3] || '0');
      const paid = parseFloat(parts[4] || '0');

      let status: 'PAID' | 'DENIED' | 'PARTIAL' = 'PAID';
      if (paid === 0) status = 'DENIED';
      else if (paid < billed) status = 'PARTIAL';

      currentClaim = {
        claimId: parts[1] || 'UNKNOWN',
        patientName: 'Patient ' + parts[1],
        billedAmount: billed,
        paidAmount: paid,
        status,
      };
    }

    // CAS Segment: Claim Adjustment / Denial Reason (CAS*PR*16*150.00~)
    if (line.startsWith('CAS*') && currentClaim) {
      const parts = line.split('*');
      const reasonCode = parts[2];
      currentClaim.denialReasonCode = reasonCode;

      // Interpret common ABA billing denial codes
      switch (reasonCode) {
        case '197':
          currentClaim.denialDescription = 'Precertification/prior authorization/notification absent.';
          break;
        case '96':
          currentClaim.denialDescription = 'Non-covered charge(s). Provider not credentialed for payer.';
          break;
        case '16':
          currentClaim.denialDescription = 'Claim/service lacks information or has missing NPI/CPT modifier.';
          break;
        case '18':
          currentClaim.denialDescription = 'Duplicate claim/service.';
          break;
        default:
          currentClaim.denialDescription = `Claim adjustment reason code: ${reasonCode}`;
      }
    }
  }

  if (currentClaim?.claimId) {
    results.push(currentClaim);
  }

  // No sample remittance fallback — empty input returns [] (manual Plutus is SoT).
  return results;
}
