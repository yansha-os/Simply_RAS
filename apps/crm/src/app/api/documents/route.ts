import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/lib/auth-guard';
import { requireParentPacketAccess } from '@/lib/magicLinkGuard';
import { logError } from '@/lib/logger';

/**
 * Authenticated PHI document reads (readiness Blocker 0b).
 *
 * GET /api/documents?path={clientId}/{file}
 * - Staff: session + client-assignment check (requireClientAccess).
 * - Parent: live magic link for that client + bound device fingerprint.
 * On success, 302-redirects to a short-lived signed URL for the private
 * `client-documents` bucket, so <img>/<iframe> viewers work unchanged.
 */

const STORAGE_BUCKET = 'client-documents';
const SIGNED_URL_TTL_SECONDS = 120;
const UUID_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, 'i');
const DOCUMENT_PATH_PATTERN = new RegExp(
  `^(${UUID_SOURCE})/([a-zA-Z0-9._-]{1,160})$`,
  'i'
);

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
  // Provider messages may contain the private object path or original name.
  logError('document.storage_failed', { providerStatus: status });
  if (status === 404) {
    return new NextResponse('Document not found', { status });
  }
  if (status >= 500) {
    return new NextResponse('Document is temporarily unavailable', { status });
  }
  return new NextResponse('Document access failed', { status });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pathValues = searchParams.getAll('path');
    const clientIdValues = searchParams.getAll('clientId');
    const keys = [...searchParams.keys()];
    if (
      pathValues.length !== 1 ||
      clientIdValues.length > 1 ||
      keys.some((key) => key !== 'path' && key !== 'clientId')
    ) {
      return new NextResponse('Invalid document path', { status: 400 });
    }
    const path = pathValues[0];

    // {uuid clientId}/{filename} — no traversal, no bucket escape.
    const match = path.match(DOCUMENT_PATH_PATTERN);
    if (!match) {
      return new NextResponse('Invalid document path', { status: 400 });
    }
    const clientId = match[1];
    if (
      clientIdValues.length === 1 &&
      (!UUID_PATTERN.test(clientIdValues[0]) ||
        clientIdValues[0].toLowerCase() !== clientId.toLowerCase())
    ) {
      return new NextResponse('Invalid document path', { status: 400 });
    }

    // Staff first (session), then parent (magic link + device fingerprint).
    const staffGate = await requireClientAccess(clientId);
    if (!staffGate.ok) {
      const parentGate = await requireParentPacketAccess({ clientId });
      if (!parentGate.ok) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    const admin = createAdminClient();
    if (!admin) {
      logError('document.storage_not_configured');
      return new NextResponse('Storage is not configured', { status: 500 });
    }

    let data: { signedUrl?: string } | null = null;
    try {
      const result = await admin.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      data = result.data;
      if (result.error) return providerFailure(result.error);
    } catch {
      return providerFailure(null);
    }

    if (!data?.signedUrl) {
      logError('document.signed_url_missing', { providerStatus: 404 });
      return new NextResponse('Document not found', { status: 404 });
    }

    return NextResponse.redirect(data.signedUrl, 302);
  } catch {
    logError('document.unhandled_error', { errorType: 'UnhandledDocumentError' });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
