/**
 * Phase 1 pilot hygiene — demo Studio target detection shared by CRM + HRM.
 * ACTIVE clients must not claim-ready / convert / BCBA-sign notes that rely on
 * dev-only DEMO_TARGETS (t1, b2, …).
 */

/** Demo SkillTarget / BehaviorTarget ids (t1, b2, …) — JSON-only; never SessionTrialData UUIDs. */
export function isDemoStudioTargetId(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^[tb]\d+$/i.test(id.trim());
}

type TargetIdCarrier = { targetId?: string | null; behaviorTargetId?: string | null };

function collectTargetIds(value: unknown, out: Set<string>): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectTargetIds(entry, out);
    return;
  }
  if (typeof value !== 'object') return;
  const row = value as TargetIdCarrier & Record<string, unknown>;
  if (typeof row.targetId === 'string' && row.targetId.trim()) {
    out.add(row.targetId.trim());
  }
  if (typeof row.behaviorTargetId === 'string' && row.behaviorTargetId.trim()) {
    out.add(row.behaviorTargetId.trim());
  }
  for (const entry of Object.values(row)) {
    if (entry && typeof entry === 'object') collectTargetIds(entry, out);
  }
}

/** Scan structured SessionNote JSON for any demo target ids in trials/probes/abc/etc. */
export function structuredContentUsesDemoStudioTargets(content: unknown): boolean {
  const ids = new Set<string>();
  collectTargetIds(content, ids);
  for (const id of ids) {
    if (isDemoStudioTargetId(id)) return true;
  }
  return false;
}

export type StudioTargetPayload = {
  trials?: Array<{ targetId?: string | null }>;
  probes?: Array<{ targetId?: string | null }>;
  abcEvents?: Array<{ behaviorTargetId?: string | null }>;
};

/** Scan an in-flight Studio submit payload before claim-ready persistence. */
export function studioPayloadUsesDemoStudioTargets(payload: StudioTargetPayload): boolean {
  const ids: string[] = [];
  for (const trial of payload.trials ?? []) {
    if (trial?.targetId) ids.push(trial.targetId);
  }
  for (const probe of payload.probes ?? []) {
    if (probe?.targetId) ids.push(probe.targetId);
  }
  for (const abc of payload.abcEvents ?? []) {
    if (abc?.behaviorTargetId) ids.push(abc.behaviorTargetId);
  }
  return ids.some((id) => isDemoStudioTargetId(id));
}

export type ActiveClientDemoHygieneResult =
  | { ok: true }
  | {
      ok: false;
      code: 'ACTIVE_DEMO_TARGETS';
      reason: string;
    };

const ACTIVE_DEMO_BLOCK_REASON =
  'ACTIVE pilot clients cannot use dev demo targets (t1/b1…). Sync real SkillTargets from Clinical Goals before claim-ready submit, BCBA sign, or Plutus convert.';

/**
 * Fail-closed guard for ACTIVE clients still documenting on DEMO_TARGETS.
 * Non-ACTIVE clients (e.g. dev seeds) are not blocked here.
 */
export function evaluateActiveClientDemoHygiene(
  clientStatus: unknown,
  evidence:
    | { structuredContent?: unknown }
    | StudioTargetPayload,
): ActiveClientDemoHygieneResult {
  if (clientStatus !== 'ACTIVE') return { ok: true };

  const usesDemo =
    'structuredContent' in evidence
      ? structuredContentUsesDemoStudioTargets(evidence.structuredContent)
      : studioPayloadUsesDemoStudioTargets(evidence as StudioTargetPayload);

  if (!usesDemo) return { ok: true };

  return {
    ok: false,
    code: 'ACTIVE_DEMO_TARGETS',
    reason: ACTIVE_DEMO_BLOCK_REASON,
  };
}
