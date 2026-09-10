import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const paths = [
  'apps/crm/src/app/login/page.tsx',
  'apps/hrm/src/app/login/page.tsx',
  'apps/crm/src/app/magic-link/layout.tsx',
  'apps/crm/src/app/magic-link/[id]/page.tsx',
];

describe('public authentication security claims', () => {
  const sources = paths.map((path) => readFileSync(join(process.cwd(), path), 'utf8'));

  it('does not advertise unverified HIPAA-compliant or cipher-strength claims', () => {
    for (const source of sources) {
      expect(source).not.toMatch(/HIPAA[- ]compliant|256-bit SSL/i);
    }
  });

  it('marks login credentials for password-manager autofill', () => {
    for (const source of sources.slice(0, 2)) {
      expect(source).toContain('autoComplete="username"');
      expect(source).toContain('autoComplete="current-password"');
    }
  });
});
