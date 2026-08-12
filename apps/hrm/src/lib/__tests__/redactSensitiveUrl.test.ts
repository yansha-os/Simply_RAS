import { describe, expect, it } from 'vitest';

import { redactSensitiveUrl } from '../redactSensitiveUrl';

describe('redactSensitiveUrl', () => {
  it('replaces an applicant magic-link path token with the route template', () => {
    const token = '16af34db-4d31-4f06-aec8-55fcd01be977';

    const redacted = redactSensitiveUrl(`/magic-link/${token}`);

    expect(redacted).toBe('/magic-link/[token]');
    expect(redacted).not.toContain(token);
  });

  it('redacts path and query secrets in an absolute URL', () => {
    const pathToken = 'applicant_bearer_secret';
    const queryToken = 'query_bearer_secret';

    const redacted = redactSensitiveUrl(
      `https://hrm.example.com/magic-link/${pathToken}?next=%2Frbt&token=${queryToken}`
    );

    expect(redacted).toBe(
      'https://hrm.example.com/magic-link/[token]?next=%2Frbt&token=[REDACTED]'
    );
    expect(redacted).not.toContain(pathToken);
    expect(redacted).not.toContain(queryToken);
  });

  it('redacts encoded magic-link separators and sensitive hash parameters', () => {
    const pathToken = 'encoded_path_secret';
    const fragmentToken = 'fragment_secret';

    const redacted = redactSensitiveUrl(
      `/magic-link%2F${pathToken}#magicLinkToken=${fragmentToken}`
    );

    expect(redacted).toBe('/magic-link/[token]#magicLinkToken=[REDACTED]');
    expect(redacted).not.toContain(pathToken);
    expect(redacted).not.toContain(fragmentToken);
  });

  it('leaves non-sensitive URLs unchanged', () => {
    expect(redactSensitiveUrl('/rbt/interview?step=availability')).toBe(
      '/rbt/interview?step=availability'
    );
  });

  it('fails closed when no URL is available', () => {
    expect(redactSensitiveUrl(undefined)).toBe('unknown');
    expect(redactSensitiveUrl(null)).toBe('unknown');
    expect(redactSensitiveUrl('   ')).toBe('unknown');
  });
});
