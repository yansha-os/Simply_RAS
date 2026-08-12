import { describe, expect, it } from 'vitest';

import { resolvePrivateIntakeAddress } from '../intakeAddressPrivacy';

describe('resolvePrivateIntakeAddress', () => {
  it('returns a ZIP-only local result without an outbound URL or coordinates', () => {
    const result = resolvePrivateIntakeAddress(
      '742 Evergreen Terrace, Brooklyn, NY 11201'
    );

    expect(result).toMatchObject({
      status: 'ZIP_ONLY',
      precision: 'ZIP',
      postalCode: '11201',
      coordinates: null,
      outboundUrl: null,
      addressParts: {
        street: '742 Evergreen Terrace',
        city: 'Brooklyn',
        state: 'NY',
        zip: '11201',
      },
    });
  });

  it('keeps full address data out of outbound and log-safe metadata', () => {
    const fullAddress = '1600 Sensitive Child Street, Newark, NJ 07102';
    const result = resolvePrivateIntakeAddress(fullAddress);
    const safeSinks = JSON.stringify({
      outboundUrl: result.outboundUrl,
      logMetadata: result.logMetadata,
    });

    expect(safeSinks).not.toContain(fullAddress);
    expect(safeSinks).not.toContain('1600');
    expect(safeSinks).not.toContain('Sensitive Child Street');
    expect(safeSinks).not.toContain('Newark');
    expect(safeSinks).not.toContain('07102');
  });

  it('returns unavailable when no five-digit ZIP can be derived', () => {
    const result = resolvePrivateIntakeAddress(
      '10 Private Lane, Somewhere, New York'
    );

    expect(result).toEqual({
      status: 'UNAVAILABLE',
      precision: 'NONE',
      postalCode: null,
      coordinates: null,
      outboundUrl: null,
      addressParts: null,
      logMetadata: {
        eventCode: 'INTAKE_ADDRESS_LOOKUP_UNAVAILABLE',
        precision: 'NONE',
      },
    });
  });

  it('reduces ZIP+4 input to five-digit ZIP precision', () => {
    const result = resolvePrivateIntakeAddress(
      '1 Privacy Plaza, New York, NY 10001-1234'
    );

    expect(result.status).toBe('ZIP_ONLY');
    expect(result.postalCode).toBe('10001');
    expect(result.addressParts?.zip).toBe('10001');
  });
});
