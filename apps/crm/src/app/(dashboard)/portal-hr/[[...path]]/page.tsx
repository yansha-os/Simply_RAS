import { redirect } from 'next/navigation';

/**
 * The HR product lives in HRM. The CRM proxy already bounces /portal-hr/*
 * there; this page is the in-app fallback so the legacy CRM HR portal (and
 * especially the old /portal-hr/session-emr auto-convert EMR path — readiness
 * audit Blocker 0c) can never render even if the proxy is bypassed.
 * Route map mirrors hrmRedirectUrl() in apps/crm/src/proxy.ts.
 */
const ROUTE_MAP: Record<string, string> = {
  '': '/hr-dashboard',
  ats: '/ats',
  payroll: '/payroll',
  onboarding: '/ats',
  'session-emr': '/session-emr',
  clients: '/hr-dashboard',
  rbts: '/hr-dashboard',
  requests: '/hr-dashboard',
};

export default async function PortalHrHrmRedirect({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  const base = (process.env.NEXT_PUBLIC_HRM_URL || 'http://localhost:3001').replace(/\/$/, '');
  const key = (path ?? []).join('/');
  redirect(`${base}${ROUTE_MAP[key] ?? '/hr-dashboard'}`);
}
