/**
 * Protocol Modification & Clinical Supervision Note Engine (CPT 97155)
 *
 * Provides structured clinical validation for BCBA direct protocol modifications,
 * concurrent RBT clinical supervision, procedural fidelity scoring, and treatment adjustments.
 */

export type SupervisionModality =
  | 'CONCURRENT_WITH_RBT'
  | 'DIRECT_WITH_CLIENT'
  | 'CAREGIVER_PRESENT';

export interface ProtocolModificationItem {
  targetId?: string;
  targetTitle: string;
  previousProcedure: string;
  modifiedProcedure: string;
  clinicalRationale: string;
}

export interface RbtSupervisionFeedback {
  rbtUserId?: string;
  rbtName: string;
  proceduralFidelityScore: number; // 0 to 100
  strengthsObserved: string;
  correctiveGuidanceProvided: string;
  followUpCompetencyRequired: boolean;
}

export interface ProtocolModificationNotePayload {
  modality: SupervisionModality;
  sessionMinutes: number;
  rbtSupervision?: RbtSupervisionFeedback;
  protocolModifications: ProtocolModificationItem[];
  clientResponseSummary: string;
  environmentalModifications?: string;
  bcbaClinicalNarrative: string;
  nextSupervisionFocus?: string;
}

export interface ProtocolModificationValidationResult {
  ok: boolean;
  errors: string[];
  estimatedUnits: number;
  isConcurrent: boolean;
}

/**
 * Validates a CPT 97155 Protocol Modification session note for clinical & payer compliance
 */
export function validateProtocolModificationNote(
  payload: Partial<ProtocolModificationNotePayload>
): ProtocolModificationValidationResult {
  const errors: string[] = [];

  const minutes = typeof payload.sessionMinutes === 'number' && Number.isFinite(payload.sessionMinutes)
    ? Math.max(0, Math.floor(payload.sessionMinutes))
    : 0;

  if (minutes < 15) {
    errors.push('CPT 97155 requires a minimum session duration of 15 minutes.');
  }

  const modality = payload.modality || 'CONCURRENT_WITH_RBT';
  const isConcurrent = modality === 'CONCURRENT_WITH_RBT';

  if (isConcurrent) {
    if (!payload.rbtSupervision || !payload.rbtSupervision.rbtName) {
      errors.push('RBT name and supervision feedback are required for concurrent 97155 sessions.');
    }
    const fidelity = payload.rbtSupervision?.proceduralFidelityScore;
    if (typeof fidelity !== 'number' || !Number.isFinite(fidelity) || fidelity < 0 || fidelity > 100) {
      errors.push('A valid RBT procedural fidelity score (0–100%) is required.');
    }
  }

  const mods = Array.isArray(payload.protocolModifications) ? payload.protocolModifications : [];
  if (mods.length === 0 && !payload.rbtSupervision) {
    errors.push('At least one protocol modification or RBT supervision evaluation must be documented.');
  }

  for (let i = 0; i < mods.length; i++) {
    const m = mods[i];
    if (!m.targetTitle || m.targetTitle.trim().length === 0) {
      errors.push(`Protocol modification #${i + 1} is missing target title.`);
    }
    if (!m.modifiedProcedure || m.modifiedProcedure.trim().length === 0) {
      errors.push(`Protocol modification #${i + 1} is missing modified procedure details.`);
    }
    if (!m.clinicalRationale || m.clinicalRationale.trim().length === 0) {
      errors.push(`Protocol modification #${i + 1} is missing clinical rationale.`);
    }
  }

  const narrative = typeof payload.bcbaClinicalNarrative === 'string'
    ? payload.bcbaClinicalNarrative.trim()
    : '';

  if (narrative.length < 25) {
    errors.push('A comprehensive BCBA clinical narrative (minimum 25 characters) is required.');
  }

  const estimatedUnits = Math.floor(minutes / 15);

  return {
    ok: errors.length === 0,
    errors,
    estimatedUnits,
    isConcurrent,
  };
}
