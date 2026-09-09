import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuthCookieOptions } from '../supabase/cookieOptions';

afterEach(() => vi.unstubAllEnvs());

describe('shared Supabase auth cookie options', () => {
  it('keeps cookies host-only when no parent domain is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '');
    expect(getAuthCookieOptions()).toBeUndefined();
  });

  it('accepts app origins beneath an organization-controlled parent domain', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', 'riseandshine.example');
    vi.stubEnv('NEXT_PUBLIC_CRM_URL', 'https://crm.riseandshine.example');
    vi.stubEnv('NEXT_PUBLIC_HRM_URL', 'https://hrm.riseandshine.example');

    expect(getAuthCookieOptions()).toEqual({
      domain: '.riseandshine.example',
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  });

  it('rejects shared hosting-provider cookie domains', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '.onrender.com');
    expect(() => getAuthCookieOptions()).toThrow('[SECURITY]');
  });

  it('rejects an app origin outside the configured cookie domain', () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_COOKIE_DOMAIN', '.riseandshine.example');
    vi.stubEnv('NEXT_PUBLIC_CRM_URL', 'https://crm.unrelated.example');
    expect(() => getAuthCookieOptions()).toThrow('NEXT_PUBLIC_CRM_URL is outside');
  });

  it('keeps the CRM and HRM implementations byte-identical', () => {
    const crm = readFileSync(join(process.cwd(), 'apps/crm/src/lib/supabase/cookieOptions.ts'), 'utf8');
    const hrm = readFileSync(join(process.cwd(), 'apps/hrm/src/lib/supabase/cookieOptions.ts'), 'utf8');
    expect(hrm).toBe(crm);
  });
});
