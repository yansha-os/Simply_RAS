'use server';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export async function login(prevState: any, formData: FormData) {
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const password = String(formData.get('password') || '');

  if (!email) {
    return { error: 'Email address is required.' };
  }

  // 1. DEMO / DEV FALLBACK ROUTER (Instant login for dev testing)
  if (email.includes('hr@') || email.includes('head_hr')) {
    revalidatePath('/', 'layout');
    redirect('/portal-hr');
  }
  if (email.includes('ats@') || email.includes('recruiter')) {
    revalidatePath('/', 'layout');
    redirect('/portal-hr/ats');
  }
  if (email.includes('payroll@') || email.includes('finance')) {
    revalidatePath('/', 'layout');
    redirect('/portal-hr/payroll');
  }
  if (email.includes('rbt@')) {
    revalidatePath('/', 'layout');
    redirect('/rbt');
  }
  if (email.includes('bcba@') || email.includes('clinical')) {
    revalidatePath('/', 'layout');
    redirect('/portal-clinical');
  }
  if (email.includes('case@') || email.includes('coordinator')) {
    revalidatePath('/', 'layout');
    redirect('/portal-case-coord');
  }
  if (email.includes('ops@') || email.includes('admin@') || email.includes('ceo@')) {
    revalidatePath('/', 'layout');
    redirect('/ops');
  }

  // 2. SUPABASE AUTHENTICATION
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: password || 'password123',
    });

    if (!error && data?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: data.user.id },
        select: { role: true },
      });

      if (user) {
        revalidatePath('/', 'layout');
        return routeByRole(user.role);
      }
    }
  } catch (err) {
    // Continue to database email lookup fallback
  }

  // 3. PRISMA DATABASE EMAIL LOOKUP FALLBACK
  try {
    const user = await prisma.user.findFirst({
      where: { email },
      select: { role: true },
    });

    if (user) {
      revalidatePath('/', 'layout');
      return routeByRole(user.role);
    }
  } catch (err) {
    // Ignore db errors
  }

  // DEFAULT DEV FALLBACK IF EMAIL CONTAINS RBT OR HR
  if (email.includes('rbt')) {
    revalidatePath('/', 'layout');
    redirect('/rbt');
  }

  revalidatePath('/', 'layout');
  redirect('/portal-hr');
}

function routeByRole(role: string) {
  switch (role) {
    case 'HEAD_HR':
    case 'HR':
    case 'HR_AGENT':
      redirect('/portal-hr');
    case 'RECRUITER':
    case 'ATS':
      redirect('/portal-hr/ats');
    case 'FINANCE':
    case 'PAYROLL':
      redirect('/portal-hr/payroll');
    case 'RBT':
      redirect('/rbt');
    case 'BCBA':
    case 'CLINICAL_DIRECTOR':
    case 'CLINICAL_SUPPORT':
      redirect('/portal-clinical');
    case 'CASE_COORDINATOR':
    case 'INTAKE_PA_COORDINATOR':
      redirect('/portal-case-coord');
    case 'OPS_DIRECTOR':
    case 'CEO':
    case 'ADMIN':
    case 'SUPER_ADMIN':
      redirect('/ops');
    default:
      redirect('/portal-hr');
  }
}
