import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true }
  });

  if (!dbUser) {
    redirect('/login?error=account_not_configured');
  }

  switch (dbUser.role) {
    case 'OPS_DIRECTOR':
    case 'CEO':
      redirect('/ops');
    case 'INTAKE_PA_COORDINATOR':
      redirect('/portal-case');
    case 'CASE_COORDINATOR':
      redirect('/portal-case-coord');
    case 'CLINICAL_SUPPORT':
      redirect('/clinical-support');
    case 'CLINICAL_DIRECTOR':
    case 'BCBA':
      redirect('/portal-clinical');
    case 'BILLING':
    case 'FINANCE':
    case 'SESSION_NOTES_COORDINATOR':
      redirect('/portal-billing');
    default:
      redirect('/login?error=invalid_role');
  }
}
