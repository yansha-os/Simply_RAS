/**
 * Cross-app notification link resolution (production-readiness gap 8).
 *
 * Notification.linkUrl values are stored as app-relative paths (e.g. `/rbt/payroll`,
 * `/portal-clinical/notes`) by actions in BOTH apps, so a link can point at a route
 * that only exists in the sibling app. Resolving at render time fixes every existing
 * DB row and all future writes, regardless of which action created the notification.
 *
 * Route ownership is derived from the actual top-level route folders:
 * - CRM  (apps/crm/src/app/(dashboard)): case, client, clinical, clinical-support,
 *   notes, ops, portal-billing, portal-case, portal-case-coord, portal-clinical,
 *   portal-hr (redirect stub to HRM lives in CRM).
 * - HRM  (apps/hrm/src/app): rbt, rbt-manager, ats, apply, onboarding, payroll,
 *   session-emr, hr-dashboard, clients.
 * Unknown segments stay relative to the current app (safe default).
 */

const CURRENT_APP: 'crm' | 'hrm' = 'hrm';

const CRM_SEGMENTS = new Set([
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
]);

const HRM_SEGMENTS = new Set([
  'rbt',
  'rbt-manager',
  'ats',
  'apply',
  'onboarding',
  'payroll',
  'session-emr',
  'hr-dashboard',
  'clients',
]);

function configuredBaseUrl(value: string | undefined, developmentFallback: string) {
  const candidate =
    value || (process.env.NODE_ENV === 'production' ? undefined : developmentFallback);
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const loopback =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('127.') ||
      hostname === '::1' ||
      hostname === '[::1]';
    if (process.env.NODE_ENV === 'production' && loopback) return null;
    return candidate.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function crmBaseUrl() {
  return configuredBaseUrl(process.env.NEXT_PUBLIC_CRM_URL, 'http://localhost:3000');
}

function hrmBaseUrl() {
  return configuredBaseUrl(process.env.NEXT_PUBLIC_HRM_URL, 'http://localhost:3001');
}

export interface ResolvedNotificationLink {
  href: string;
  /** True when the link leaves this app — render as a regular anchor (full navigation), not the client router. */
  isCrossApp: boolean;
}

export function resolveNotificationLink(linkUrl: string): ResolvedNotificationLink {
  if (/^https?:\/\//i.test(linkUrl)) {
    return { href: linkUrl, isCrossApp: true };
  }
  if (!linkUrl.startsWith('/')) {
    return { href: linkUrl, isCrossApp: false };
  }

  const firstSegment = linkUrl.split(/[/?#]/).filter(Boolean)[0] ?? '';
  const owner: 'crm' | 'hrm' = HRM_SEGMENTS.has(firstSegment)
    ? 'hrm'
    : CRM_SEGMENTS.has(firstSegment)
      ? 'crm'
      : CURRENT_APP;

  if (owner === CURRENT_APP) {
    return { href: linkUrl, isCrossApp: false };
  }
  const base = owner === 'hrm' ? hrmBaseUrl() : crmBaseUrl();
  if (!base) {
    return { href: linkUrl, isCrossApp: false };
  }
  return { href: `${base}${linkUrl}`, isCrossApp: true };
}
