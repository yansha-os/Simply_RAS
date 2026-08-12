'use client';

import { useState, useEffect } from 'react';
import { resolveHrmUiRole } from '@/app/actions/resolveHrmRole';

export type HrmRole = 'HEAD_HR' | 'HR_AGENT' | 'FINANCE' | 'RBT' | 'APPLICANT' | 'NONE';

const VALID_ROLES: HrmRole[] = ['HEAD_HR', 'HR_AGENT', 'FINANCE', 'RBT', 'APPLICANT', 'NONE'];

/** Roles the product may set without Dev Tools (device session / hire promotion). */
const PRODUCT_ROLES: HrmRole[] = ['APPLICANT', 'RBT', 'NONE'];

const STAFF_DEMO_ROLES: HrmRole[] = ['HEAD_HR', 'HR_AGENT', 'FINANCE'];

function isDevRoleSwitcherEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true';
}

function readStoredRole(): HrmRole {
  if (typeof window === 'undefined') return 'NONE';
  try {
    const saved = localStorage.getItem('hrm_active_role') as HrmRole | null;
    if (saved && VALID_ROLES.includes(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'NONE';
}

/**
 * Client UI role hint only — never trust for authorization.
 * Staff access is enforced by middleware + server actions (Supabase session / dev impersonation cookies).
 * Hire promotion: device-session HIRED → RBT (not APPLICANT).
 * Dev Tools staff roles still win when explicitly selected.
 *
 * Initial state must be identical on server and first client paint ('NONE') to avoid
 * hydration mismatches (HrmLayoutWrapper branches on RBT light mode). Sync localStorage
 * in useEffect immediately after mount.
 */
export function useHrmRole() {
  const [role, setRoleState] = useState<HrmRole>('NONE');

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (cancelled) return;

      const saved = readStoredRole();

      // Paint sticky local role ASAP after mount (avoids lasting chrome flash)
      if (saved !== 'NONE') {
        if (STAFF_DEMO_ROLES.includes(saved) && isDevRoleSwitcherEnabled()) {
          setRoleState(saved);
          return;
        }
        if (PRODUCT_ROLES.includes(saved) || isDevRoleSwitcherEnabled()) {
          setRoleState(saved);
        }
      }

      // Dev Tools: keep Head HR / HR Agent / Finance switches sticky
      if (isDevRoleSwitcherEnabled() && saved && STAFF_DEMO_ROLES.includes(saved)) {
        return;
      }

      try {
        const serverRole = await resolveHrmUiRole();
        if (cancelled) return;

        // Hired device session → official RBT (override stale APPLICANT localStorage)
        if (serverRole === 'RBT') {
          localStorage.setItem('hrm_active_role', 'RBT');
          setRoleState('RBT');
          return;
        }
        if (serverRole === 'APPLICANT') {
          // Don't demote an explicit Active RBT staff impersonation
          if (saved === 'RBT') {
            setRoleState('RBT');
            return;
          }
          localStorage.setItem('hrm_active_role', 'APPLICANT');
          setRoleState('APPLICANT');
          return;
        }
        // Keep Active RBT / Applicant impersonation sticky — do not flash staff chrome
        // when Supabase session is still Head HR underneath Dev Tools impersonation.
        if (saved === 'RBT' || saved === 'APPLICANT') {
          setRoleState(saved);
          return;
        }
        if (serverRole !== 'NONE' && !isDevRoleSwitcherEnabled()) {
          setRoleState(serverRole);
          return;
        }
      } catch {
        // fall through — keep sticky local role
      }

      if (cancelled) return;

      if (isDevRoleSwitcherEnabled() && saved && VALID_ROLES.includes(saved)) {
        setRoleState(saved);
        return;
      }

      if (saved && VALID_ROLES.includes(saved)) {
        if (!PRODUCT_ROLES.includes(saved) && !isDevRoleSwitcherEnabled()) {
          setRoleState('NONE');
          return;
        }
        setRoleState(saved);
      }
    }

    hydrate();

    const handleStorage = () => {
      const updated = readStoredRole();
      if (updated && VALID_ROLES.includes(updated)) {
        if (!PRODUCT_ROLES.includes(updated) && !isDevRoleSwitcherEnabled()) {
          setRoleState('NONE');
          return;
        }
        setRoleState(updated);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('hrm_role_changed', handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('hrm_role_changed', handleStorage);
    };
  }, []);

  const setRole = (newRole: HrmRole) => {
    if (!VALID_ROLES.includes(newRole)) return;
    if (!PRODUCT_ROLES.includes(newRole) && !isDevRoleSwitcherEnabled()) {
      return;
    }
    localStorage.setItem('hrm_active_role', newRole);
    setRoleState(newRole);
    window.dispatchEvent(new Event('hrm_role_changed'));
  };

  return { role, setRole };
}
