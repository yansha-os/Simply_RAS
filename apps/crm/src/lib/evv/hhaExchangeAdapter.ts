import type { CuresActEvvPayload, EvvSubmissionResult } from './evvAggregatorTypes';

/**
 * HHAeXchange adapter — PROTOTYPE ONLY.
 * Returns synthetic HHA-* response IDs. Do not treat as live aggregator submission.
 */

function isValidCoordinate(lat?: number, lng?: number): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function formatHhaExchangePayload(payload: CuresActEvvPayload) {
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
    Header: {
      SenderID: payload?.providerNpi || '',
      ReceiverID: 'HHAEXCHANGE',
      TransactionType: 'EVV_VISIT_POST',
    },
    Visit: {
      ProviderNPI: payload?.providerNpi || '',
      ClientMedicaidID: payload?.clientMedicaidId || '',
      StaffNPI: payload?.staffNpi || payload?.staffId || '',
      ProcedureCode: payload?.cptCode || '97153',
      POS: payload?.placeOfServiceCode || '12',
      ClockIn: {
        DateTime: payload?.clockIn?.timestamp || new Date().toISOString(),
        Latitude: clockInLat,
        Longitude: clockInLng,
      },
      ClockOut: {
        DateTime: payload?.clockOut?.timestamp || new Date().toISOString(),
        Latitude: clockOutLat,
        Longitude: clockOutLng,
      },
      Units: Number.isFinite(payload?.billableUnits) ? Math.max(0, payload.billableUnits) : 0,
    },
  };
}

export async function submitToHhaExchange(
  payload: CuresActEvvPayload
): Promise<EvvSubmissionResult> {
  const nowIso = new Date().toISOString();

  if (!payload || !payload.clientMedicaidId || !payload.providerNpi || !payload.evvLogId) {
    return {
      success: false,
      vendor: 'HHAEXCHANGE',
      errorMessage: 'Missing Client Medicaid ID, Provider NPI, or EVV Log ID for HHAeXchange submission.',
      submittedAt: nowIso,
    };
  }

  const logIdPrefix = (payload.evvLogId || 'unknown').slice(0, 8);

  return {
    success: true,
    vendor: 'HHAEXCHANGE',
    responseId: `HHA-${logIdPrefix}-${Date.now()}`,
    submittedAt: nowIso,
  };
}
