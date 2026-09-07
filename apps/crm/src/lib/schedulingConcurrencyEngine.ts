/**
 * Intelligent Scheduling & Concurrency Calendar Engine
 *
 * Enforces medical billing concurrency rules (e.g. valid concurrent 97155 + 97153 supervision
 * vs invalid double-billing overlaps), weekly authorized hours headroom, and provider travel buffers.
 */

export interface ScheduledSessionSlot {
  id: string;
  clientId: string;
  cptCode: string; // '97151' | '97153' | '97155' | '97156'
  start: Date | string;
  end: Date | string;
  rbtId?: string | null;
  bcbaId?: string | null;
  location?: string | null;
}

export type OverlapClassification =
  | 'NO_OVERLAP'
  | 'VALID_CONCURRENT_SUPERVISION' // BCBA 97155 + RBT 97153 for same client
  | 'INVALID_DUPLICATE_CLIENT_BILLING' // Two 97153 sessions for same client
  | 'INVALID_STAFF_DOUBLE_BOOKING' // Staff booked with 2 different clients at same time
  | 'TRAVEL_BUFFER_WARNING'; // Back-to-back in-home sessions with < 30min transit

export interface ConcurrencyCheckResult {
  allowed: boolean;
  classification: OverlapClassification;
  conflictDetails: string | null;
  conflictingSessionId: string | null;
}

export interface WeeklyHeadroomResult {
  cptCode: string;
  weeklyAuthorizedHours: number;
  currentlyScheduledHours: number;
  proposedSessionHours: number;
  remainingHeadroomHours: number;
  isOverLimit: boolean;
}

/**
 * Checks if two time intervals overlap (strictly > 0 minutes)
 */
function intervalsOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

/**
 * Validates concurrency for a proposed session against existing scheduled sessions
 */
export function validateSessionConcurrency(
  proposed: ScheduledSessionSlot,
  existingSessions: ScheduledSessionSlot[]
): ConcurrencyCheckResult {
  const propStart = new Date(proposed.start).getTime();
  const propEnd = new Date(proposed.end).getTime();

  if (!Number.isFinite(propStart) || !Number.isFinite(propEnd) || propStart >= propEnd) {
    return {
      allowed: false,
      classification: 'INVALID_STAFF_DOUBLE_BOOKING',
      conflictDetails: 'Invalid session start or end time.',
      conflictingSessionId: null,
    };
  }

  const propCpt = (proposed.cptCode || '97153').trim();

  for (const s of existingSessions) {
    if (s.id === proposed.id) continue;

    const sStart = new Date(s.start).getTime();
    const sEnd = new Date(s.end).getTime();
    if (!intervalsOverlap(propStart, propEnd, sStart, sEnd)) continue;

    const sCpt = (s.cptCode || '97153').trim();

    // 1. Same Client Check
    if (s.clientId === proposed.clientId) {
      // Check for valid concurrent 97155 supervision over 97153
      const isPropSupervision = propCpt === '97155' && sCpt === '97153';
      const isExistingSupervision = propCpt === '97153' && sCpt === '97155';

      if (isPropSupervision || isExistingSupervision) {
        return {
          allowed: true,
          classification: 'VALID_CONCURRENT_SUPERVISION',
          conflictDetails: `Valid concurrent supervision: BCBA 97155 and RBT 97153 overlap for client.`,
          conflictingSessionId: s.id,
        };
      }

      // Invalid duplicate direct billing for same client
      return {
        allowed: false,
        classification: 'INVALID_DUPLICATE_CLIENT_BILLING',
        conflictDetails: `Client already has a scheduled ${sCpt} session at this time.`,
        conflictingSessionId: s.id,
      };
    }

    // 2. Staff Double-Booking Check (different clients)
    if (proposed.rbtId && s.rbtId && proposed.rbtId === s.rbtId) {
      return {
        allowed: false,
        classification: 'INVALID_STAFF_DOUBLE_BOOKING',
        conflictDetails: `RBT is already scheduled with another client during this window.`,
        conflictingSessionId: s.id,
      };
    }

    if (proposed.bcbaId && s.bcbaId && proposed.bcbaId === s.bcbaId) {
      return {
        allowed: false,
        classification: 'INVALID_STAFF_DOUBLE_BOOKING',
        conflictDetails: `BCBA is already scheduled with another client during this window.`,
        conflictingSessionId: s.id,
      };
    }
  }

  // 3. Travel Buffer Check for In-Home Sessions (30-minute buffer required between different locations)
  if (proposed.rbtId) {
    for (const s of existingSessions) {
      if (s.id === proposed.id || s.clientId === proposed.clientId) continue;
      if (s.rbtId !== proposed.rbtId) continue;

      const sStart = new Date(s.start).getTime();
      const sEnd = new Date(s.end).getTime();

      const diffBefore = (propStart - sEnd) / (1000 * 60); // minutes between previous session end and proposed start
      const diffAfter = (sStart - propEnd) / (1000 * 60); // minutes between proposed end and next session start

      if ((diffBefore >= 0 && diffBefore < 30) || (diffAfter >= 0 && diffAfter < 30)) {
        return {
          allowed: true,
          classification: 'TRAVEL_BUFFER_WARNING',
          conflictDetails: `RBT has less than 30 minutes transit buffer between client locations.`,
          conflictingSessionId: s.id,
        };
      }
    }
  }

  return {
    allowed: true,
    classification: 'NO_OVERLAP',
    conflictDetails: null,
    conflictingSessionId: null,
  };
}

/**
 * Evaluates weekly authorized hours headroom for a client and CPT code
 */
export function checkAuthorizedHoursHeadroom(params: {
  cptCode: string;
  weeklyAuthorizedHours: number;
  existingWeekSessions: Array<{ cptCode: string; durationMinutes: number }>;
  proposedDurationMinutes: number;
}): WeeklyHeadroomResult {
  const { cptCode, weeklyAuthorizedHours, existingWeekSessions, proposedDurationMinutes } = params;

  const currentMinutes = existingWeekSessions
    .filter((s) => s.cptCode === cptCode)
    .reduce((acc, s) => acc + (s.durationMinutes || 0), 0);

  const currentlyScheduledHours = Math.round((currentMinutes / 60) * 10) / 10;
  const proposedSessionHours = Math.round((proposedDurationMinutes / 60) * 10) / 10;
  const totalProjectedHours = currentlyScheduledHours + proposedSessionHours;
  const remainingHeadroomHours = Math.round((weeklyAuthorizedHours - totalProjectedHours) * 10) / 10;

  return {
    cptCode,
    weeklyAuthorizedHours,
    currentlyScheduledHours,
    proposedSessionHours,
    remainingHeadroomHours,
    isOverLimit: remainingHeadroomHours < 0,
  };
}
