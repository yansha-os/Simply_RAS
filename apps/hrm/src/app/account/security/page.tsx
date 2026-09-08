import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth-guard';
import { SecurityClient } from './SecurityClient';

export default async function AccountSecurityPage() {
  const gate = await requireStaff();
  if (!gate.ok) redirect('/login?error=inactive_or_unauthorized');

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SecurityClient />
    </div>
  );
}
