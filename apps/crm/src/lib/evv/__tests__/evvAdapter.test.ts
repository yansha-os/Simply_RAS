import { describe, expect, it } from 'vitest';
import type { CuresActEvvPayload } from '../evvAggregatorTypes';
import { formatHhaExchangePayload, submitToHhaExchange } from '../hhaExchangeAdapter';
import { formatSandataPayload, submitToSandata } from '../sandataAdapter';

const mockEvvPayload: CuresActEvvPayload = {
  evvLogId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  providerNpi: '1234567890',
  clientMedicaidId: '987654321',
  staffId: '33333333-3333-4333-8333-333333333333',
  cptCode: '97153',
  placeOfServiceCode: '12',
  clockIn: {
    latitude: 25.7617,
    longitude: -80.1918,
    timestamp: '2026-08-16T14:00:00.000Z',
  },
  clockOut: {
    latitude: 25.7617,
    longitude: -80.1918,
    timestamp: '2026-08-16T15:00:00.000Z',
  },
  billableUnits: 4,
  vendor: 'HHAEXCHANGE',
};

describe('State EVV Aggregator Adapters', () => {
  it('formats HHAeXchange payload correctly according to Cures Act JSON spec', () => {
    const formatted = formatHhaExchangePayload(mockEvvPayload);
    expect(formatted.Header.SenderID).toBe('1234567890');
    expect(formatted.Visit.ClientMedicaidID).toBe('987654321');
    expect(formatted.Visit.ProcedureCode).toBe('97153');
    expect(formatted.Visit.Units).toBe(4);
  });

  it('submits successfully to HHAeXchange when Medicaid ID & NPI are present', async () => {
    const res = await submitToHhaExchange(mockEvvPayload);
    expect(res.success).toBe(true);
    expect(res.vendor).toBe('HHAEXCHANGE');
    expect(res.responseId).toContain('HHA-');
  });

  it('formats Sandata payload correctly according to Open EVV spec', () => {
    const formatted = formatSandataPayload(mockEvvPayload);
    expect(formatted.BusinessEntityID).toBe('1234567890');
    expect(formatted.PatientMedicaidID).toBe('987654321');
    expect(formatted.VisitCalls.length).toBe(2);
  });

  it('submits successfully to Sandata when Medicaid ID & NPI are present', async () => {
    const res = await submitToSandata(mockEvvPayload);
    expect(res.success).toBe(true);
    expect(res.vendor).toBe('SANDATA');
    expect(res.responseId).toContain('SAN-');
  });
});
