'use client';

import { useState, useEffect } from 'react';

export type HrmRole = 'HEAD_HR' | 'HR_AGENT' | 'FINANCE' | 'RBT';

export function useHrmRole() {
  const [role, setRoleState] = useState<HrmRole>('HEAD_HR');

  useEffect(() => {
    const saved = localStorage.getItem('hrm_active_role') as HrmRole;
    if (saved && ['HEAD_HR', 'HR_AGENT', 'FINANCE', 'RBT'].includes(saved)) {
      setRoleState(saved);
    }

    const handleStorage = () => {
      const updated = localStorage.getItem('hrm_active_role') as HrmRole;
      if (updated && ['HEAD_HR', 'HR_AGENT', 'FINANCE', 'RBT'].includes(updated)) {
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
    localStorage.setItem('hrm_active_role', newRole);
    setRoleState(newRole);
    window.dispatchEvent(new Event('hrm_role_changed'));
  };

  return { role, setRole };
}
