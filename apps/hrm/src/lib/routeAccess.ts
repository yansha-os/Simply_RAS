const PUBLIC_EXACT = new Set(['/', '/login', '/public', '/apply', '/api/health']);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || pathname.startsWith('/magic-link');
}

/** Applicant portal under /rbt/* (not /rbt-manager). */
export function isApplicantPath(pathname: string): boolean {
  return (
    (pathname === '/rbt' || pathname.startsWith('/rbt/')) &&
    !pathname.startsWith('/rbt-manager')
  );
}

export function isStaffProtectedPath(pathname: string): boolean {
  if (isPublicPath(pathname) || isApplicantPath(pathname)) return false;
  return (
    pathname.startsWith('/hr-dashboard') ||
    pathname.startsWith('/ats') ||
    pathname.startsWith('/clients') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/payroll') ||
    pathname.startsWith('/session-emr') ||
    pathname.startsWith('/rbt-manager') ||
    pathname.startsWith('/api/')
  );
}
