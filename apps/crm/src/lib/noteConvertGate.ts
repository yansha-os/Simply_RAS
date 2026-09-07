/**
 * Slice 3 — durable billing-checklist gate for the manual Plutus tracker.
 * `isConverted` requires signatures AND a green checklistSnapshot frozen at RBT submit.
 * Server-side mirror of HRM `evaluateClaimReady` (the snapshot is that evaluation, frozen).
 */

export type ConvertGateNote = {
  rbtSigned: boolean;
  bcbaSigned: boolean;
  checklistSnapshot: unknown;
};

export type ConvertGateResult =
  | { ok: true }
  | {
      ok: false;
      code: 'BCBA_SIGN' | 'RBT_SIGN' | 'CHECKLIST_MISSING' | 'CHECKLIST_FAILED';
      reason: string;
    };

/** Read `passed` from a SessionNote.checklistSnapshot JSON blob. */
export function checklistPassedFromSnapshot(snapshot: unknown): boolean | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const passed = (snapshot as { passed?: unknown }).passed;
  return typeof passed === 'boolean' ? passed : null;
}

/** Labels of failed checklist items, for the convert-rejection message (ids/labels only, no PHI). */
export function failedChecklistLabels(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const items = (snapshot as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (i): i is { ok: boolean; label?: string; key?: string } =>
        Boolean(i) && typeof i === 'object' && (i as { ok?: unknown }).ok === false
    )
    .map((i) => String(i.label || i.key || 'Unknown item'));
}

/**
 * State guard — a BCBA may only e-sign a note that is not yet signed and not
 * yet converted. Re-signing would overwrite the original signer identity and
 * timestamp; signing a converted note would mutate a claim record.
 */
export function canBcbaSign(note: {
  rbtSigned: boolean;
  bcbaSigned: boolean;
  isConverted: boolean;
  checklistSnapshot: unknown;
  openDeficiencyCount: number;
  sessionStatus: string;
}): { ok: true } | { ok: false; reason: string } {
  if (note.isConverted) {
    return {
      ok: false,
      reason: 'Note already converted for claims — signature record is locked.',
    };
  }
  if (note.bcbaSigned) {
    return {
      ok: false,
      reason: 'Note already BCBA-signed — re-signing would overwrite the original signer.',
    };
  }
  if (!note.rbtSigned) {
    return {
      ok: false,
      reason: 'RBT signature is required before BCBA co-sign.',
    };
  }
  if (note.sessionStatus !== 'COMPLETED') {
    return {
      ok: false,
      reason: 'The session must be COMPLETED before BCBA co-sign.',
    };
  }
  if (note.openDeficiencyCount > 0) {
    return {
      ok: false,
      reason: 'Resolve every open deficiency before BCBA co-sign.',
    };
  }
  if (checklistPassedFromSnapshot(note.checklistSnapshot) !== true) {
    return {
      ok: false,
      reason: 'A passed billing checklist is required before BCBA co-sign.',
    };
  }
  return { ok: true };
}

/**
 * State guard — deficiencies strip signatures so the note can be corrected,
 * which must never happen to a note already handed to Plutus (an unsigned but
 * converted claim record). Require an explicit un-convert first.
 */
export function canFlagDeficiency(note: {
  isConverted: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (note.isConverted) {
    return {
      ok: false,
      reason:
        'Note already converted for claims — un-convert it (with an audit note) before flagging a deficiency.',
    };
  }
  return { ok: true };
}

export function evaluateConvertGate(note: ConvertGateNote): ConvertGateResult {
  if (!note.bcbaSigned) {
    return {
      ok: false,
      code: 'BCBA_SIGN',
      reason: 'BCBA e-sign required before marking the claim filed.',
    };
  }
  if (!note.rbtSigned) {
    return {
      ok: false,
      code: 'RBT_SIGN',
      reason: 'RBT signature required before claim filing.',
    };
  }

  const passed = checklistPassedFromSnapshot(note.checklistSnapshot);
  if (passed === null) {
    return {
      ok: false,
      code: 'CHECKLIST_MISSING',
      reason:
        'Billing checklist snapshot missing — note predates the checklist gate or was not submitted through Session Studio. Re-submit the note claim-ready before converting.',
    };
  }
  if (!passed) {
    const failed = failedChecklistLabels(note.checklistSnapshot);
    return {
      ok: false,
      code: 'CHECKLIST_FAILED',
      reason: `Billing checklist failed at RBT submit — cannot convert. Failed: ${
        failed.join('; ') || 'see checklist snapshot'
      }.`,
    };
  }

  return { ok: true };
}
