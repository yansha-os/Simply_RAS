import { describe, expect, it } from 'vitest';
import {
  calculateHaversineDistanceFeet,
  evaluateEvvSessionGeofence,
  formatStateAggregatorPayload,
} from '../evvGeofenceEngine';

describe('calculateHaversineDistanceFeet', () => {
  it('calculates distance between close points accurately', () => {
    // Brooklyn location (~300 ft apart)
    const home = { latitude: 40.6782, longitude: -73.9442 };
    const nearby = { latitude: 40.6788, longitude: -73.9442 };

    const distance = calculateHaversineDistanceFeet(home, nearby);
    expect(distance).toBeGreaterThan(150);
    expect(distance).toBeLessThan(350);
  });

  it('returns 0 for identical coordinates', () => {
    const p1 = { latitude: 40.7128, longitude: -74.006 };
    expect(calculateHaversineDistanceFeet(p1, p1)).toBe(0);
  });
});

describe('evaluateEvvSessionGeofence', () => {
  const clientHome = { latitude: 40.6782, longitude: -73.9442 };

  it('marks compliant when check-in is within 500ft radius', () => {
    const checkIn = { latitude: 40.6784, longitude: -73.9442 }; // ~70 ft away
    const checkOut = { latitude: 40.6783, longitude: -73.9442 }; // ~35 ft away

    const result = evaluateEvvSessionGeofence({
      sessionId: 'sess-1',
      clientHomeGps: clientHome,
      checkInGps: checkIn,
      checkOutGps: checkOut,
      maxRadiusFeet: 500,
    });

    expect(result.isCompliant).toBe(true);
    expect(result.checkInStatus).toBe('VERIFIED_WITHIN_GEOFENCE');
    expect(result.checkOutStatus).toBe('VERIFIED_WITHIN_GEOFENCE');
    expect(result.checkInDistanceFeet).toBeLessThan(500);
  });

  it('flags session when check-in is outside geofence radius', () => {
    const farAway = { latitude: 40.7589, longitude: -73.9851 }; // Times Square (~6 miles away)

    const result = evaluateEvvSessionGeofence({
      sessionId: 'sess-2',
      clientHomeGps: clientHome,
      checkInGps: farAway,
      maxRadiusFeet: 500,
    });

    expect(result.isCompliant).toBe(false);
    expect(result.checkInStatus).toBe('OUTSIDE_GEOFENCE_FLAGGED');
    expect(result.checkInDistanceFeet).toBeGreaterThan(5000);
  });
});

describe('formatStateAggregatorPayload', () => {
  it('formats payload matching 21st Century Cures Act specifications', () => {
    const payload = formatStateAggregatorPayload({
      recordId: 'evv-rec-1',
      clientMedicaidId: 'NY-MED-881920',
      staffNpi: '1982736451',
      scheduledStart: '2026-06-10T09:00:00Z',
      actualStart: '2026-06-10T09:02:00Z',
      actualEnd: '2026-06-10T11:01:00Z',
      cptCode: '97153',
      placeOfServiceCode: '12',
      checkInGps: { latitude: 40.6782, longitude: -73.9442 },
      aggregatorFormat: 'HHA_EXCHANGE',
    });

    expect(payload.recordId).toBe('evv-rec-1');
    expect(payload.clientMedicaidId).toBe('NY-MED-881920');
    expect(payload.staffNpi).toBe('1982736451');
    expect(payload.serviceType).toBe('97153');
    expect(payload.placeOfServiceCode).toBe('12');
    expect(payload.verifiedGpsLat).toBe(40.6782);
    expect(payload.aggregatorFormat).toBe('HHA_EXCHANGE');
  });
});
