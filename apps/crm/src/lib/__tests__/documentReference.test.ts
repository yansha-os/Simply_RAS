import { describe, expect, it } from 'vitest';

import { canonicalDocumentReference } from '../documentReference';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_PATH = `${CLIENT_ID}/1712345678901-clinical_eval.pdf`;
const CANONICAL_URL =
  `/api/documents?clientId=${CLIENT_ID}` +
  `&path=${encodeURIComponent(DOCUMENT_PATH)}`;

describe('canonicalDocumentReference', () => {
  it('accepts canonical same-client string and object references', () => {
    expect(canonicalDocumentReference(CANONICAL_URL, CLIENT_ID)).toBe(CANONICAL_URL);
    expect(
      canonicalDocumentReference(
        {
          name: 'Clinical evaluation',
          url: CANONICAL_URL,
        },
        CLIENT_ID
      )
    ).toBe(CANONICAL_URL);
  });

  it('normalizes a valid legacy same-client path-only reference', () => {
    const legacy = `/api/documents?path=${encodeURIComponent(DOCUMENT_PATH)}`;

    expect(canonicalDocumentReference(legacy, CLIENT_ID)).toBe(CANONICAL_URL);
  });

  it.each([
    'https://malicious.example/document.pdf',
    '//malicious.example/document.pdf',
    'data:text/html,<script>alert(1)</script>',
    'javascript:alert(1)',
    '/api/documents',
    '/api/documents?clientId=not-a-uuid&path=bad',
    `/api/documents?clientId=${CLIENT_ID}&path=${encodeURIComponent(`${CLIENT_ID}/../secret.pdf`)}`,
    `/api/documents?clientId=${CLIENT_ID}&path=${encodeURIComponent(`${CLIENT_ID}/folder/secret.pdf`)}`,
    `${CANONICAL_URL}#fragment`,
    `${CANONICAL_URL}&redirect=https%3A%2F%2Fmalicious.example`,
    `/other-route?clientId=${CLIENT_ID}&path=${encodeURIComponent(DOCUMENT_PATH)}`,
  ])('rejects hostile or malformed reference %s', (value) => {
    expect(canonicalDocumentReference(value, CLIENT_ID)).toBeNull();
  });

  it('rejects cross-client query and object-path bindings', () => {
    expect(
      canonicalDocumentReference(
        `/api/documents?clientId=${OTHER_CLIENT_ID}&path=${encodeURIComponent(
          `${OTHER_CLIENT_ID}/other.pdf`
        )}`,
        CLIENT_ID
      )
    ).toBeNull();
    expect(
      canonicalDocumentReference(
        `/api/documents?clientId=${CLIENT_ID}&path=${encodeURIComponent(
          `${OTHER_CLIENT_ID}/other.pdf`
        )}`,
        CLIENT_ID
      )
    ).toBeNull();
  });

  it('rejects duplicate security parameters and malformed persisted values', () => {
    expect(
      canonicalDocumentReference(
        `${CANONICAL_URL}&clientId=${OTHER_CLIENT_ID}`,
        CLIENT_ID
      )
    ).toBeNull();
    expect(canonicalDocumentReference({ url: 42 }, CLIENT_ID)).toBeNull();
    expect(canonicalDocumentReference(['not', 'a', 'reference'], CLIENT_ID)).toBeNull();
    expect(canonicalDocumentReference(CANONICAL_URL, 'not-a-client-id')).toBeNull();
  });
});
