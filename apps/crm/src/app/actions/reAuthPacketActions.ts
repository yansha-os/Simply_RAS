'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
import {
  compileReAuthPacketData,
  type ReAuthPacketPayload,
} from '@/lib/reAuthPacketCompiler';

export async function generateReAuthDraft(clientId: string): Promise<{
  success: boolean;
  draft?: ReAuthPacketPayload;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'BCBA', 'BILLING', 'FINANCE']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    if (!clientId) {
      return { success: false, error: 'Client ID is required.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        skillTargets: {
          include: {
            trialLogs: {
              orderBy: { timestamp: 'desc' },
              take: 20,
            },
          },
        },
        behaviorTargets: {
          include: {
            behaviorLogs: {
              orderBy: { timestamp: 'desc' },
              take: 20,
            },
          },
        },
        sessions: {
          orderBy: { scheduledStart: 'desc' },
          take: 50,
          include: {
            note: true,
          },
        },
      },
    });

    if (!client) {
      return { success: false, error: 'Client not found.' };
    }

    // Extract caregiver guidance sessions (97156)
    const caregiverSessions = client.sessions
      .filter((s) => s.cptCode === '97156' && s.status === 'COMPLETED')
      .map((s) => {
        const raw = s.note?.structuredContent as Record<string, unknown> | null;
        return {
          fidelityScore: typeof raw?.caregiverFidelityScore === 'number' ? raw.caregiverFidelityScore : null,
          minutes: typeof raw?.sessionMinutes === 'number' ? raw.sessionMinutes : null,
          bstCompleted: raw?.bstSteps != null,
          goalsMasteredCount: Array.isArray(raw?.goalsAddressed) ? raw.goalsAddressed.length : 0,
        };
      });

    const draft = compileReAuthPacketData({
      client: {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        primaryDiagnosisCode: client.primaryDiagnosisCode,
        secondaryDiagnosisCode: client.secondaryDiagnosisCode,
      },
      skillTargets: client.skillTargets,
      behaviorTargets: client.behaviorTargets,
      caregiverSessions,
      sessions: client.sessions,
    });

    return {
      success: true,
      draft,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate re-auth draft.',
    };
  }
}

export async function saveReAuthPacket(
  clientId: string,
  _payload: ReAuthPacketPayload
): Promise<{
  success: boolean;
  packetId?: string;
  error?: string;
}> {
  void _payload;
  const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'BCBA']);
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }

  if (!clientId) {
    return { success: false, error: 'Client ID is required.' };
  }

  const access = await requireClientAccess(clientId);
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  // Isolated prototype: do not persist until a BCBA-owned workflow owns it.
  return {
    success: false,
    error:
      'Re-auth packet persistence is isolated. Draft generation remains available for review only.',
  };
}

export async function getClientReAuthPackets(clientId: string): Promise<{
  success: boolean;
  packets?: Array<{
    id: string;
    status: string;
    attendancePct: number;
    createdAt: string;
    updatedAt: string;
  }>;
  error?: string;
}> {
  try {
    if (!clientId) {
      return { success: false, error: 'Client ID is required.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    const packets = await prisma.reAuthPacket.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        attendancePct: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      packets: packets.map((p) => ({
        id: p.id,
        status: p.status,
        attendancePct: p.attendancePct,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch client re-auth packets.',
    };
  }
}
