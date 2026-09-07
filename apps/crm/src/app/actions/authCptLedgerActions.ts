'use server';

import { prisma } from '@/lib/prisma';
import { requireClientAccess } from '@/lib/auth-guard';
import { computeAuthCptLedger, type AuthCptLedgerSummary } from '@/lib/authCptLedger';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getClientAuthLedgers(clientId: string): Promise<{
  success: boolean;
  ledgers?: AuthCptLedgerSummary[];
  error?: string;
}> {
  try {
    if (!UUID_RE.test(clientId)) {
      return { success: false, error: 'Client ID is required.' };
    }

    const access = await requireClientAccess(clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    const authorizations = await prisma.authorization.findMany({
      where: { clientId },
      include: {
        cptCodes: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const sessions = await prisma.session.findMany({
      where: { clientId },
      include: {
        note: {
          select: {
            billableUnits: true,
            rbtSigned: true,
            bcbaSigned: true,
            isConverted: true,
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    const now = new Date();
    const ledgers: AuthCptLedgerSummary[] = authorizations.map((auth) =>
      computeAuthCptLedger(auth, sessions, now)
    );

    return {
      success: true,
      ledgers,
    };
  } catch {
    return {
      success: false,
      error: 'Failed to retrieve auth CPT ledger.',
    };
  }
}
