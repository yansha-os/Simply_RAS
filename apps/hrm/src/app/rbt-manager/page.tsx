import RbtManagerView from '@/components/hrm/RbtManagerView';
import { getRbtManagerDashboard } from '@/app/actions/atsActions';
import { HR_ROLES, requireStaff } from '@/lib/auth-guard';
import { notFound, redirect } from 'next/navigation';

export default async function RbtManagerPage() {
  const gate = await requireStaff(HR_ROLES);
  if (!gate.ok) {
    if (gate.error.startsWith('Not authenticated')) {
      redirect('/login?next=%2Frbt-manager');
    }
    notFound();
  }

  const result = await getRbtManagerDashboard();
  return <RbtManagerView result={result} />;
}
