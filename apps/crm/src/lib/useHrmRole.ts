'use client';

import { useState, useEffect } from 'react';

export type HrmRole = 'HEAD_HR' | 'HR_AGENT' | 'FINANCE' | 'RBT' | 'NONE';

const VALID_ROLES: HrmRole[] = ['HEAD_HR', 'HR_AGENT', 'FINANCE', 'RBT', 'NONE'];

function isDevRoleSwitcherEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true';
}

/** Client UI hint only — server auth is authoritative. */
export function useHrmRole() {
  const [role, setRoleState] = useState<HrmRole>('NONE');

  useEffect(() => {
    const saved = localStorage.getItem('hrm_active_role') as HrmRole | null;
    if (saved && VALID_ROLES.includes(saved)) {
      if (saved !== 'NONE' && !isDevRoleSwitcherEnabled()) {
        setRoleState('NONE');
        return;
      }
      setRoleState(saved);
    }

    const handleStorage = () => {
      const updated = localStorage.getItem('hrm_active_role') as HrmRole | null;
      if (updated && VALID_ROLES.includes(updated)) {
        if (updated !== 'NONE' && !isDevRoleSwitcherEnabled()) {
          setRoleState('NONE');
          return;
        }
        setRoleState(updated);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('hrm_role_changed', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('hrm_role_changed', handleStorage);
    };
  }, []);

  const setRole = (newRole: HrmRole) => {
    if (!VALID_ROLES.includes(newRole)) return;
    if (newRole !== 'NONE' && !isDevRoleSwitcherEnabled()) return;
    localStorage.setItem('hrm_active_role', newRole);
    setRoleState(newRole);
    window.dispatchEvent(new Event('hrm_role_changed'));
  };

  return { role, setRole };
}
