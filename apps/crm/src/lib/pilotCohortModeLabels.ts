import type { DualRunMode } from '@repo/db';

/**
 * UI labels for DB `DualRunMode` enum (Option B — schema keeps legacy enum values).
 * Product strategy: sandbox → cutover readiness → live — no dual-run with legacy EMR.
 */
export const PILOT_COHORT_MODE_LABEL: Record<DualRunMode, string> = {
  D0_SHADOW: 'Sandbox',
  D1_DUAL_WRITE: 'Cutover ready',
  D2_RAS_PRIMARY: 'Live',
};

export function formatPilotCohortMode(mode: DualRunMode | null | undefined): string {
  if (!mode) return '';
  return PILOT_COHORT_MODE_LABEL[mode] ?? mode.replace(/_/g, ' ');
}
