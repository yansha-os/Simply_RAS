'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
import {
  evaluateEvvSessionGeofence,
  formatStateAggregatorPayload,
  type EvvVerificationResult,
  type StateAggregatorEvvRecord,
} from '@/lib/evvGeofenceEngine';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function verifySessionEvvGeofence(sessionId: string): Promise<{
  success: boolean;
  result?: EvvVerificationResult;
  error?: string;
}> {
  try {
    const gate = await requireStaff();
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    if (!UUID_RE.test(sessionId)) {
      return { success: false, error: 'Session ID is required.' };
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        client: true,
        evvLogs: {
          orderBy: { clockInTimestamp: 'asc' },
        },
      },
    });

    if (!session) {
      return { success: false, error: 'Session not found.' };
    }

    const access = await requireClientAccess(session.clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    const firstEvvLog = session.evvLogs[0] || null;

    const checkInGps = firstEvvLog && typeof firstEvvLog.clockInLat === 'number' && typeof firstEvvLog.clockInLng === 'number'
      ? { latitude: firstEvvLog.clockInLat, longitude: firstEvvLog.clockInLng }
      : null;

    const checkOutGps = firstEvvLog && typeof firstEvvLog.clockOutLat === 'number' && typeof firstEvvLog.clockOutLng === 'number'
      ? { latitude: firstEvvLog.clockOutLat, longitude: firstEvvLog.clockOutLng }
      : null;

    const result = evaluateEvvSessionGeofence({
      sessionId,
      // Client address geocoding is not yet a durable chart field. Never use
      // clinic or borough benchmark coordinates as client-home evidence.
      clientHomeGps: null,
      checkInGps,
      checkOutGps,
      maxRadiusFeet: 500,
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify session EVV geofence.',
    };
  }
}

export async function exportStateAggregatorBatch(sessionIds: string[]): Promise<{
  success: boolean;
  records?: StateAggregatorEvvRecord[];
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'BILLING', 'OPS_DIRECTOR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }
    const uniqueSessionIds = [...new Set(sessionIds)];
    if (
      uniqueSessionIds.length === 0 ||
      uniqueSessionIds.length > 500 ||
      uniqueSessionIds.some((id) => !UUID_RE.test(id))
    ) {
      return { success: false, error: 'Provide between 1 and 500 valid session IDs.' };
    }

    const sessions = await prisma.session.findMany({
      where: { id: { in: uniqueSessionIds } },
      include: {
        client: true,
        rbt: {
          include: { credentials: true },
        },
        evvLogs: {
          orderBy: { clockInTimestamp: 'asc' },
        },
      },
    });
    if (sessions.length !== uniqueSessionIds.length) {
      return { success: false, error: 'One or more requested sessions were not found.' };
    }

    const records: StateAggregatorEvvRecord[] = [];
    for (const s of sessions) {
      const firstLog = s.evvLogs[0] || null;
      const now = Date.now();
      const npiCred = s.rbt?.credentials.find(
        (c) =>
          c.credentialType === 'NPI' &&
          c.isCredentialed &&
          (!c.expirationDate || c.expirationDate.getTime() >= now) &&
          Boolean(c.credentialNumber?.trim())
      );
      const clientMedicaidId = (s.client.medicaidId || s.client.memberId)?.trim();
      const staffNpi = npiCred?.credentialNumber?.trim();
      const hasClockInCoordinates =
        typeof firstLog?.clockInLat === 'number' &&
        Number.isFinite(firstLog.clockInLat) &&
        typeof firstLog.clockInLng === 'number' &&
        Number.isFinite(firstLog.clockInLng);
      if (
        !clientMedicaidId ||
        !staffNpi ||
        !s.actualStart ||
        !s.actualEnd ||
        !s.cptCode ||
        !s.placeOfServiceCode ||
        !firstLog?.clockOutTimestamp ||
        !hasClockInCoordinates
      ) {
        return {
          success: false,
          error: 'EVV export blocked: one or more sessions are missing durable Medicaid ID, active NPI, actual times, CPT/POS, completed clock-out, or check-in GPS evidence.',
        };
      }

      records.push(formatStateAggregatorPayload({
        recordId: s.id,
        clientMedicaidId,
        staffNpi,
        scheduledStart: s.scheduledStart,
        actualStart: s.actualStart,
        actualEnd: s.actualEnd,
        cptCode: s.cptCode,
        placeOfServiceCode: s.placeOfServiceCode,
        checkInGps: {
          latitude: firstLog.clockInLat!,
          longitude: firstLog.clockInLng!,
        },
        aggregatorFormat: 'HHA_EXCHANGE',
      }));
    }

    return {
      success: true,
      records,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export state EVV aggregator batch.',
    };
  }
}
