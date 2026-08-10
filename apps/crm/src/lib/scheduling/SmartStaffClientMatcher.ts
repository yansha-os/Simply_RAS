/**
 * Multi-Constraint Smart RBT-Client Matching & Conflict Detection Algorithm
 * Phase 5 - Intelligent Scheduling Engine
 */

export interface CandidateRbt {
  id: string;
  firstName: string;
  lastName: string;
  zipCode: string;
  latitude?: number;
  longitude?: number;
  isPayerCredentialed: boolean;
  activeClientCount: number;
}

export interface ClientSchedulingContext {
  clientId: string;
  clientName: string;
  payerName: string;
  zipCode: string;
  latitude?: number;
  longitude?: number;
  authUnitsRemaining: number;
  requestedStart: string; // ISO string
  requestedEnd: string; // ISO string
}

export interface MatchScoreResult {
  rbt: CandidateRbt;
  matchScore: number; // 0 - 100%
  distanceMiles: number;
  credentialStatus: 'CLEARED' | 'HARD_LOCKED' | 'EXPIRING_SOON';
  hasScheduleConflict: boolean;
  recommendationReason: string;
}

/**
 * Calculates approximate travel distance between two zip codes or coordinates
 */
export function calculateTravelDistance(zipA: string, zipB: string): number {
  // Simple zip code distance mock logic
  const numA = parseInt(zipA.replace(/\D/g, '')) || 33101;
  const numB = parseInt(zipB.replace(/\D/g, '')) || 33101;
  const diff = Math.abs(numA - numB);
  return Math.min(Math.round((diff % 25) + 2.5), 35);
}

/**
 * Evaluates candidate RBTs against a client's scheduling request
 */
export function rankCandidateRbts(
  client: ClientSchedulingContext,
  candidates: CandidateRbt[],
  existingAppointments: Array<{ rbtId: string; start: string; end: string }>
): MatchScoreResult[] {
  const reqStart = new Date(client.requestedStart).getTime();
  const reqEnd = new Date(client.requestedEnd).getTime();

  return candidates.map((rbt) => {
    const distanceMiles = calculateTravelDistance(client.zipCode, rbt.zipCode);

    // 1. Check Schedule Concurrency Conflicts
    const hasConflict = existingAppointments.some((appt) => {
      if (appt.rbtId !== rbt.id) return false;
      const apptStart = new Date(appt.start).getTime();
      const apptEnd = new Date(appt.end).getTime();
      return reqStart < apptEnd && reqEnd > apptStart;
    });

    // 2. Determine Payer Credential Status
    const credentialStatus: 'CLEARED' | 'HARD_LOCKED' | 'EXPIRING_SOON' = rbt.isPayerCredentialed
      ? 'CLEARED'
      : 'HARD_LOCKED';

    // 3. Compute Weighted Match Score (0 - 100)
    let matchScore = 100;

    // Deduct for distance
    if (distanceMiles > 5) matchScore -= (distanceMiles - 5) * 2.5;
    
    // Hard penalties
    if (hasConflict) matchScore -= 80;
    if (credentialStatus === 'HARD_LOCKED') matchScore -= 90;

    // Caseload load balancing
    if (rbt.activeClientCount > 4) matchScore -= 10;

    matchScore = Math.max(Math.round(matchScore), 5);

    let reason = 'Optimal match: Near location & cleared for payer.';
    if (hasConflict) reason = 'CONCURRENCY CONFLICT: Double-booking detected!';
    else if (credentialStatus === 'HARD_LOCKED') reason = `HARD LOCKED: Not credentialed for ${client.payerName}`;
    else if (distanceMiles > 15) reason = `High travel distance (${distanceMiles} miles away).`;

    return {
      rbt,
      matchScore,
      distanceMiles,
      credentialStatus,
      hasScheduleConflict: hasConflict,
      recommendationReason: reason,
    };
  }).sort((a, b) => b.matchScore - a.matchScore);
}
