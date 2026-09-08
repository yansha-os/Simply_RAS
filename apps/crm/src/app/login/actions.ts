'use server';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies, headers } from 'next/headers';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import {
  loginRateLimitKey,
  isLoginRateLimited,
  recordLoginAttempt,
  clearLoginAttempts,
} from '@/lib/loginRateLimit';

/**
 * MFA (readiness gap 18): do NOT build custom MFA here. Supabase supports
 * TOTP MFA out of the box — enable it dashboard-side, see the
 * "Supabase MFA & auth rate limits" section in docs/ENV.md.
 */
export async function login(prevState: { error?: string } | null, formData: FormData) {
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const password = String(formData.get('password') || '');

  if (!email) {
    return { error: 'Email address is required.' };
  }

  if (!password) {
    return { error: 'Password is required.' };
  }

  if (email.length > 254 || password.length > 1_024) {
    return { error: 'Invalid email or password.' };
  }

  // DEV-ONLY: email-pattern shortcuts for local portal testing. Gated behind
  // isDevToolsEnabled() (non-prod NODE_ENV + explicit flag, with a boot-time
  // assert that kills a misconfigured prod build). In a prod-configured env
  // only real Supabase sign-in below can succeed.
  if (isDevToolsEnabled()) {
    if (email.includes('hr@') || email.includes('head_hr')) {
      revalidatePath('/', 'layout');
      redirect(hrmUrl('/hr-dashboard'));
    }
    if (email.includes('ats@') || email.includes('recruiter')) {
      revalidatePath('/', 'layout');
      redirect(hrmUrl('/ats'));
    }
    if (email.includes('payroll@')) {
      revalidatePath('/', 'layout');
      redirect(hrmUrl('/payroll'));
    }
    if (email.includes('intake@') || email.includes('intake_pa')) {
      revalidatePath('/', 'layout');
      redirect('/portal-case');
    }
    if (email.includes('finance@') || email.includes('billing@')) {
      revalidatePath('/', 'layout');
      redirect('/portal-billing');
    }
    if (email.includes('notes@') || email.includes('session_notes')) {
      revalidatePath('/', 'layout');
      redirect('/portal-billing');
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
  }

  const rateLimitKey = loginRateLimitKey(email, await clientIp());
  if (isLoginRateLimited(rateLimitKey)) {
    // Generic message on purpose: no hint whether the account exists.
    return { error: 'Too many sign-in attempts. Please try again later.' };
  }
  recordLoginAttempt(rateLimitKey);

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user?.id) {
      return { error: 'Invalid email or password.' };
    }

    const user = await prisma.user.findUnique({
      where: { id: data.user.id },
      select: { role: true, isActive: true },
    });

    if (!user) {
      await supabase.auth.signOut();
      return { error: 'No staff profile is linked to this account. Contact an administrator.' };
    }

    if (user.isActive === false) {
      await supabase.auth.signOut();
      return { error: 'This account is inactive. Contact an administrator.' };
    }

    clearLoginAttempts(rateLimitKey);
    revalidatePath('/', 'layout');
    return routeByRole(user.role);
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) {
      throw err; // Next.js redirect
    }
    return { error: 'Sign-in failed. Please try again.' };
  }
}

export async function logout(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) {
      return { success: false, error: 'Sign-out failed. Please try again.' };
    }

    const cookieStore = await cookies();
    cookieStore.delete('dev_impersonate_user_id');
    cookieStore.delete('dev_impersonate_role');
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) {
    console.error(
      'Action failed [logout]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return { success: false, error: 'Sign-out failed. Please try again.' };
  }
}

async function clientIp(): Promise<string> {
  const hdrs = await headers();
  return (
    hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    hdrs.get('x-real-ip') ||
    'unknown'
  );
}

function hrmUrl(path: string): string {
  return `${(process.env.NEXT_PUBLIC_HRM_URL || 'http://localhost:3001').replace(/\/$/, '')}${path}`;
}

function routeByRole(role: string): never {
  switch (role) {
    case 'HEAD_HR':
    case 'HR':
    case 'HR_AGENT':
      redirect(hrmUrl('/hr-dashboard'));
    case 'RECRUITER':
    case 'ATS':
      redirect(hrmUrl('/ats'));
    case 'PAYROLL':
      redirect(hrmUrl('/payroll'));
    case 'FINANCE':
      redirect('/portal-billing');
    case 'RBT':
      redirect('/rbt');
    case 'BCBA':
    case 'CLINICAL_DIRECTOR':
      redirect('/portal-clinical');
    case 'CLINICAL_SUPPORT':
      redirect('/clinical-support');
    case 'INTAKE_PA_COORDINATOR':
      redirect('/portal-case');
    case 'CASE_COORDINATOR':
      redirect('/portal-case-coord');
    case 'SESSION_NOTES_COORDINATOR':
    case 'BILLING':
      redirect('/portal-billing');
    case 'OPS_DIRECTOR':
    case 'CEO':
    case 'ADMIN':
    case 'SUPER_ADMIN':
      redirect('/ops');
    default:
      redirect('/');
  }
}
