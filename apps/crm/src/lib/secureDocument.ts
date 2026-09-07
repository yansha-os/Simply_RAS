export type SecureDocument = {
  url: string;
  name: string;
  size: string;
  type: string;
};

function isAuthorizedDocumentPath(path: string | null, clientId: string): boolean {
  if (!path) return false;
  const separatorIndex = path.indexOf('/');
  if (separatorIndex < 1 || path.slice(0, separatorIndex) !== clientId) return false;
  return /^[a-zA-Z0-9._-]{1,160}$/.test(path.slice(separatorIndex + 1));
}

/** Validates parent-upload document references and returns preview metadata. */
export function getSecureDocument(value: unknown, clientId: string): SecureDocument | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (typeof document.url !== 'string') return null;

  const [pathname, query = ''] = document.url.split('?', 2);
  const path = new URLSearchParams(query).get('path');
  if (pathname !== '/api/documents' || !isAuthorizedDocumentPath(path, clientId)) {
    return null;
  }

  return {
    url: document.url,
    name: typeof document.name === 'string' ? document.name : 'Secure document',
    size: typeof document.size === 'string' ? document.size : '',
    type: typeof document.type === 'string' ? document.type : '',
  };
}
