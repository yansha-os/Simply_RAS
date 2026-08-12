import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { isDevToolsEnabled } from '@/lib/devToolsGate';

function isDevImpersonationEnabled() {
  return isDevToolsEnabled();
}

export async function getCurrentUser() {
  const cookieStore = await cookies();

  if (isDevImpersonationEnabled()) {
    const impersonatedUserId = cookieStore.get('dev_impersonate_user_id')?.value;
    if (impersonatedUserId) {
      const impersonatedUser = await prisma.user.findUnique({
        where: { id: impersonatedUserId },
      });
      if (impersonatedUser) {
        return impersonatedUser;
      }
    }

    const impersonatedRole = cookieStore.get('dev_impersonate_role')?.value;
    if (impersonatedRole) {
      if (impersonatedRole === 'RBT') {
        return {
          id: 'mock-user-id',
          firstName: 'David',
          lastName: 'Miller',
          email: 'david.m@riseandshine.nyc',
          role: 'RBT',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      return {
        id: 'mock-user-id',
        firstName: 'Mock',
        lastName: impersonatedRole,
        email: `mock_${impersonatedRole.toLowerCase()}@example.com`,
        role: impersonatedRole,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (authUser) {
    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
    });
    if (dbUser) return dbUser;
  }

  return null;
}
