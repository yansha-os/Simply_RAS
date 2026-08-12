import React from 'react';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { DevToolsUI } from './DevToolsUI';
import { isDevToolsEnabled } from '@/lib/devToolsGate';

export async function DevToolsWrapper() {
  // NODE_ENV + flag gate: never render (or query users) in production.
  if (!isDevToolsEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const currentImpersonatedId = cookieStore.get('dev_impersonate_user_id')?.value || null;
  const currentImpersonatedRole = cookieStore.get('dev_impersonate_role')?.value || null;

  // Fetch all staff users for impersonation
  const users = await prisma.user.findMany({
    orderBy: [
      { role: 'asc' },
      { firstName: 'asc' }
    ],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true
    }
  });

  const roles = [
    'CEO',
    'CLINICAL_DIRECTOR',
    'OPS_DIRECTOR',
    'INTAKE_PA_COORDINATOR',
    'CASE_COORDINATOR',
    'CLINICAL_SUPPORT',
    'BILLING',
    'BCBA'
  ];

  return (
    <DevToolsUI 
      users={users} 
      roles={roles}
      currentImpersonatedId={currentImpersonatedId} 
      currentImpersonatedRole={currentImpersonatedRole}
    />
  );
}
