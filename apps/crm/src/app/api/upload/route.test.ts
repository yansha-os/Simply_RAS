import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const upload = vi.fn();
  const from = vi.fn(() => ({ upload }));
  const admin = { storage: { from } };

  return {
    admin,
    createAdminClient: vi.fn(),
    from,
    logError: vi.fn(),
    requireClientAccess: vi.fn(),
    requireParentPacketAccess: vi.fn(),
    requireStaff: vi.fn(),
    upload,
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireClientAccess: mocks.requireClientAccess,
  requireStaff: mocks.requireStaff,
}));

vi.mock('@/lib/magicLinkGuard', () => ({
  requireParentPacketAccess: mocks.requireParentPacketAccess,
}));

vi.mock('@/lib/logger', () => ({
  errorMeta: vi.fn(() => ({ errorName: 'RedactedError' })),
  logError: mocks.logError,
}));

import { POST } from './route';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const MAGIC_LINK_TOKEN = 'parent_token_123';
const FIVE_MEGABYTES = 5 * 1024 * 1024;

function pdfFile(name = 'report.pdf', contents: ArrayBuffer | string = '%PDF-1.7\n') {
  return new File([contents], name, { type: 'application/pdf' });
}

function multipart(file?: File): FormData {
  const data = new FormData();
  if (file) data.set('file', file);
  return data;
}

function requestStub(options: {
  headers?: Record<string, string>;
  formData?: FormData;
  parseError?: Error;
}) {
  const parseBody = options.parseError
    ? vi.fn().mockRejectedValue(options.parseError)
    : vi.fn().mockResolvedValue(options.formData ?? new FormData());

  return {
    parseBody,
    request: {
      headers: new Headers(options.headers),
      formData: parseBody,
    } as unknown as NextRequest,
  };
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockReturnValue(mocks.admin);
  mocks.requireClientAccess.mockResolvedValue({
    ok: false,
    error: 'Not authenticated. Please sign in.',
  });
  mocks.requireParentPacketAccess.mockResolvedValue({
    ok: false,
    error: 'Intake packet not found.',
  });
  mocks.requireStaff.mockResolvedValue({
    ok: false,
    error: 'Not authenticated. Please sign in.',
  });
  mocks.upload.mockResolvedValue({ data: { path: 'stored' }, error: null });
});

describe('upload authorization ordering', () => {
  it('does not parse an unauthenticated request body or invoke Storage', async () => {
    const { request, parseBody } = requestStub({
      headers: { 'x-client-id': CLIENT_ID },
      parseError: new Error('body must not be parsed'),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(parseBody).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects an unassigned staff member before parsing the body', async () => {
    mocks.requireClientAccess.mockResolvedValue({
      ok: false,
      error: 'You are not assigned to this client.',
    });
    const { request, parseBody } = requestStub({
      headers: { 'x-client-id': CLIENT_ID },
      parseError: new Error('body must not be parsed'),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(parseBody).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent client before parsing the body', async () => {
    mocks.requireClientAccess.mockResolvedValue({
      ok: false,
      error: 'Client not found.',
    });
    const { request, parseBody } = requestStub({
      headers: { 'x-client-id': CLIENT_ID },
      parseError: new Error('body must not be parsed'),
    });

    const response = await POST(request);

    expect(response.status).toBe(404);
    expect(parseBody).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects conflicting or malformed pre-body scope metadata', async () => {
    const conflicting = requestStub({
      headers: {
        'x-client-id': CLIENT_ID,
        'x-magic-link-token': MAGIC_LINK_TOKEN,
      },
      parseError: new Error('body must not be parsed'),
    });
    const malformed = requestStub({
      headers: { 'x-client-id': 'not-a-uuid' },
      parseError: new Error('body must not be parsed'),
    });

    const conflictingResponse = await POST(conflicting.request);
    const malformedResponse = await POST(malformed.request);

    expect(conflictingResponse.status).toBe(400);
    expect(malformedResponse.status).toBe(400);
    expect(conflicting.parseBody).not.toHaveBeenCalled();
    expect(malformed.parseBody).not.toHaveBeenCalled();
  });

  it('rejects an obviously oversized declared body before parsing it', async () => {
    const { request, parseBody } = requestStub({
      headers: {
        'content-length': String(6 * 1024 * 1024),
        'x-client-id': CLIENT_ID,
      },
      parseError: new Error('body must not be parsed'),
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(parseBody).not.toHaveBeenCalled();
    expect(mocks.requireClientAccess).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});

describe('authorized uploads', () => {
  it.each([
    ['global', 'BILLING'],
    ['assigned', 'BCBA'],
  ])('allows valid %s staff client access', async (_kind, role) => {
    mocks.requireClientAccess.mockResolvedValue({
      ok: true,
      user: { id: `user-${role}`, role, isActive: true },
    });
    const { request, parseBody } = requestStub({
      headers: { 'x-client-id': CLIENT_ID },
      formData: multipart(pdfFile()),
    });

    const response = await POST(request);
    const body = await responseJson(response);

    expect(response.status).toBe(200);
    expect(mocks.requireClientAccess).toHaveBeenCalledWith(CLIENT_ID);
    expect(mocks.requireParentPacketAccess).not.toHaveBeenCalled();
    expect(parseBody).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith('client-documents');
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][0]).toMatch(
      new RegExp(`^${CLIENT_ID}/\\d+-report\\.pdf$`)
    );
    expect(body.url).toMatch(
      new RegExp(
        `^/api/documents\\?clientId=${CLIENT_ID}&path=${CLIENT_ID}%2F\\d+-report\\.pdf$`
      )
    );
  });

  it('allows a live device-bound parent upload and derives its client scope', async () => {
    mocks.requireParentPacketAccess.mockResolvedValue({
      ok: true,
      packetId: '33333333-3333-4333-8333-333333333333',
      clientId: CLIENT_ID,
    });
    const { request, parseBody } = requestStub({
      headers: { 'x-magic-link-token': MAGIC_LINK_TOKEN },
      formData: multipart(pdfFile('parent-report.pdf')),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.requireParentPacketAccess).toHaveBeenCalledWith({
      token: MAGIC_LINK_TOKEN,
    });
    expect(mocks.requireClientAccess).not.toHaveBeenCalled();
    expect(parseBody).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][0]).toMatch(
      new RegExp(`^${CLIENT_ID}/\\d+-parent-report\\.pdf$`)
    );
  });
});

describe('multipart and file validation', () => {
  beforeEach(() => {
    mocks.requireClientAccess.mockResolvedValue({
      ok: true,
      user: { id: 'billing-user', role: 'BILLING', isActive: true },
    });
  });

  it('returns a client error for malformed multipart without exposing parser details', async () => {
    const secret = `${CLIENT_ID}/family-secret.pdf`;
    const { request } = requestStub({
      headers: { 'x-client-id': CLIENT_ID },
      parseError: new Error(`Malformed multipart near ${secret}`),
    });

    const response = await POST(request);
    const body = await responseJson(response);
    const logs = JSON.stringify(mocks.logError.mock.calls);

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Malformed upload request' });
    expect(logs).not.toContain(CLIENT_ID);
    expect(logs).not.toContain('family-secret.pdf');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('enforces the authoritative parsed file-size limit', async () => {
    const oversized = pdfFile(
      'oversized.pdf',
      new ArrayBuffer(FIVE_MEGABYTES + 1)
    );
    const { request } = requestStub({
      headers: { 'x-client-id': CLIENT_ID },
      formData: multipart(oversized),
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an unsupported declared MIME type',
      new File(['plain text'], 'notes.txt', { type: 'text/plain' }),
      'Only PDF, JPEG, and PNG files are allowed',
    ],
    [
      'magic bytes that disagree with the declared MIME type',
      new File(['%PDF-1.7'], 'fake.png', { type: 'image/png' }),
      'File content does not match its declared type.',
    ],
  ])('rejects %s without invoking Storage', async (_case, file, expectedError) => {
    const { request } = requestStub({
      headers: { 'x-client-id': CLIENT_ID },
      formData: multipart(file),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toEqual({ error: expectedError });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});

describe('provider failure handling', () => {
  beforeEach(() => {
    mocks.requireClientAccess.mockResolvedValue({
      ok: true,
      user: { id: 'billing-user', role: 'BILLING', isActive: true },
    });
  });

  it.each([
    ['409', 409],
    ['503', 503],
  ])('preserves provider status %s while redacting object details', async (providerStatus, expectedStatus) => {
    const secret = `${CLIENT_ID}/1712345678901-family-secret.pdf`;
    mocks.upload.mockResolvedValue({
      data: null,
      error: {
        error: providerStatus === '409' ? 'ResourceAlreadyExists' : 'SlowDown',
        message: `Provider failed for ${secret}`,
        statusCode: providerStatus,
      },
    });
    const { request } = requestStub({
      headers: { 'x-client-id': CLIENT_ID },
      formData: multipart(pdfFile('family-secret.pdf')),
    });

    const response = await POST(request);
    const body = await responseJson(response);
    const logs = JSON.stringify(mocks.logError.mock.calls);

    expect(response.status).toBe(expectedStatus);
    expect(body).toEqual({
      error:
        expectedStatus >= 500
          ? 'Storage is temporarily unavailable'
          : 'Storage rejected the upload',
    });
    expect(logs).toContain(providerStatus);
    expect(logs).not.toContain(CLIENT_ID);
    expect(logs).not.toContain('family-secret.pdf');
  });
});
