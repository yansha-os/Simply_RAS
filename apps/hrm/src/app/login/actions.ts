'use server';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
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
      redirect('/hr-dashboard');
    }
    if (email.includes('ats@') || email.includes('recruiter')) {
      revalidatePath('/', 'layout');
      redirect('/ats');
    }
    if (email.includes('payroll@') || email.includes('finance')) {
      revalidatePath('/', 'layout');
      redirect('/payroll');
    }
    if (email.includes('rbt@')) {
      revalidatePath('/', 'layout');
      redirect('/rbt');
    }
    if (email.includes('ops@') || email.includes('admin@') || email.includes('ceo@')) {
      revalidatePath('/', 'layout');
      redirect('/hr-dashboard');
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
      throw err;
    }
    return { error: 'Sign-in failed. Please try again.' };
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

function routeByRole(role: string): never {
  switch (role) {
    case 'HEAD_HR':
    case 'HR':
    case 'HR_AGENT':
    case 'CEO':
    case 'OPS_DIRECTOR':
    case 'ADMIN':
    case 'SUPER_ADMIN':
      redirect('/hr-dashboard');
    case 'RECRUITER':
    case 'ATS':
      redirect('/ats');
    case 'FINANCE':
    case 'PAYROLL':
      redirect('/payroll');
    case 'RBT':
      redirect('/rbt');
    default:
      redirect('/');
  }
}
