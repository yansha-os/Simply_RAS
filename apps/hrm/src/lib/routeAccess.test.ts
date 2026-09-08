import { describe, expect, it } from 'vitest';
import { isApplicantPath, isPublicPath, isStaffProtectedPath } from './routeAccess';

describe('HRM route access classification', () => {
  it.each(['/', '/login', '/apply', '/public', '/api/health', '/magic-link/token'])(
    'keeps %s public',
    (pathname) => expect(isPublicPath(pathname)).toBe(true)
  );

  it.each(['/rbt', '/rbt/schedule', '/rbt/session/abc'])(
    'classifies %s as applicant/RBT access',
    (pathname) => {
      expect(isApplicantPath(pathname)).toBe(true);
      expect(isStaffProtectedPath(pathname)).toBe(false);
    }
  );

  it.each([
    '/hr-dashboard',
    '/ats',
    '/clients',
    '/onboarding',
    '/payroll',
    '/session-emr',
    '/rbt-manager',
    '/api/documents',
  ])('classifies %s as staff-protected', (pathname) => {
    expect(isStaffProtectedPath(pathname)).toBe(true);
  });
});
