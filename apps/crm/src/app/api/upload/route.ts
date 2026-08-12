import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireParentPacketAccess } from '@/lib/magicLinkGuard';
import { requireClientAccess } from '@/lib/auth-guard';
import { logError } from '@/lib/logger';

/**
 * PHI document upload (readiness Blocker 0b).
 *
 * - Files land in the PRIVATE Supabase Storage bucket `client-documents`
 *   under a per-client prefix (`{clientId}/...`) — never in public/.
 * - Parents must present a live magic-link token AND the device fingerprint
 *   the link is bound to. Staff must have a session and name the client.
 * - Declared MIME type is verified against file magic bytes.
 * - Reads go through /api/documents (auth + short-lived signed URL).
 */

const STORAGE_BUCKET = 'client-documents';

const MAX_BYTES = 5 * 1024 * 1024;
// Browser multipart framing is small, but leave bounded room for headers and
// the original filename. Parsed file.size remains the authoritative limit.
const MAX_MULTIPART_BYTES = MAX_BYTES + 64 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAGIC_LINK_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/** Magic-byte sniff for the three allowed types. */
function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  return null;
}

type UploadAuth = { ok: true; clientId: string } | { ok: false; status: number; error: string };

function declaredBodyLimit(
  request: NextRequest
): { ok: true } | { ok: false; status: number; error: string } {
  const rawLength = request.headers.get('content-length');
  if (rawLength === null) return { ok: true };
  if (!/^\d+$/.test(rawLength)) {
    return { ok: false, status: 400, error: 'Invalid Content-Length' };
  }

  const contentLength = Number(rawLength);
  if (!Number.isSafeInteger(contentLength) || contentLength > MAX_MULTIPART_BYTES) {
    return { ok: false, status: 413, error: 'Upload request exceeds the 5MB limit' };
  }
  return { ok: true };
}

function staffGateStatus(error: string): number {
  if (error === 'Client not found.') return 404;
  if (error.startsWith('Not authenticated.')) return 401;
  return 403;
}

async function authorizeUpload(request: NextRequest): Promise<UploadAuth> {
  const magicLinkToken = request.headers.get('x-magic-link-token');
  const clientIdField = request.headers.get('x-client-id');

  if (magicLinkToken && clientIdField) {
    return { ok: false, status: 400, error: 'Conflicting upload scope' };
  }

  if (magicLinkToken) {
    if (!MAGIC_LINK_TOKEN_PATTERN.test(magicLinkToken)) {
      return { ok: false, status: 401, error: 'Unauthorized' };
    }
    // Live link + bound device fingerprint (cookie) — token alone is not enough.
    const gate = await requireParentPacketAccess({ token: magicLinkToken });
    if (!gate.ok) return { ok: false, status: 401, error: gate.error };
    return { ok: true, clientId: gate.clientId };
  }

  if (!clientIdField) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  if (!UUID_PATTERN.test(clientIdField)) {
    return { ok: false, status: 400, error: 'Invalid client scope' };
  }

  // Canonical guard proves both session scope and authoritative existence.
  const staff = await requireClientAccess(clientIdField);
  if (!staff.ok) {
    const status = staffGateStatus(staff.error);
    return {
      ok: false,
      status,
      error:
        status === 401
          ? 'Unauthorized'
          : status === 404
            ? 'Client not found'
            : 'Forbidden',
    };
  }

  return { ok: true, clientId: clientIdField };
}

function providerStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 503;
  const source = error as {
    status?: unknown;
    statusCode?: unknown;
    httpStatusCode?: unknown;
  };
  const rawStatus = source.statusCode ?? source.status ?? source.httpStatusCode;
  const status =
    typeof rawStatus === 'number'
      ? rawStatus
      : typeof rawStatus === 'string' && /^\d{3}$/.test(rawStatus)
        ? Number(rawStatus)
        : Number.NaN;
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503;
}

function providerFailure(error: unknown): NextResponse {
  const status = providerStatus(error);
  // Never log provider messages: Storage often embeds object paths and names.
  logError('upload.storage_failed', { providerStatus: status });
  return NextResponse.json(
    {
      error:
        status >= 500
          ? 'Storage is temporarily unavailable'
          : 'Storage rejected the upload',
    },
    { status }
  );
}

export async function POST(request: NextRequest) {
  try {
    const declaredLimit = declaredBodyLimit(request);
    if (!declaredLimit.ok) {
      return NextResponse.json(
        { error: declaredLimit.error },
        { status: declaredLimit.status }
      );
    }

    // Scope metadata is carried in bounded headers so no multipart bytes are
    // parsed until the caller and target client have both been authorized.
    const auth = await authorizeUpload(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      logError('upload.multipart_invalid', { errorType: 'MultipartParseError' });
      return NextResponse.json({ error: 'Malformed upload request' }, { status: 400 });
    }

    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ error: 'File must contain data' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds the 5MB limit' }, { status: 413 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Only PDF, JPEG, and PNG files are allowed' }, { status: 400 });
    }

    let buffer: Buffer;
    try {
      const bytes = await file.arrayBuffer();
      buffer = Buffer.from(bytes);
    } catch {
      logError('upload.file_read_failed', { errorType: 'FileReadError' });
      return NextResponse.json({ error: 'Could not read uploaded file' }, { status: 400 });
    }

    // Never trust the declared type — verify magic bytes.
    const sniffed = sniffMimeType(buffer);
    if (!sniffed || sniffed !== file.type) {
      return NextResponse.json(
        { error: 'File content does not match its declared type.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      logError('upload.storage_not_configured');
      return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
    }

    const safeName =
      file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 120) || 'document';
    // clientId prefix = path isolation; reads re-check access per client.
    const storagePath = `${auth.clientId}/${Date.now()}-${safeName}`;

    try {
      const { error: uploadError } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, { contentType: sniffed, upsert: false });

      if (uploadError) return providerFailure(uploadError);
    } catch {
      return providerFailure(null);
    }

    return NextResponse.json({
      // Authenticated read route — resolves to a short-lived signed URL.
      url:
        `/api/documents?clientId=${auth.clientId}` +
        `&path=${encodeURIComponent(storagePath)}`,
      name: file.name.slice(0, 200),
      size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
      type: sniffed,
    });
  } catch {
    logError('upload.unhandled_error', { errorType: 'UnhandledUploadError' });
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
