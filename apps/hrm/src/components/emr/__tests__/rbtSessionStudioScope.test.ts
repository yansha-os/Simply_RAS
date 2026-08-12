import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const studioSource = readFileSync(
  new URL('../RbtSessionStudio.tsx', import.meta.url),
  'utf8'
);
const checklistSource = readFileSync(
  new URL('../SessionClaimReadyPanel.tsx', import.meta.url),
  'utf8'
);

describe('RBT Session Studio clinical scope copy', () => {
  it('does not expose 97155 or synthetic claim outcomes', () => {
    expect(studioSource).not.toContain('97155 Protocol Modification');
    expect(studioSource).not.toMatch(/CLM-|CLAIM_SUBMITTED/);
    expect(studioSource).not.toContain('Submit claim-ready');
    expect(studioSource).not.toContain('Claim-ready ·');
    expect(checklistSource).not.toContain('CLAIM-READY');
  });

  it('presents successful work as documentation awaiting BCBA review', () => {
    expect(studioSource).toContain('DOCUMENTATION_SUBMITTED_MESSAGE');
    expect(studioSource).toContain('Observation saved — BCBA mapping needed.');
  });
});
