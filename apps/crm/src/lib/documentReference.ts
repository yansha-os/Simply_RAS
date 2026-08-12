const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCUMENT_PATH_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([a-zA-Z0-9._-]{1,160})$/i;
const INTERNAL_DOCUMENT_ORIGIN = 'https://internal-document.invalid';

function persistedUrl(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.prototype.hasOwnProperty.call(value, 'url')
  ) {
    return null;
  }

  const url = (value as { url?: unknown }).url;
  return typeof url === 'string' && url.trim() ? url.trim() : null;
}

/**
 * Return only an internal, same-client document reference.
 *
 * New references carry both clientId and path. A path-only reference emitted
 * by the earlier private-storage route is accepted only when its object prefix
 * is already bound to the expected client, then normalized to the new form.
 */
export function canonicalDocumentReference(
  value: unknown,
  expectedClientId: string
): string | null {
  if (!UUID_PATTERN.test(expectedClientId)) return null;

  const raw = persistedUrl(value);
  if (
    !raw ||
    !raw.startsWith('/api/documents?') ||
    raw.startsWith('//') ||
    raw.includes('#') ||
    /[\u0000-\u001f\u007f]/.test(raw)
  ) {
    return null;
  }

  try {
    const parsed = new URL(raw, INTERNAL_DOCUMENT_ORIGIN);
    if (
      parsed.origin !== INTERNAL_DOCUMENT_ORIGIN ||
      parsed.pathname !== '/api/documents' ||
      parsed.hash
    ) {
      return null;
    }

    const keys = [...parsed.searchParams.keys()];
    if (keys.some((key) => key !== 'clientId' && key !== 'path')) return null;

    const clientIds = parsed.searchParams.getAll('clientId');
    const paths = parsed.searchParams.getAll('path');
    if (paths.length !== 1 || clientIds.length > 1) return null;
    if (clientIds.length === 0 && keys.length !== 1) return null;
    if (clientIds.length === 1 && keys.length !== 2) return null;

    const normalizedExpectedClientId = expectedClientId.toLowerCase();
    if (
      clientIds.length === 1 &&
      clientIds[0].toLowerCase() !== normalizedExpectedClientId
    ) {
      return null;
    }

    const pathMatch = paths[0].match(DOCUMENT_PATH_PATTERN);
    if (
      !pathMatch ||
      pathMatch[1].toLowerCase() !== normalizedExpectedClientId ||
      pathMatch[2] === '.' ||
      pathMatch[2] === '..'
    ) {
      return null;
    }

    const canonicalPath = `${normalizedExpectedClientId}/${pathMatch[2]}`;
    return (
      `/api/documents?clientId=${normalizedExpectedClientId}` +
      `&path=${encodeURIComponent(canonicalPath)}`
    );
  } catch {
    return null;
  }
}
