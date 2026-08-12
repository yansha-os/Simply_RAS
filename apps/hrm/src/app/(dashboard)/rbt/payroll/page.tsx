import { assertApplicantHired } from '@/lib/assertApplicantHired';
import { RbtPayrollView } from '@/components/rbt/RbtPayrollView';
import { listRbtPayrollSessions } from '@/app/actions/payrollActions';

export default async function RbtPayrollPage() {
  await assertApplicantHired();
  const payroll = await listRbtPayrollSessions();
  const loadedAt = payroll.success ? new Date().toISOString() : null;

  return (
    <RbtPayrollView
      initialSessions={payroll.sessions}
      initialError={payroll.success ? null : payroll.error}
      initialLoadedAt={loadedAt}
    />
  );
}
