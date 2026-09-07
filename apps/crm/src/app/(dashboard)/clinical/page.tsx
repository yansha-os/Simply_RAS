import { redirect } from 'next/navigation';
import { CLINICAL_ROLES, requireStaff } from '@/lib/auth-guard';
import { notFound } from 'next/navigation';

/** Legacy operational board — work lives on /portal-clinical/bcbas. */
export default async function ClinicalDashboard() {
  const access = await requireStaff(CLINICAL_ROLES);
  if (!access.ok) notFound();
  redirect('/portal-clinical');
}
