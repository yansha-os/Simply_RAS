import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CRM magic-link response privacy', () => {
  const source = readFileSync(join(process.cwd(), 'apps/crm/src/proxy.ts'), 'utf8');

  it('suppresses referrers, indexing, and shared caching for tokenized portal URLs', () => {
    expect(source).toContain("response.headers.set('Referrer-Policy', 'no-referrer')");
    expect(source).toContain("response.headers.set('X-Robots-Tag', 'noindex, nofollow')");
    expect(source).toContain("response.headers.set('Cache-Control', 'private, no-store, max-age=0')");
    expect(source).toMatch(/return hardenMagicLinkResponse\(response\)/);
  });
});
