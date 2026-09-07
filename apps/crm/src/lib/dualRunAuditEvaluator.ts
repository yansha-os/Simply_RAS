export type CohortCutoverStatus = {
  auditedNoteCount: number;
  openDiscrepancyCount: number;
  gateTarget: number;
  isGate10Met: boolean;
};

/** Cutover checklist gate 10 — ≥10 audited notes, zero open discrepancies. */
export function evaluateCohortAuditGate(
  auditedNoteCount: number,
  openDiscrepancyCount: number,
  gateTarget: number = 10,
): CohortCutoverStatus {
  const isGate10Met = auditedNoteCount >= gateTarget && openDiscrepancyCount === 0;
  return {
    auditedNoteCount,
    openDiscrepancyCount,
    gateTarget,
    isGate10Met,
  };
}
