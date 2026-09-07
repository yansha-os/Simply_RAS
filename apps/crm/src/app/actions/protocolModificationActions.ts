'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
import type { ProtocolModificationNotePayload } from '@/lib/protocolModificationEngine';

export async function submitProtocolModificationNote(
  _sessionId: string,
  _payload: ProtocolModificationNotePayload
): Promise<{
  success: boolean;
  units?: number;
  error?: string;
}> {
  void _sessionId;
  void _payload;
  const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'BCBA']);
  if (!gate.ok) {
    return { success: false, error: gate.error };
  }

  // Isolated prototype: CRM must not auto-complete sessions or set bcbaSigned.
  // Session Studio (HRM) owns note delivery and attestation.
  return {
    success: false,
    error:
      'Protocol modification drafts are isolated. Submit 97155 notes through HRM Session Studio — CRM will not auto-complete or auto-sign notes.',
  };
}

export async function getClientProtocolModifications(clientId: string): Promise<{
  success: boolean;
  modifications?: Array<{
    sessionId: string;
    date: string;
    bcbaName: string;
    modality: string;
    rbtName: string | null;
    fidelityScore: number | null;
    modificationsCount: number;
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

    const sessions = await prisma.session.findMany({
      where: {
        clientId,
        cptCode: '97155',
        status: 'COMPLETED',
      },
      include: {
        bcba: { select: { firstName: true, lastName: true } },
        note: true,
      },
      orderBy: { scheduledStart: 'desc' },
      take: 30,
    });

    const modifications = sessions.map((s) => {
      const raw = s.note?.structuredContent as Record<string, unknown> | null;
      const rbtSupervision = raw?.rbtSupervision as Record<string, unknown> | null;
      const protocolMods = Array.isArray(raw?.protocolModifications) ? raw.protocolModifications : [];

      return {
        sessionId: s.id,
        date: s.scheduledStart.toISOString().split('T')[0],
        bcbaName: s.bcba ? `${s.bcba.firstName} ${s.bcba.lastName}` : s.note?.bcbaSignerName || 'BCBA',
        modality: String(raw?.modality || 'CONCURRENT_WITH_RBT'),
        rbtName: typeof rbtSupervision?.rbtName === 'string' ? rbtSupervision.rbtName : null,
        fidelityScore: typeof rbtSupervision?.proceduralFidelityScore === 'number' ? rbtSupervision.proceduralFidelityScore : null,
        modificationsCount: protocolMods.length,
      };
    });

    return {
      success: true,
      modifications,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load protocol modifications.',
    };
  }
}
