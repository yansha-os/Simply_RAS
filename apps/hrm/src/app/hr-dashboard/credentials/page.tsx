import type { Metadata } from 'next';
import type { Role } from '@repo/db';
import { notFound } from 'next/navigation';
import StaffCredentialManager from '@/components/hrm/StaffCredentialManager';
import { listActiveStaffCredentials } from '@/app/actions/staffCredentialActions';
import { requireStaff } from '@/lib/auth-guard';
import { clinicDateKey } from '@/lib/clinicTimezone';

const CREDENTIAL_ADMIN_ROLES: readonly Role[] = ['HR', 'HEAD_HR', 'CEO'];

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Staff Credentials | Rise & Shine HRM',
  description: 'Restricted HR workspace for stored staff credential records.',
};

export default async function StaffCredentialAdminPage() {
  const gate = await requireStaff(CREDENTIAL_ADMIN_ROLES);
  if (!gate.ok) notFound();

  const result = await listActiveStaffCredentials();

  return (
    <StaffCredentialManager
      initialStaff={result.success ? result.data : []}
      initialAsOfDate={result.success ? result.asOfDate : clinicDateKey(new Date())}
      initialError={result.success ? null : result.error}
    />
  );
}
