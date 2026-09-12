/**
 * Database-free, PHI-free effective-rule selector shared by CRM and HRM.
 * Callers must authorize and tenant-scope candidate reads before invoking it.
 */

export type RuleAuthorityKind =
  | 'FEDERAL'
  | 'JURISDICTION'
  | 'PAYER_PLAN'
  | 'SERVICE_LOCATION'
  | 'ORGANIZATION';

export type RuleLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'RETIRED';

export type RuleScope = {
  authorityKind: RuleAuthorityKind;
  authorityId: string | null;
};

export type RuleVersionCandidate = RuleScope & {
  id: string;
  ruleSetKey: string;
  category: string;
  version: number;
  effectiveFrom: string | Date;
  effectiveTo: string | Date | null;
  status: RuleLifecycleStatus;
  jurisdictionDepth?: number;
};

export type RuleResolutionContext = {
  serviceInstant: string | Date;
  organizationId: string;
  serviceLocationId: string;
  payerPlanId: string | null;
  jurisdictionIds: readonly string[];
  requiredScopes?: readonly RuleScope[];
};

export type RuleResolutionFailureCode =
  | 'MALFORMED_CONTEXT'
  | 'MALFORMED_RULE_VERSION'
  | 'AMBIGUOUS_EFFECTIVE_VERSION'
  | 'REQUIRED_SCOPE_MISSING';

export type RuleResolutionResult =
  | { ok: true; selectedVersions: RuleVersionCandidate[] }
  | {
      ok: false;
      code: RuleResolutionFailureCode;
      reason: string;
      manualReviewRequired: true;
    };

const AUTHORITY_ORDER: Record<RuleAuthorityKind, number> = {
  FEDERAL: 10,
  JURISDICTION: 20,
  PAYER_PLAN: 30,
  SERVICE_LOCATION: 40,
  ORGANIZATION: 50,
};

function hold(code: RuleResolutionFailureCode, reason: string): RuleResolutionResult {
  return { ok: false, code, reason, manualReviewRequired: true };
}

function timestamp(value: string | Date): number | null {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function scopeKey(scope: RuleScope): string {
  return `${scope.authorityKind}:${scope.authorityId ?? ''}`;
}

function isNonblank(value: string): boolean {
  return value.trim().length > 0;
}

function appliesToContext(candidate: RuleVersionCandidate, context: RuleResolutionContext): boolean {
  switch (candidate.authorityKind) {
    case 'FEDERAL':
      return candidate.authorityId === null;
    case 'JURISDICTION':
      return candidate.authorityId !== null && context.jurisdictionIds.includes(candidate.authorityId);
    case 'PAYER_PLAN':
      return candidate.authorityId !== null && candidate.authorityId === context.payerPlanId;
    case 'SERVICE_LOCATION':
      return candidate.authorityId === context.serviceLocationId;
    case 'ORGANIZATION':
      return candidate.authorityId === context.organizationId;
  }
}

function isValidCandidate(candidate: RuleVersionCandidate): boolean {
  const start = timestamp(candidate.effectiveFrom);
  const end = candidate.effectiveTo === null ? null : timestamp(candidate.effectiveTo);
  const authorityIdentityValid =
    candidate.authorityKind === 'FEDERAL'
      ? candidate.authorityId === null
      : candidate.authorityId !== null && isNonblank(candidate.authorityId);
  return (
    isNonblank(candidate.id) &&
    isNonblank(candidate.ruleSetKey) &&
    isNonblank(candidate.category) &&
    Number.isInteger(candidate.version) &&
    candidate.version > 0 &&
    start !== null &&
    (end === null || (end !== null && end > start)) &&
    authorityIdentityValid &&
    (candidate.authorityKind !== 'JURISDICTION' ||
      (Number.isInteger(candidate.jurisdictionDepth) && candidate.jurisdictionDepth! >= 0))
  );
}

/**
 * Selects one active version per applicable authority scope at a service instant.
 * The ordered result is a constraint stack; later entries may narrow permitted
 * behavior but must never weaken earlier federal/jurisdiction constraints.
 */
export function resolveEffectiveRuleVersions(
  candidates: readonly RuleVersionCandidate[],
  context: RuleResolutionContext,
): RuleResolutionResult {
  const instant = timestamp(context.serviceInstant);
  if (
    instant === null ||
    !isNonblank(context.organizationId) ||
    !isNonblank(context.serviceLocationId) ||
    context.jurisdictionIds.some((id) => !isNonblank(id))
  ) {
    return hold('MALFORMED_CONTEXT', 'Rule resolution context is incomplete or malformed.');
  }

  if (candidates.some((candidate) => !isValidCandidate(candidate))) {
    return hold('MALFORMED_RULE_VERSION', 'At least one candidate rule version is malformed.');
  }
  const logicalRuleKeys = new Set(
    candidates.map((candidate) => `${candidate.category}:${candidate.ruleSetKey}`),
  );
  if (logicalRuleKeys.size > 1) {
    return hold(
      'MALFORMED_RULE_VERSION',
      'A resolution batch must contain exactly one logical rule set and category.',
    );
  }

  const effectiveByScope = new Map<string, RuleVersionCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.status !== 'ACTIVE' || !appliesToContext(candidate, context)) continue;
    const start = timestamp(candidate.effectiveFrom)!;
    const end = candidate.effectiveTo === null ? null : timestamp(candidate.effectiveTo)!;
    if (instant < start || (end !== null && instant >= end)) continue;

    const key = scopeKey(candidate);
    const versions = effectiveByScope.get(key) ?? [];
    versions.push(candidate);
    effectiveByScope.set(key, versions);
  }

  for (const [key, versions] of effectiveByScope) {
    if (versions.length > 1) {
      return hold(
        'AMBIGUOUS_EFFECTIVE_VERSION',
        `Multiple active rule versions apply to scope ${key}.`,
      );
    }
  }

  for (const required of context.requiredScopes ?? []) {
    if (!effectiveByScope.has(scopeKey(required))) {
      return hold(
        'REQUIRED_SCOPE_MISSING',
        `No active rule version applies to required scope ${scopeKey(required)}.`,
      );
    }
  }

  const selectedVersions = [...effectiveByScope.values()].map(([candidate]) => candidate);
  selectedVersions.sort((left, right) => {
    const authorityDifference =
      AUTHORITY_ORDER[left.authorityKind] - AUTHORITY_ORDER[right.authorityKind];
    if (authorityDifference !== 0) return authorityDifference;
    if (left.authorityKind === 'JURISDICTION' && right.authorityKind === 'JURISDICTION') {
      const depthDifference = left.jurisdictionDepth! - right.jurisdictionDepth!;
      if (depthDifference !== 0) return depthDifference;
    }
    return scopeKey(left).localeCompare(scopeKey(right));
  });

  return { ok: true, selectedVersions };
}
