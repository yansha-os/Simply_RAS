import { redirect } from 'next/navigation';

/**
 * The RBT portal (onboarding, schedule, job board, documents, session studio)
 * lives in HRM (readiness audit Blocker 3). The old CRM /rbt/* stack was a
 * localStorage-backed prototype duplicate — every route now bounces to the
 * DB-backed HRM equivalent, which mirrors the same /rbt/* path structure.
 */
export default async function RbtHrmRedirect({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path } = await params;
  const base = (process.env.NEXT_PUBLIC_HRM_URL || 'http://localhost:3001').replace(/\/$/, '');
  const suffix = path && path.length > 0 ? `/${path.join('/')}` : '';
  redirect(`${base}/rbt${suffix}`);
}
