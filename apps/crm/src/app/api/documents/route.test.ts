import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  const from = vi.fn(() => ({ createSignedUrl }));
  const admin = { storage: { from } };

  return {
    admin,
    createAdminClient: vi.fn(),
    createSignedUrl,
    from,
    logError: vi.fn(),
    requireClientAccess: vi.fn(),
    requireParentPacketAccess: vi.fn(),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
}));

vi.mock('@/lib/magicLinkGuard', () => ({
  requireParentPacketAccess: mocks.requireParentPacketAccess,
}));

vi.mock('@/lib/logger', () => ({
  logError: mocks.logError,
}));

import { GET } from './route';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_PATH = `${CLIENT_ID}/1712345678901-clinical_eval.pdf`;

function requestFor(path: string): NextRequest {
  return {
    nextUrl: new URL(path, 'https://crm.example.test'),
  } as unknown as NextRequest;
}

function canonicalRequest(path = DOCUMENT_PATH, clientId = CLIENT_ID): NextRequest {
  return requestFor(
    `/api/documents?clientId=${clientId}&path=${encodeURIComponent(path)}`
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockReturnValue(mocks.admin);
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://storage.example.test/signed-document' },
    error: null,
  });
  mocks.requireClientAccess.mockResolvedValue({
    ok: true,
    user: { id: 'billing-user', role: 'BILLING', isActive: true },
  });
  mocks.requireParentPacketAccess.mockResolvedValue({
    ok: false,
    error: 'Intake packet not found.',
  });
});

describe('canonical document reads', () => {
  it('accepts a same-client canonical reference', async () => {
    const response = await GET(canonicalRequest());

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://storage.example.test/signed-document'
    );
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(CLIENT_ID);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(DOCUMENT_PATH, 120);
  });

  it('keeps valid legacy path-only references readable', async () => {
    const response = await GET(
      requestFor(`/api/documents?path=${encodeURIComponent(DOCUMENT_PATH)}`)
    );

    expect(response.status).toBe(302);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(DOCUMENT_PATH, 120);
  });

  it('rejects a query client that disagrees with the object prefix', async () => {
    const response = await GET(canonicalRequest(DOCUMENT_PATH, OTHER_CLIENT_ID));

    expect(response.status).toBe(400);
    expect(mocks.requireClientAccess).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});

describe('document provider failure redaction', () => {
  it.each([
    ['404', 404, 'Document not found'],
    ['503', 503, 'Document is temporarily unavailable'],
  ])(
    'preserves provider status %s without logging the object path',
    async (providerStatus, expectedStatus, expectedBody) => {
      mocks.createSignedUrl.mockResolvedValue({
        data: null,
        error: {
          error: providerStatus === '404' ? 'NoSuchKey' : 'SlowDown',
          message: `Provider failure for ${DOCUMENT_PATH}`,
          statusCode: providerStatus,
        },
      });

      const response = await GET(canonicalRequest());
      const logs = JSON.stringify(mocks.logError.mock.calls);

      expect(response.status).toBe(expectedStatus);
      expect(await response.text()).toBe(expectedBody);
      expect(logs).toContain(providerStatus);
      expect(logs).not.toContain(CLIENT_ID);
      expect(logs).not.toContain('clinical_eval.pdf');
    }
  );
});
