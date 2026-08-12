'use client';

import React, { useState } from 'react';
import { UserCircle2, X, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useHrmRole, HrmRole } from '@/lib/useHrmRole';
import { useTheme } from '@/components/layout/ThemeContext';

export function HrmDevToolsUI() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles');
  const { role, setRole } = useHrmRole();
  const { colorMode } = useTheme();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const isLightMode = role === 'RBT' && colorMode === 'light';

  const isDevEnabled =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === 'true';

  const hrmRoles: { role: HrmRole; label: string; desc: string; route: string }[] = [
    { role: 'HEAD_HR', label: 'Head HR (Staffing & Case Dispatch)', desc: 'Assigns RBT candidates & dispatches to CRM Case Coordinators', route: '/portal-hr' },
    { role: 'HR_AGENT', label: 'HR Agent (Recruiter / Onboarding)', desc: 'Manages ATS pipeline, interviews, and compliance', route: '/portal-hr/ats' },
    { role: 'FINANCE', label: 'Finance (Payroll & Compensation)', desc: 'Manages timesheets, billable therapy hours, and direct deposit', route: '/portal-hr/payroll' },
    { role: 'RBT', label: 'RBT Therapy Staff (Session EMR)', desc: 'Records trial data, BRP timers, and digital SOAP notes', route: '/rbt' },
  ];

  const activePersonnelUsers = [
    { id: 'usr-1', name: 'Sarah Jenkins', role: 'HEAD_HR', email: 'sarah.j@riseandshine.nyc', route: '/portal-hr' },
    { id: 'usr-2', name: 'Marcus Vance', role: 'HR_AGENT', email: 'marcus.v@riseandshine.nyc', route: '/portal-hr/ats' },
    { id: 'usr-3', name: 'Emily Taylor', role: 'FINANCE', email: 'emily.t@riseandshine.nyc', route: '/portal-hr/payroll' },
    { id: 'usr-4', name: 'David Miller', role: 'RBT', email: 'david.m@riseandshine.nyc', route: '/rbt' },
  ];

  const handleResetRbtOnboarding = () => {
    localStorage.removeItem('ras_rbt_cleared');
    localStorage.removeItem('ras_rbt_sim_completed');
    localStorage.removeItem('ras_rbt_simulation_completed');
    localStorage.removeItem('ras_rbt_tasks_done');
    localStorage.removeItem('ras_rbt_interview_done');
    localStorage.removeItem('ras_rbt_availability_set');
    window.dispatchEvent(new Event('rbt_clearance_changed'));
    window.dispatchEvent(new Event('rbt_sim_changed'));
    window.dispatchEvent(new Event('rbt_tasks_changed'));
    window.dispatchEvent(new Event('rbt_interview_changed'));
    window.dispatchEvent(new Event('rbt_availability_changed'));
    toast.success('🔄 Demo RBT Onboarding progress reset to initial locked state!');
  };

  const handleFastClearAll = () => {
    localStorage.setItem('ras_rbt_cleared', 'true');
    localStorage.setItem('ras_rbt_sim_completed', 'true');
    localStorage.setItem('ras_rbt_simulation_completed', 'true');
    localStorage.setItem('ras_rbt_tasks_done', 'true');
    localStorage.setItem('ras_rbt_interview_done', 'true');
    localStorage.setItem('ras_rbt_availability_set', 'true');
    window.dispatchEvent(new Event('rbt_clearance_changed'));
    window.dispatchEvent(new Event('rbt_sim_changed'));
    window.dispatchEvent(new Event('rbt_tasks_changed'));
    window.dispatchEvent(new Event('rbt_interview_changed'));
    window.dispatchEvent(new Event('rbt_availability_changed'));
    toast.success('✨ Fast-Cleared all RBT onboarding requirements!');
  };

  const handleSwitchRole = (newRole: HrmRole, label: string) => {
    setActiveUserId(null);
    setRole(newRole);
    toast.success(`Switched HRM Role to: ${label}`);
  };

  const handleGoToDashboard = (newRole: HrmRole, label: string, targetRoute: string) => {
    setActiveUserId(null);
    setRole(newRole);
    toast.success(`Navigating to ${label} Dashboard (${targetRoute})...`);
    setIsOpen(false);
    window.location.assign(targetRoute);
  };

  const handleSwitchUser = (user: typeof activePersonnelUsers[0]) => {
    setActiveUserId(user.id);
    setRole(user.role as HrmRole);
    toast.success(`Impersonating Active User: ${user.name} (${user.role})`);
    setIsOpen(false);
    window.location.assign(user.route);
  };

  if (!isDevEnabled) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-6 z-[999999]">
      {!isOpen ? (
        <button
          suppressHydrationWarning
          onClick={() => setIsOpen(true)}
          className="w-13 h-13 rounded-full shadow-2xl flex items-center justify-center border-2 transition-all hover:scale-110 cursor-pointer bg-zinc-950 border-brand-orange-500/50 shadow-[0_0_20px_rgba(255,122,69,0.3)] text-brand-orange-400"
          title="HRM Developer Tools"
        >
          <UserCircle2 className="w-7 h-7" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#F97316] rounded-full animate-pulse border-2 border-zinc-950" />
        </button>
      ) : (
        <div className="devtools-panel p-4 rounded-3xl shadow-2xl w-80 mb-2 animate-in slide-in-from-bottom-5 bg-zinc-950 border border-zinc-700 text-white">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-black text-sm flex items-center gap-2 font-heading text-white">
              <UserCircle2 className="w-4 h-4 text-[#F97316]" />
              Dev Impersonation (HRM)
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white cursor-pointer font-bold">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2 mb-3 border-b border-zinc-800 pb-2">
            <button
              onClick={() => setActiveTab('roles')}
              className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                activeTab === 'roles' 
                  ? 'bg-orange-500/20 text-[#F97316] border border-orange-500/40' 
                  : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              HRM Roles
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`text-xs font-bold px-3 py-1 rounded-xl transition-all cursor-pointer ${
                activeTab === 'users' 
                  ? 'bg-orange-500/20 text-[#F97316] border border-orange-500/40' 
                  : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              Active Users
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {activeTab === 'roles' &&
              hrmRoles.map((r) => {
                const isSelected = !activeUserId && role === r.role;
                return (
                  <div
                    key={r.role}
                    className={`p-2.5 rounded-2xl text-xs flex flex-col gap-1.5 border transition-all ${
                      isSelected
                        ? (isLightMode ? 'bg-orange-50 border-orange-300 text-slate-900 font-bold' : 'bg-brand-orange-500/20 text-brand-orange-400 border-brand-orange-500/40 font-bold')
                        : (isLightMode ? 'bg-[#F0F7FF] text-slate-700 border-blue-200' : 'bg-zinc-900 text-zinc-400 border-white/5')
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold">{r.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#F97316] shrink-0" />}
                    </div>
                    <span className="text-[10px] text-slate-600 font-medium leading-relaxed">{r.desc}</span>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                      <button
                        onClick={() => handleSwitchRole(r.role, r.label)}
                        className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 text-[10px] font-bold py-1 px-2 rounded-xl cursor-pointer transition-colors text-center"
                      >
                        Set Role Only
                      </button>
                      <button
                        onClick={() => handleGoToDashboard(r.role, r.label, r.route)}
                        className="flex-1 bg-[#F97316] hover:bg-orange-600 text-white text-[10px] font-black py-1 px-2 rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1 shadow-sm"
                      >
                        <span>Open Dashboard</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

            {activeTab === 'users' &&
              activePersonnelUsers.map((u) => {
                const isSelected = activeUserId === u.id;
                return (
                  <div
                    key={u.id}
                    className={`p-2.5 rounded-2xl text-xs flex flex-col gap-1.5 border transition-all ${
                      isSelected
                        ? 'bg-blue-100 text-blue-900 border-blue-300 font-bold'
                        : (isLightMode ? 'bg-[#F0F7FF] text-slate-700 border-blue-200' : 'bg-zinc-900 text-zinc-400 border-white/5')
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold">{u.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-100 text-[#F97316] font-bold">
                        {u.role}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-600 font-mono">{u.email}</span>

                    <button
                      onClick={() => handleSwitchUser(u)}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black py-1.5 px-2 rounded-xl cursor-pointer transition-colors flex items-center justify-center gap-1 shadow-sm mt-1"
                    >
                      <span>Impersonate &amp; Open Dashboard</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
          </div>

          {/* DEMO ONBOARDING QUICK ACTIONS */}
          <div className="pt-3 mt-3 border-t border-slate-200 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
              🛠️ Demo Onboarding State Controls
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={handleResetRbtOnboarding}
                className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-black py-1.5 px-2 rounded-xl cursor-pointer transition-colors text-center shadow-xs"
              >
                🔄 Reset Demo State
              </button>
              <button
                onClick={handleFastClearAll}
                className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-black py-1.5 px-2 rounded-xl cursor-pointer transition-colors text-center shadow-xs"
              >
                ✨ Fast-Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
