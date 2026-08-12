import { describe, expect, it } from 'vitest';
import { describeScheduleCompletion } from './RbtScheduleCompletionStatus';

const rbtSignature = {
  rbtSigned: true,
  rbtSignedAt: '2026-08-12T14:10:00.000Z',
};

const bcbaSignature = {
  ...rbtSignature,
  bcbaSigned: true,
  bcbaSignedAt: '2026-08-12T15:20:00.000Z',
};

const unsupportedClaims = [
  'claims rendered',
  'claim ready',
  'claim submitted',
  'e-signed',
  'bcba verified',
  'payroll released',
  'paid',
];

function expectNoUnsupportedClaims(copy: {
  label: string;
  detail: string;
  reference?: string;
}) {
  const renderedCopy = [copy.label, copy.detail, copy.reference]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  unsupportedClaims.forEach((claim) => {
    expect(renderedCopy).not.toContain(claim);
  });
}

describe('RBT schedule completion status', () => {
  it('keeps a completed Session neutral without SessionNote evidence', () => {
    const copy = describeScheduleCompletion({ status: 'COMPLETED' });

    expect(copy).toMatchObject({
      state: 'SESSION_COMPLETED',
      label: 'Session completed',
      detail: 'Billing and clinical review status are not yet confirmed.',
    });
    expectNoUnsupportedClaims(copy);
  });

  it('treats local documentation status as awaiting BCBA review', () => {
    const copy = describeScheduleCompletion({ status: 'DOCUMENTATION_SUBMITTED' });

    expect(copy).toMatchObject({
      state: 'DOCUMENTATION_SUBMITTED',
      label: 'Documentation submitted',
    });
    expect(copy.detail).toContain('Awaiting BCBA review');
    expect(copy.detail).toContain('not yet confirmed');
    expectNoUnsupportedClaims(copy);
  });

  it('reports only the durable RBT signature while BCBA review is pending', () => {
    const copy = describeScheduleCompletion({
      status: 'DOCUMENTATION_SUBMITTED',
      ...rbtSignature,
      bcbaSigned: false,
      isConverted: false,
    });

    expect(copy).toMatchObject({
      state: 'RBT_SIGNED',
      label: 'Documentation submitted',
    });
    expect(copy.detail).toContain('RBT signature and timestamp are recorded');
    expect(copy.detail).toContain('Awaiting BCBA review');
    expectNoUnsupportedClaims(copy);
  });

  it('does not recognize the removed synthetic claim-submitted state', () => {
    const copy = describeScheduleCompletion({ status: 'CLAIM_SUBMITTED' });

    expect(copy).toMatchObject({
      state: 'UNCONFIRMED',
      label: 'Status not confirmed',
    });
    expectNoUnsupportedClaims(copy);
  });

  it('reports a BCBA co-sign only when its durable timestamp is present', () => {
    const copy = describeScheduleCompletion({
      status: 'COMPLETED',
      ...bcbaSignature,
      isConverted: false,
    });

    expect(copy).toMatchObject({
      state: 'BCBA_SIGNED',
      label: 'BCBA co-sign recorded',
    });
    expect(copy.detail).toContain('signature and timestamp are recorded');
    expect(copy.detail).toContain('Plutus tracker conversion is not confirmed');
    expectNoUnsupportedClaims(copy);
  });

  it('distinguishes a conversion flag with no Plutus reference', () => {
    const copy = describeScheduleCompletion({
      status: 'COMPLETED',
      ...bcbaSignature,
      isConverted: true,
      plutusClaimRef: null,
    });

    expect(copy).toMatchObject({
      state: 'CONVERTED_REFERENCE_MISSING',
      label: 'Plutus conversion recorded',
    });
    expect(copy.detail).toContain('no Plutus reference is available');
    expect(copy.detail).toContain('Claim filing status is not confirmed');
    expectNoUnsupportedClaims(copy);
  });

  it('shows a Plutus reference only with the durable conversion chain', () => {
    const copy = describeScheduleCompletion({
      status: 'COMPLETED',
      ...bcbaSignature,
      isConverted: true,
      plutusClaimRef: ' PLUTUS-837P-1042 ',
    });

    expect(copy).toMatchObject({
      state: 'CONVERTED',
      label: 'Plutus tracker entry recorded',
      reference: 'PLUTUS-837P-1042',
    });
    expect(copy.detail).toContain('not payer submission or payment');
    expectNoUnsupportedClaims(copy);
  });

  it.each([
    {
      name: 'BCBA flag without signer timestamp',
      evidence: {
        status: 'COMPLETED',
        ...rbtSignature,
        bcbaSigned: true,
        bcbaSignedAt: null,
      },
    },
    {
      name: 'Plutus reference without conversion flag',
      evidence: {
        status: 'COMPLETED',
        ...bcbaSignature,
        isConverted: false,
        plutusClaimRef: 'PLUTUS-ORPHANED',
      },
    },
    {
      name: 'unknown local state',
      evidence: { status: 'MYSTERY_STATE' },
    },
  ])('uses unconfirmed copy for $name', ({ evidence }) => {
    const copy = describeScheduleCompletion(evidence);

    expect(copy).toMatchObject({
      state: 'UNCONFIRMED',
      label: 'Status not confirmed',
    });
    expect(copy.detail).toContain('incomplete or inconsistent');
    expect(copy.detail).toContain('not yet confirmed');
    expect(copy.reference).toBeUndefined();
    expectNoUnsupportedClaims(copy);
  });
});
