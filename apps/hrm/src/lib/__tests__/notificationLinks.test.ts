import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveNotificationLink } from '../notificationLinks';

const CRM_ROUTE_PREFIXES = [
  'case',
  'client',
  'clinical',
  'clinical-support',
  'notes',
  'ops',
  'portal-billing',
  'portal-case',
  'portal-case-coord',
  'portal-clinical',
  'portal-hr',
] as const;

const HRM_ROUTE_PREFIXES = [
  'rbt',
  'rbt-manager',
  'ats',
  'apply',
  'onboarding',
  'payroll',
  'session-emr',
  'hr-dashboard',
  'clients',
] as const;

const originalCrmUrl = process.env.NEXT_PUBLIC_CRM_URL;
const originalHrmUrl = process.env.NEXT_PUBLIC_HRM_URL;
const originalNodeEnv = process.env.NODE_ENV;

function setNodeEnv(value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, 'NODE_ENV');
    return;
  }
  Object.defineProperty(process.env, 'NODE_ENV', {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

describe('HRM resolveNotificationLink', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CRM_URL = 'https://crm.example.test/';
    process.env.NEXT_PUBLIC_HRM_URL = 'https://hrm.example.test/';
  });

  afterEach(() => {
    if (originalCrmUrl === undefined) {
      delete process.env.NEXT_PUBLIC_CRM_URL;
    } else {
      process.env.NEXT_PUBLIC_CRM_URL = originalCrmUrl;
    }

    if (originalHrmUrl === undefined) {
      delete process.env.NEXT_PUBLIC_HRM_URL;
    } else {
      process.env.NEXT_PUBLIC_HRM_URL = originalHrmUrl;
    }

    setNodeEnv(originalNodeEnv);
  });

  it.each(HRM_ROUTE_PREFIXES)('keeps the HRM /%s route in the current app', (prefix) => {
    const link = `/${prefix}/example`;

    expect(resolveNotificationLink(link)).toEqual({
      href: link,
      isCrossApp: false,
    });
  });

  it.each(CRM_ROUTE_PREFIXES)('resolves the CRM /%s route across apps', (prefix) => {
    const link = `/${prefix}/example`;

    expect(resolveNotificationLink(link)).toEqual({
      href: `https://crm.example.test${link}`,
      isCrossApp: true,
    });
  });

  it.each([
    'https://outside.example.test/path?tab=open#item',
    'http://outside.example.test/path',
    'HTTPS://OUTSIDE.EXAMPLE.TEST/PATH',
  ])('preserves the absolute URL %s and marks it cross-app', (link) => {
    expect(resolveNotificationLink(link)).toEqual({
      href: link,
      isCrossApp: true,
    });
  });

  it('preserves query strings and hashes on a cross-app route', () => {
    const link = '/portal-billing/clients?status=pending#client-42';

    expect(resolveNotificationLink(link)).toEqual({
      href: `https://crm.example.test${link}`,
      isCrossApp: true,
    });
  });

  it('preserves query strings and hashes on a current-app route', () => {
    const link = '/rbt/payroll?week=2026-08-10#session-42';

    expect(resolveNotificationLink(link)).toEqual({
      href: link,
      isCrossApp: false,
    });
  });

  it.each(['/unknown/place?tab=open#item', 'relative/path', '?tab=open#item', ''])(
    'keeps unknown or non-rooted link %j in the current app',
    (link) => {
      expect(resolveNotificationLink(link)).toEqual({
        href: link,
        isCrossApp: false,
      });
    }
  );

  it('falls back to the CRM localhost URL when its public URL is absent', () => {
    delete process.env.NEXT_PUBLIC_CRM_URL;

    expect(resolveNotificationLink('/portal-clinical/notes')).toEqual({
      href: 'http://localhost:3000/portal-clinical/notes',
      isCrossApp: true,
    });
  });

  it('never falls back to a localhost cross-app target in production', () => {
    delete process.env.NEXT_PUBLIC_CRM_URL;
    setNodeEnv('production');

    expect(resolveNotificationLink('/portal-clinical/notes')).toEqual({
      href: '/portal-clinical/notes',
      isCrossApp: false,
    });
  });
});
