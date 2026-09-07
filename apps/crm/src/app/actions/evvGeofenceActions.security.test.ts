import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  requireClientAccess: vi.fn(),
  requireStaff: vi.fn(),
  prisma: {
    session: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
  requireStaff: mocks.requireStaff,
}));

import {
  exportStateAggregatorBatch,
  verifySessionEvvGeofence,
} from './evvGeofenceActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ ok: true });
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
});

describe('EVV evidence integrity', () => {
  it('does not substitute benchmark coordinates for missing client-home GPS', async () => {
    mocks.prisma.session.findUnique.mockResolvedValue({
      id: SESSION_ID,
      clientId: '22222222-2222-4222-8222-222222222222',
      client: {},
      evvLogs: [{
        clockInLat: 40.6782,
        clockInLng: -73.9442,
        clockOutLat: 40.6782,
        clockOutLng: -73.9442,
      }],
    });

    const result = await verifySessionEvvGeofence(SESSION_ID);

    expect(result).toMatchObject({
      success: true,
      result: {
        isCompliant: false,
        checkInStatus: 'GPS_UNAVAILABLE',
        checkOutStatus: 'GPS_UNAVAILABLE',
        telemetryNotes: ['Client home GPS coordinates not recorded in chart.'],
      },
    });
  });

  it('blocks an export when required durable evidence is missing', async () => {
    mocks.prisma.session.findMany.mockResolvedValue([{
      id: SESSION_ID,
      client: { medicaidId: null, memberId: null },
      rbt: { credentials: [] },
      evvLogs: [],
      actualStart: null,
      actualEnd: null,
      cptCode: null,
      placeOfServiceCode: null,
      scheduledStart: new Date('2026-09-01T13:00:00.000Z'),
    }]);

    const result = await exportStateAggregatorBatch([SESSION_ID]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('missing durable Medicaid ID');
    expect(result.records).toBeUndefined();
  });

  it('exports only real evidence and preserves valid zero coordinates', async () => {
    mocks.prisma.session.findMany.mockResolvedValue([{
      id: SESSION_ID,
      client: { medicaidId: 'MED-123', memberId: null },
      rbt: {
        credentials: [{
          credentialType: 'NPI',
          credentialNumber: '1234567890',
          isCredentialed: true,
          expirationDate: null,
        }],
      },
      evvLogs: [{
        clockInLat: 0,
        clockInLng: 0,
        clockOutTimestamp: new Date('2026-09-01T14:00:00.000Z'),
      }],
      scheduledStart: new Date('2026-09-01T13:00:00.000Z'),
      actualStart: new Date('2026-09-01T13:05:00.000Z'),
      actualEnd: new Date('2026-09-01T14:00:00.000Z'),
      cptCode: '97153',
      placeOfServiceCode: '12',
    }]);

    const result = await exportStateAggregatorBatch([SESSION_ID]);

    expect(result).toMatchObject({
      success: true,
      records: [{
        clientMedicaidId: 'MED-123',
        staffNpi: '1234567890',
        checkInTimeUtc: '2026-09-01T13:05:00.000Z',
        checkOutTimeUtc: '2026-09-01T14:00:00.000Z',
        verifiedGpsLat: 0,
        verifiedGpsLng: 0,
      }],
    });
  });
});
