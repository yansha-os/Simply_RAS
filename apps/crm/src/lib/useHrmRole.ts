'use client';

import { useSyncExternalStore } from 'react';

export type HrmRole = 'HEAD_HR' | 'HR_AGENT' | 'FINANCE' | 'RBT' | 'NONE';

const VALID_ROLES: HrmRole[] = ['HEAD_HR', 'HR_AGENT', 'FINANCE', 'RBT', 'NONE'];

function isDevRoleSwitcherEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true';
}

function getStoredRole(): HrmRole {
  const saved = localStorage.getItem('hrm_active_role');
  if (!saved || !VALID_ROLES.includes(saved as HrmRole)) return 'NONE';
  const role = saved as HrmRole;
  return role !== 'NONE' && !isDevRoleSwitcherEnabled() ? 'NONE' : role;
}

function subscribeToRole(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener('hrm_role_changed', onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener('hrm_role_changed', onStoreChange);
  };
}

const getServerRole = (): HrmRole => 'NONE';

/** Client UI hint only — server auth is authoritative. */
export function useHrmRole() {
  const role = useSyncExternalStore(subscribeToRole, getStoredRole, getServerRole);

  const setRole = (newRole: HrmRole) => {
    if (!VALID_ROLES.includes(newRole)) return;
    if (newRole !== 'NONE' && !isDevRoleSwitcherEnabled()) return;
    localStorage.setItem('hrm_active_role', newRole);
    window.dispatchEvent(new Event('hrm_role_changed'));
  };

  return { role, setRole };
}
