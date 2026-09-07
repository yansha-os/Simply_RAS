import { describe, expect, it } from 'vitest';
import {
  computeAuthCptLedger,
  normalizeCptCode,
  type RawAuthInput,
  type RawSessionInput,
} from '../authCptLedger';

describe('normalizeCptCode', () => {
  it('normalizes CPT string formatting', () => {
    expect(normalizeCptCode(' 97153 ')).toBe('97153');
    expect(normalizeCptCode('97151')).toBe('97151');
    expect(normalizeCptCode(null)).toBe('');
    expect(normalizeCptCode(undefined)).toBe('');
  });
});

describe('computeAuthCptLedger', () => {
  const baseAuth: RawAuthInput = {
    id: 'auth-123',
    type: 'TREATMENT',
    status: 'APPROVED',
    authNumber: 'AUTH-2026-ABA',
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-06-30T23:59:59.000Z',
    cptCodes: [
      { code: '97153', unitsApproved: 400 },
      { code: '97155', unitsApproved: 40 },
      { code: '97156', unitsApproved: 24 },
    ],
  };

  it('calculates accurate multi-CPT balances and utilization rates', () => {
    const sessions: RawSessionInput[] = [
      {
        id: 's-1',
        cptCode: '97153',
        status: 'COMPLETED',
        scheduledStart: '2026-01-10T09:00:00.000Z',
        scheduledEnd: '2026-01-10T11:00:00.000Z',
        note: { billableUnits: 8, rbtSigned: true, bcbaSigned: true, isConverted: true },
      },
      {
        id: 's-2',
        cptCode: '97153',
        status: 'COMPLETED',
        scheduledStart: '2026-01-11T09:00:00.000Z',
        scheduledEnd: '2026-01-11T11:00:00.000Z',
        note: { billableUnits: 8, rbtSigned: true, bcbaSigned: true, isConverted: false },
      },
      {
        id: 's-3',
        cptCode: '97155',
        status: 'COMPLETED',
        scheduledStart: '2026-01-11T10:00:00.000Z',
        scheduledEnd: '2026-01-11T11:00:00.000Z',
        note: { billableUnits: 4, rbtSigned: false, bcbaSigned: true, isConverted: false },
      },
      {
        id: 's-4',
        cptCode: '97153',
        status: 'SCHEDULED',
        scheduledStart: '2026-01-15T09:00:00.000Z',
        scheduledEnd: '2026-01-15T11:00:00.000Z',
      },
    ];

    const asOf = new Date('2026-01-20T00:00:00.000Z');
    const ledger = computeAuthCptLedger(baseAuth, sessions, asOf);

    expect(ledger.totalAuthorizedUnits).toBe(464);
    expect(ledger.totalRenderedUnits).toBe(16);
    expect(ledger.totalRemainingUnits).toBe(448);

    const line97153 = ledger.cptLines.find((l) => l.cptCode === '97153')!;
    expect(line97153.authorizedUnits).toBe(400);
    expect(line97153.renderedUnits).toBe(16);
    expect(line97153.convertedUnits).toBe(8);
    expect(line97153.scheduledUnits).toBe(8);
    expect(line97153.remainingUnits).toBe(384);
    expect(line97153.weeklyBurnRateUnits).toBeGreaterThan(0);

    const line97155 = ledger.cptLines.find((l) => l.cptCode === '97155')!;
    expect(line97155.renderedUnits).toBe(0);
    expect(line97155.remainingUnits).toBe(40);
  });

  it('triggers critical exhaustion alert and hard stop when units reach 0', () => {
    const sessions: RawSessionInput[] = [
      {
        id: 's-1',
        cptCode: '97156',
        status: 'COMPLETED',
        scheduledStart: '2026-01-10T09:00:00.000Z',
        scheduledEnd: '2026-01-10T15:00:00.000Z',
        note: { billableUnits: 24, rbtSigned: true, bcbaSigned: true },
      },
    ];

    const ledger = computeAuthCptLedger(baseAuth, sessions, new Date('2026-01-15T00:00:00.000Z'));
    const line97156 = ledger.cptLines.find((l) => l.cptCode === '97156')!;
    expect(line97156.remainingUnits).toBe(0);
    expect(line97156.utilizationHealth).toBe('EXHAUSTED');

    const alert = ledger.alerts.find((a) => a.kind === 'EXHAUSTION_HARD_STOP');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('CRITICAL');
  });

  it('triggers T-45 re-auth window alert between 45 and 30 days', () => {
    const authT45: RawAuthInput = {
      ...baseAuth,
      endDate: '2026-02-20T00:00:00.000Z',
    };

    const asOf = new Date('2026-01-20T00:00:00.000Z');
    const ledger = computeAuthCptLedger(authT45, [], asOf);

    expect(ledger.daysRemaining).toBe(31);
    expect(ledger.reAuthRecommended).toBe(true);

    const alert = ledger.alerts.find((a) => a.kind === 'RE_AUTH_T45_WINDOW');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('WARNING');
  });

  it('triggers 30-day urgent expiring alert and re-auth recommendation', () => {
    const authExpiringSoon: RawAuthInput = {
      ...baseAuth,
      endDate: '2026-01-25T00:00:00.000Z',
    };

    const asOf = new Date('2026-01-10T00:00:00.000Z');
    const ledger = computeAuthCptLedger(authExpiringSoon, [], asOf);

    expect(ledger.daysRemaining).toBe(15);
    expect(ledger.reAuthRecommended).toBe(true);

    const alert = ledger.alerts.find((a) => a.kind === 'EXPIRING_URGENT_30_DAYS');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('CRITICAL');
  });

  it('handles empty sessions and null auth lines defensively', () => {
    const emptyAuth: RawAuthInput = {
      id: 'empty-auth',
      type: 'TREATMENT',
      unitsApproved: null,
      cptCodes: undefined,
    };

    const ledger = computeAuthCptLedger(emptyAuth, []);
    expect(ledger.totalAuthorizedUnits).toBe(0);
    expect(ledger.totalRenderedUnits).toBe(0);
    expect(ledger.cptLines.length).toBeGreaterThan(0);
    expect(ledger.alerts.length).toBe(0);
  });

  it('does not attribute aggregate authorization units to a fabricated CPT code', () => {
    const ledger = computeAuthCptLedger({
      id: 'aggregate-auth',
      type: 'TREATMENT',
      status: 'APPROVED',
      unitsApproved: 120,
    }, []);

    expect(ledger.cptLines).toHaveLength(1);
    expect(ledger.cptLines[0]).toMatchObject({
      cptCode: 'UNATTRIBUTED',
      authorizedUnits: 120,
      renderedUnits: 0,
    });
  });

  it('does not estimate rendered units from scheduled time without signed note evidence', () => {
    const ledger = computeAuthCptLedger(baseAuth, [{
      id: 'missing-evidence',
      cptCode: '97153',
      status: 'COMPLETED',
      scheduledStart: '2026-01-10T09:00:00.000Z',
      scheduledEnd: '2026-01-10T11:00:00.000Z',
      actualStart: null,
      actualEnd: null,
      note: null,
    }], new Date('2026-01-20T00:00:00.000Z'));

    expect(ledger.cptLines.find((line) => line.cptCode === '97153')?.renderedUnits).toBe(0);
  });
});
