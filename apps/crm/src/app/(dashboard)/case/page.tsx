import { redirect } from 'next/navigation';
import { CASE_COORD_ROLES, requireStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

/** Legacy operational board — work lives on /portal-case-coord/clients and /openings. */
export default async function CaseCoordinatorDashboard() {
  const access = await requireStaff(CASE_COORD_ROLES);
  if (!access.ok) notFound();
  redirect('/portal-case-coord');
}
