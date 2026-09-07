'use server';

import type { DocumentType } from '@repo/db';
import { prisma } from '@/lib/prisma';
import { requireClientAccess, requireStaff } from '@/lib/auth-guard';
import {
  organizeEmrDocumentVault,
  type EmrVaultAuditSummary,
} from '@/lib/emrDocumentVault';
import { getSecureDocument } from '@/lib/secureDocument';
import { revalidatePath } from 'next/cache';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT_TYPES = new Set<DocumentType>([
  'REFERRAL',
  'DIAGNOSTIC_EVAL',
  'PSYCH_EVAL',
  'IEP',
  'INSURANCE_CARD',
  'MEDICAID_CARD',
  'CONSENT',
  'CUSTODY',
  'PRIOR_TREATMENT_PLAN',
  'MEET_AND_GREET_FORM',
  'OTHER',
]);
const VAULT_EDITOR_ROLES = [
  'CEO',
  'CLINICAL_DIRECTOR',
  'INTAKE_PA_COORDINATOR',
  'CASE_COORDINATOR',
  'BCBA',
  'CLINICAL_SUPPORT',
  'BILLING',
] as const;

function secureVaultUrl(fileUrl: string | null | undefined, clientId: string): string | null {
  if (!fileUrl) return null;
  return getSecureDocument({ url: fileUrl }, clientId)?.url ?? null;
}

export async function getClientEmrDocumentVault(clientId: string): Promise<{
  success: boolean;
  vaultSummary?: EmrVaultAuditSummary;
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

    const documents = await prisma.document.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const vaultSummary = organizeEmrDocumentVault(
      documents.map((document) => ({
        ...document,
        fileUrl: secureVaultUrl(document.fileUrl, clientId),
      })),
      now,
    );

    return {
      success: true,
      vaultSummary,
    };
  } catch {
    return {
      success: false,
      error: 'Failed to retrieve client EMR document vault.',
    };
  }
}

export async function verifyVaultDocument(documentId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const gate = await requireStaff(['CEO', 'CLINICAL_DIRECTOR', 'INTAKE_PA_COORDINATOR', 'CASE_COORDINATOR']);
    if (!gate.ok) {
      return { success: false, error: gate.error };
    }

    if (!UUID_RE.test(documentId)) {
      return { success: false, error: 'Document ID is required.' };
    }

    const existing = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, clientId: true, isVerified: true, updatedAt: true },
    });
    if (!existing) {
      return { success: false, error: 'Document not found.' };
    }

    const access = await requireClientAccess(existing.clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    if (existing.isVerified) return { success: true };

    const updated = await prisma.document.updateMany({
      where: {
        id: existing.id,
        clientId: existing.clientId,
        isVerified: false,
        updatedAt: existing.updatedAt,
      },
      data: { isVerified: true },
    });
    if (updated.count !== 1) {
      return { success: false, error: 'The document changed. Refresh and try again.' };
    }

    revalidatePath(`/client/${existing.clientId}`);
    revalidatePath('/portal-clinical');

    return { success: true };
  } catch {
    return {
      success: false,
      error: 'Failed to verify document.',
    };
  }
}

export async function addVaultDocument(params: {
  clientId: string;
  type: DocumentType;
  fileUrl?: string;
  expirationDate?: string;
}): Promise<{
  success: boolean;
  documentId?: string;
  error?: string;
}> {
  const staff = await requireStaff(VAULT_EDITOR_ROLES);
  if (!staff.ok) return { success: false, error: staff.error };

  try {
    if (!UUID_RE.test(params.clientId) || !DOCUMENT_TYPES.has(params.type)) {
      return { success: false, error: 'Valid client and document type are required.' };
    }

    const access = await requireClientAccess(params.clientId);
    if (!access.ok) {
      return { success: false, error: access.error };
    }

    const fileUrl = secureVaultUrl(params.fileUrl, params.clientId);
    if (params.fileUrl && !fileUrl) {
      return { success: false, error: 'Document URL must reference this client’s secure vault.' };
    }
    let expirationDate: Date | null = null;
    if (params.expirationDate) {
      if (!DATE_ONLY_RE.test(params.expirationDate)) {
        return { success: false, error: 'Expiration date must use YYYY-MM-DD.' };
      }
      expirationDate = new Date(`${params.expirationDate}T00:00:00.000Z`);
      if (
        Number.isNaN(expirationDate.getTime()) ||
        expirationDate.toISOString().slice(0, 10) !== params.expirationDate
      ) {
        return { success: false, error: 'Expiration date is invalid.' };
      }
    }

    const doc = await prisma.document.create({
      data: {
        clientId: params.clientId,
        type: params.type,
        fileUrl,
        expirationDate,
        isVerified: false,
      },
    });

    revalidatePath(`/client/${params.clientId}`);
    return { success: true, documentId: doc.id };
  } catch {
    return {
      success: false,
      error: 'Failed to add document to vault.',
    };
  }
}
