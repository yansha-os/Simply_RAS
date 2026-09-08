import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth-guard';
import { isStaffProtectedPath } from '@/lib/routeAccess';

export async function HrmServerAccessBoundary({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get('x-ras-pathname') || '';
  if (isStaffProtectedPath(pathname)) {
    const gate = await requireStaff();
    if (!gate.ok) redirect('/login?error=inactive_or_unauthorized');
  }
  return children;
}
