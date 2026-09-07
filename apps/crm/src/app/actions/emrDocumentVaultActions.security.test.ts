import { beforeEach, describe, expect, it, vi } from 'vitest';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';
const UPDATED_AT = new Date('2026-09-06T12:00:00.000Z');

const mocks = vi.hoisted(() => ({
  requireClientAccess: vi.fn(),
  requireStaff: vi.fn(),
  revalidatePath: vi.fn(),
  prisma: {
    document: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
  requireStaff: mocks.requireStaff,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import {
  addVaultDocument,
  getClientEmrDocumentVault,
  verifyVaultDocument,
} from './emrDocumentVaultActions';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue({ ok: true });
  mocks.requireClientAccess.mockResolvedValue({ ok: true });
});

describe('EMR document vault security', () => {
  it('does not return arbitrary legacy URLs as previewable PHI', async () => {
    mocks.prisma.document.findMany.mockResolvedValue([{
      id: DOCUMENT_ID,
      clientId: CLIENT_ID,
      type: 'DIAGNOSTIC_EVAL',
      fileUrl: 'https://public.example.test/client-evaluation.pdf',
      expirationDate: null,
      isVerified: true,
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
    }]);

    const result = await getClientEmrDocumentVault(CLIENT_ID);

    expect(result.success).toBe(true);
    expect(result.vaultSummary?.categories.DIAGNOSTIC_AND_MEDICAL[0].fileUrl).toBeNull();
    expect(result.vaultSummary?.hasDiagnosticEval).toBe(false);
  });

  it('verifies with client-scoped compare-and-set semantics', async () => {
    mocks.prisma.document.findUnique.mockResolvedValue({
      id: DOCUMENT_ID,
      clientId: CLIENT_ID,
      isVerified: false,
      updatedAt: UPDATED_AT,
    });
    mocks.prisma.document.updateMany.mockResolvedValue({ count: 1 });

    const result = await verifyVaultDocument(DOCUMENT_ID);

    expect(result).toEqual({ success: true });
    expect(mocks.prisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: DOCUMENT_ID,
        clientId: CLIENT_ID,
        isVerified: false,
        updatedAt: UPDATED_AT,
      },
      data: { isVerified: true },
    });
  });

  it('rejects a secure-route URL belonging to another client', async () => {
    const fileUrl =
      `/api/documents?clientId=${OTHER_CLIENT_ID}` +
      `&path=${encodeURIComponent(`${OTHER_CLIENT_ID}/evaluation.pdf`)}`;

    const result = await addVaultDocument({
      clientId: CLIENT_ID,
      type: 'DIAGNOSTIC_EVAL',
      fileUrl,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('this client’s secure vault');
    expect(mocks.prisma.document.create).not.toHaveBeenCalled();
  });
});
