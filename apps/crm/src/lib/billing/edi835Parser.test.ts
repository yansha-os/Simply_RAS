import { describe, expect, it } from 'vitest';

import { parseX12_835_ERA } from './edi835Parser';

describe('parseX12_835_ERA', () => {
  it('flushes each parsed claim and classifies payment status', () => {
    const result = parseX12_835_ERA(
      ['CLP*claim-1*1*100*100', 'CLP*claim-2*1*100*25'].join('\n')
    );

    expect(result).toEqual([
      {
        claimId: 'claim-1',
        patientName: 'Patient claim-1',
        billedAmount: 100,
        paidAmount: 100,
        status: 'PAID',
      },
      {
        claimId: 'claim-2',
        patientName: 'Patient claim-2',
        billedAmount: 100,
        paidAmount: 25,
        status: 'PARTIAL',
      },
    ]);
  });

  it('attaches a recognized denial reason to the current claim', () => {
    const [claim] = parseX12_835_ERA('CLP*claim-3*1*150*0\nCAS*PR*197*150');

    expect(claim).toMatchObject({
      claimId: 'claim-3',
      status: 'DENIED',
      denialReasonCode: '197',
      denialDescription: 'Precertification/prior authorization/notification absent.',
    });
  });

  it('returns no synthetic claims for empty input', () => {
    expect(parseX12_835_ERA('')).toEqual([]);
  });
});
