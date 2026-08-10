/**
 * Session Note Audit Risk Scrubber (NLP & Clinical Rule Scanner)
 * Phase 10 - Prevents Insurance Billing Audit Denials
 */

export interface SessionNoteAuditInput {
  noteId: string;
  clinicalContent: string;
  sessionDurationMinutes: number;
  loggedTrialsCount: number;
  rbtSigned: boolean;
  parentSigned: boolean;
}

export interface SessionNoteAuditScanResult {
  isAuditRisk: boolean;
  auditScore: number; // 0 - 100% (100% = Clean Audit Proof)
  riskFlags: string[];
  recommendations: string[];
}

export function scanSessionNoteForAuditRisks(input: SessionNoteAuditInput): SessionNoteAuditScanResult {
  const riskFlags: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // 1. Check for empty or generic copy-paste text
  if (!input.clinicalContent || input.clinicalContent.length < 50) {
    score -= 35;
    riskFlags.push('Clinical note narrative is too brief (<50 characters). High audit rejection risk!');
    recommendations.push('Add specific details on prompts used and client response to interventions.');
  }

  const genericPhrases = ['client did good', 'session went well', 'no issues', 'same as usual'];
  const hasGeneric = genericPhrases.some((p) => input.clinicalContent.toLowerCase().includes(p));
  if (hasGeneric) {
    score -= 20;
    riskFlags.push('Generic non-clinical phrases detected in narrative.');
    recommendations.push('Replace generic statements with objective quantitative data.');
  }

  // 2. Check for missing objective trial logs relative to duration
  if (input.sessionDurationMinutes >= 60 && input.loggedTrialsCount === 0) {
    score -= 25;
    riskFlags.push('Zero discrete trials logged for a 60+ minute direct therapy session.');
    recommendations.push('Ensure trial-by-trial (+/-) or frequency data is attached.');
  }

  // 3. Signatures check
  if (!input.parentSigned) {
    score -= 15;
    riskFlags.push('Missing parent/guardian verification signature.');
  }

  score = Math.max(score, 10);

  return {
    isAuditRisk: riskFlags.length > 0,
    auditScore: score,
    riskFlags,
    recommendations,
  };
}
