import { describe, expect, it } from 'vitest';

import {
  resolveEffectiveRuleVersions,
  type RuleResolutionContext,
  type RuleVersionCandidate,
} from './rule-resolution';

const SERVICE_INSTANT = '2026-09-12T16:00:00.000Z';

const context: RuleResolutionContext = {
  serviceInstant: SERVICE_INSTANT,
  organizationId: 'org-1',
  serviceLocationId: 'location-1',
  payerPlanId: 'payer-1',
  jurisdictionIds: ['US', 'US-NY', 'US-NY-NYC'],
};

function rule(overrides: Partial<RuleVersionCandidate> = {}): RuleVersionCandidate {
  return {
    id: 'federal-v1',
    ruleSetKey: 'billing.units',
    category: 'BILLING',
    version: 1,
    authorityKind: 'FEDERAL',
    authorityId: null,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('resolveEffectiveRuleVersions', () => {
  it('returns the applicable constraint stack in deterministic precedence order', () => {
    const result = resolveEffectiveRuleVersions(
      [
        rule({ id: 'org-v1', authorityKind: 'ORGANIZATION', authorityId: 'org-1' }),
        rule({ id: 'local-v1', authorityKind: 'JURISDICTION', authorityId: 'US-NY-NYC', jurisdictionDepth: 2 }),
        rule({ id: 'payer-v1', authorityKind: 'PAYER_PLAN', authorityId: 'payer-1' }),
        rule(),
        rule({ id: 'state-v1', authorityKind: 'JURISDICTION', authorityId: 'US-NY', jurisdictionDepth: 1 }),
        rule({ id: 'location-v1', authorityKind: 'SERVICE_LOCATION', authorityId: 'location-1' }),
      ],
      context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selectedVersions.map(({ id }) => id)).toEqual([
        'federal-v1',
        'state-v1',
        'local-v1',
        'payer-v1',
        'location-v1',
        'org-v1',
      ]);
    }
  });

  it('uses half-open effective intervals and ignores inactive versions', () => {
    const result = resolveEffectiveRuleVersions(
      [
        rule({ id: 'expired', effectiveTo: SERVICE_INSTANT }),
        rule({ id: 'effective-now', version: 2, effectiveFrom: SERVICE_INSTANT }),
        rule({ id: 'draft', version: 3, status: 'DRAFT' }),
      ],
      context,
    );

    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.selectedVersions.map(({ id }) => id)).toEqual(['effective-now']);
  });

  it('ignores otherwise-valid rules outside the authorized service context', () => {
    const result = resolveEffectiveRuleVersions(
      [
        rule({ id: 'other-org', authorityKind: 'ORGANIZATION', authorityId: 'org-2' }),
        rule({ id: 'other-payer', authorityKind: 'PAYER_PLAN', authorityId: 'payer-2' }),
        rule({ id: 'other-state', authorityKind: 'JURISDICTION', authorityId: 'US-FL', jurisdictionDepth: 1 }),
      ],
      context,
    );

    expect(result).toEqual({ ok: true, selectedVersions: [] });
  });

  it('fails closed when active versions overlap within the same authority scope', () => {
    const result = resolveEffectiveRuleVersions(
      [rule(), rule({ id: 'federal-v2', version: 2 })],
      context,
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'AMBIGUOUS_EFFECTIVE_VERSION',
      manualReviewRequired: true,
    });
  });

  it('fails closed when a required applicable scope has no effective version', () => {
    const result = resolveEffectiveRuleVersions([], {
      ...context,
      requiredScopes: [{ authorityKind: 'PAYER_PLAN', authorityId: 'payer-1' }],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'REQUIRED_SCOPE_MISSING',
      manualReviewRequired: true,
    });
  });

  it.each([
    [rule({ id: '' }), 'MALFORMED_RULE_VERSION'],
    [rule({ version: 0 }), 'MALFORMED_RULE_VERSION'],
    [rule({ effectiveFrom: 'not-a-date' }), 'MALFORMED_RULE_VERSION'],
    [rule({ effectiveTo: '2025-01-01T00:00:00.000Z' }), 'MALFORMED_RULE_VERSION'],
    [rule({ authorityKind: 'JURISDICTION', authorityId: 'US-NY' }), 'MALFORMED_RULE_VERSION'],
  ] as const)('routes malformed candidate data to review', (candidate, code) => {
    expect(resolveEffectiveRuleVersions([candidate], context)).toMatchObject({
      ok: false,
      code,
      manualReviewRequired: true,
    });
  });

  it('routes malformed context to review', () => {
    expect(
      resolveEffectiveRuleVersions([rule()], { ...context, serviceInstant: 'not-a-date' }),
    ).toMatchObject({ ok: false, code: 'MALFORMED_CONTEXT' });
  });

  it('rejects mixed logical rule sets instead of conflating their authority scopes', () => {
    expect(
      resolveEffectiveRuleVersions(
        [rule(), rule({ id: 'other-rule', ruleSetKey: 'billing.modifiers' })],
        context,
      ),
    ).toMatchObject({ ok: false, code: 'MALFORMED_RULE_VERSION' });
  });
});
