/**
 * EVV geofence distance helper (prototype).
 *
 * Computes Haversine distance for attendance evidence review.
 * This does NOT prove Cures Act EVV compliance or submit to Sandata/HHAeXchange.
 */

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
}

export interface EvvVerificationResult {
  sessionId: string;
  isCompliant: boolean;
  geofenceRadiusFeet: number;
  checkInDistanceFeet: number | null;
  checkOutDistanceFeet: number | null;
  checkInStatus: 'VERIFIED_WITHIN_GEOFENCE' | 'OUTSIDE_GEOFENCE_FLAGGED' | 'GPS_UNAVAILABLE';
  checkOutStatus: 'VERIFIED_WITHIN_GEOFENCE' | 'OUTSIDE_GEOFENCE_FLAGGED' | 'GPS_UNAVAILABLE';
  telemetryNotes: string[];
}

export interface StateAggregatorEvvRecord {
  recordId: string;
  serviceType: string;
  clientMedicaidId: string;
  staffNpi: string;
  dateOfService: string;
  checkInTimeUtc: string;
  checkOutTimeUtc: string;
  placeOfServiceCode: string;
  verifiedGpsLat: number;
  verifiedGpsLng: number;
  aggregatorFormat: 'SANDATA' | 'HHA_EXCHANGE' | 'EMEDNY_GENERIC';
}

/**
 * Computes the distance in feet between two coordinate points using the Haversine formula
 */
export function calculateHaversineDistanceFeet(coord1: GpsCoordinates, coord2: GpsCoordinates): number {
  if (
    !Number.isFinite(coord1.latitude) ||
    !Number.isFinite(coord1.longitude) ||
    !Number.isFinite(coord2.latitude) ||
    !Number.isFinite(coord2.longitude)
  ) {
    return Infinity;
  }

  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const lat1 = toRad(coord1.latitude);
  const lat2 = toRad(coord2.latitude);
  const deltaLat = toRad(coord2.latitude - coord1.latitude);
  const deltaLng = toRad(coord2.longitude - coord1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const meters = R * c;

  const FEET_PER_METER = 3.28084;
  return Math.round(meters * FEET_PER_METER);
}

/**
 * Evaluates EVV check-in and check-out telemetry against client home coordinates
 */
export function evaluateEvvSessionGeofence(params: {
  sessionId: string;
  clientHomeGps?: GpsCoordinates | null;
  checkInGps?: GpsCoordinates | null;
  checkOutGps?: GpsCoordinates | null;
  maxRadiusFeet?: number;
}): EvvVerificationResult {
  const { sessionId, clientHomeGps, checkInGps, checkOutGps, maxRadiusFeet = 500 } = params;

  const telemetryNotes: string[] = [];

  if (!clientHomeGps) {
    return {
      sessionId,
      isCompliant: false,
      geofenceRadiusFeet: maxRadiusFeet,
      checkInDistanceFeet: null,
      checkOutDistanceFeet: null,
      checkInStatus: 'GPS_UNAVAILABLE',
      checkOutStatus: 'GPS_UNAVAILABLE',
      telemetryNotes: ['Client home GPS coordinates not recorded in chart.'],
    };
  }

  let checkInDistance: number | null = null;
  let checkInStatus: EvvVerificationResult['checkInStatus'] = 'GPS_UNAVAILABLE';

  if (checkInGps) {
    checkInDistance = calculateHaversineDistanceFeet(clientHomeGps, checkInGps);
    if (checkInDistance <= maxRadiusFeet) {
      checkInStatus = 'VERIFIED_WITHIN_GEOFENCE';
      telemetryNotes.push(`Check-in verified (${checkInDistance} ft from client home).`);
    } else {
      checkInStatus = 'OUTSIDE_GEOFENCE_FLAGGED';
      telemetryNotes.push(`Check-in flagged: ${checkInDistance} ft from client home (limit: ${maxRadiusFeet} ft).`);
    }
  } else {
    telemetryNotes.push('Check-in GPS coordinates missing.');
  }

  let checkOutDistance: number | null = null;
  let checkOutStatus: EvvVerificationResult['checkOutStatus'] = 'GPS_UNAVAILABLE';

  if (checkOutGps) {
    checkOutDistance = calculateHaversineDistanceFeet(clientHomeGps, checkOutGps);
    if (checkOutDistance <= maxRadiusFeet) {
      checkOutStatus = 'VERIFIED_WITHIN_GEOFENCE';
      telemetryNotes.push(`Check-out verified (${checkOutDistance} ft from client home).`);
    } else {
      checkOutStatus = 'OUTSIDE_GEOFENCE_FLAGGED';
      telemetryNotes.push(`Check-out flagged: ${checkOutDistance} ft from client home (limit: ${maxRadiusFeet} ft).`);
    }
  } else {
    telemetryNotes.push('Check-out GPS coordinates missing.');
  }

  const isCompliant =
    checkInStatus === 'VERIFIED_WITHIN_GEOFENCE' &&
    (checkOutStatus === 'VERIFIED_WITHIN_GEOFENCE' || checkOutStatus === 'GPS_UNAVAILABLE');

  return {
    sessionId,
    isCompliant,
    geofenceRadiusFeet: maxRadiusFeet,
    checkInDistanceFeet: checkInDistance,
    checkOutDistanceFeet: checkOutDistance,
    checkInStatus,
    checkOutStatus,
    telemetryNotes,
  };
}

/**
 * Formats a verified EVV record for state aggregator transmission
 */
export function formatStateAggregatorPayload(params: {
  recordId: string;
  clientMedicaidId: string;
  staffNpi: string;
  scheduledStart: Date | string;
  actualStart: Date | string;
  actualEnd: Date | string;
  cptCode?: string | null;
  placeOfServiceCode?: string | null;
  checkInGps: GpsCoordinates;
  aggregatorFormat?: 'SANDATA' | 'HHA_EXCHANGE' | 'EMEDNY_GENERIC';
}): StateAggregatorEvvRecord {
  const {
    recordId,
    clientMedicaidId,
    staffNpi,
    actualStart,
    actualEnd,
    cptCode = '97153',
    placeOfServiceCode = '12',
    checkInGps,
    aggregatorFormat = 'HHA_EXCHANGE',
  } = params;

  const startUtc = new Date(actualStart).toISOString();
  const endUtc = new Date(actualEnd).toISOString();
  const dos = startUtc.split('T')[0];

  return {
    recordId,
    serviceType: cptCode || '97153',
    clientMedicaidId,
    staffNpi,
    dateOfService: dos,
    checkInTimeUtc: startUtc,
    checkOutTimeUtc: endUtc,
    placeOfServiceCode: placeOfServiceCode || '12',
    verifiedGpsLat: checkInGps.latitude,
    verifiedGpsLng: checkInGps.longitude,
    aggregatorFormat,
  };
}
