const UNKNOWN_URL = 'unknown';
const MAGIC_LINK_PATH = /\/magic-link(?:\/|%2f)[^/?#\s&]+/gi;
const SENSITIVE_URL_PARAMETER =
  /([?&#](?:access[_-]?token|refresh[_-]?token|id[_-]?token|magic[_-]?link[_-]?token|upload[_-]?token|token|signature|sig|secret)=)[^&#\s]*/gi;

/**
 * Returns a log-safe representation of a URL-like value without decoding it.
 * Missing values fail closed so callers never fall back to a raw request URL.
 */
export function redactSensitiveUrl(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return UNKNOWN_URL;
  }

  return value
    .trim()
    .replace(MAGIC_LINK_PATH, '/magic-link/[token]')
    .replace(SENSITIVE_URL_PARAMETER, '$1[REDACTED]');
}
