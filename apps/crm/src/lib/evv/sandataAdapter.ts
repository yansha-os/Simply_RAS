import type { CuresActEvvPayload, EvvSubmissionResult } from './evvAggregatorTypes';

/**
 * Sandata Open EVV adapter — PROTOTYPE ONLY.
 * Returns synthetic SAN-* response IDs. Do not treat as live aggregator submission.
 */

function isValidCoordinate(lat?: number, lng?: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function formatSandataPayload(payload: CuresActEvvPayload) {
  const clockInLat = isValidCoordinate(payload?.clockIn?.latitude, payload?.clockIn?.longitude)
    ? payload.clockIn.latitude
    : 0;
  const clockInLng = isValidCoordinate(payload?.clockIn?.latitude, payload?.clockIn?.longitude)
    ? payload.clockIn.longitude
    : 0;
  const clockOutLat = isValidCoordinate(payload?.clockOut?.latitude, payload?.clockOut?.longitude)
    ? payload.clockOut.latitude
    : 0;
  const clockOutLng = isValidCoordinate(payload?.clockOut?.latitude, payload?.clockOut?.longitude)
    ? payload.clockOut.longitude
    : 0;

  return {
    BusinessEntityID: payload?.providerNpi || '',
    PatientMedicaidID: payload?.clientMedicaidId || '',
    StaffOtherID: payload?.staffId || '',
    ServiceCode: payload?.cptCode || '97153',
    VisitOtherID: payload?.evvLogId || '',
    VisitCalls: [
      {
        CallDateTime: payload?.clockIn?.timestamp || new Date().toISOString(),
        CallAssignment: 'VISIT_START',
        CallLatitude: clockInLat,
        CallLongitude: clockInLng,
      },
      {
        CallDateTime: payload?.clockOut?.timestamp || new Date().toISOString(),
        CallAssignment: 'VISIT_END',
        CallLatitude: clockOutLat,
        CallLongitude: clockOutLng,
      },
    ],
  };
}

export async function submitToSandata(
  payload: CuresActEvvPayload
): Promise<EvvSubmissionResult> {
  const nowIso = new Date().toISOString();

  if (!payload || !payload.clientMedicaidId || !payload.providerNpi || !payload.evvLogId) {
    return {
      success: false,
      vendor: 'SANDATA',
      errorMessage: 'Missing Client Medicaid ID, Provider NPI, or EVV Log ID for Sandata submission.',
      submittedAt: nowIso,
    };
  }

  const logIdPrefix = (payload.evvLogId || 'unknown').slice(0, 8);

  return {
    success: true,
    vendor: 'SANDATA',
    responseId: `SAN-${logIdPrefix}-${Date.now()}`,
    submittedAt: nowIso,
  };
}
