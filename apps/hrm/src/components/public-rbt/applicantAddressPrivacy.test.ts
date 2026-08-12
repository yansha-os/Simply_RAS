import { describe, expect, it } from 'vitest';

import { resolvePrivateApplicantLocation } from './applicantAddressPrivacy';

describe('resolvePrivateApplicantLocation', () => {
  it('derives a borough from ZIP locally without an outbound URL or coordinates', () => {
    expect(resolvePrivateApplicantLocation('11201')).toEqual({
      status: 'ZIP_ONLY',
      precision: 'ZIP',
      postalCode: '11201',
      borough: 'Brooklyn',
      coordinates: null,
      outboundUrl: null,
      logMetadata: {
        eventCode: 'APPLICANT_LOCATION_ZIP_ONLY',
        precision: 'ZIP',
      },
    });
  });

  it('keeps the ZIP and street-address fragments out of log-safe sinks', () => {
    const result = resolvePrivateApplicantLocation('11201');
    const safeSinks = JSON.stringify({
      outboundUrl: result.outboundUrl,
      logMetadata: result.logMetadata,
    });

    expect(safeSinks).not.toContain('11201');
    expect(safeSinks).not.toContain('742 Evergreen Terrace');
  });

  it('keeps a valid non-NYC ZIP without inventing a borough', () => {
    expect(resolvePrivateApplicantLocation('07030')).toMatchObject({
      status: 'ZIP_ONLY',
      postalCode: '07030',
      borough: null,
      coordinates: null,
      outboundUrl: null,
    });
  });

  it('reduces ZIP+4 input to five-digit ZIP precision', () => {
    expect(resolvePrivateApplicantLocation('10001-1234')).toMatchObject({
      status: 'ZIP_ONLY',
      postalCode: '10001',
      borough: 'Manhattan',
    });
  });

  it('returns an honest unavailable result for an invalid ZIP', () => {
    expect(resolvePrivateApplicantLocation('New York')).toEqual({
      status: 'UNAVAILABLE',
      precision: 'NONE',
      postalCode: null,
      borough: null,
      coordinates: null,
      outboundUrl: null,
      logMetadata: {
        eventCode: 'APPLICANT_LOCATION_UNAVAILABLE',
        precision: 'NONE',
      },
    });
  });
});
