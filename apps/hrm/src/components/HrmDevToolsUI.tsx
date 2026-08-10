'use client';

import React, { useState } from 'react';
import { UserCircle2, X, Check, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useHrmRole, HrmRole } from '@/lib/useHrmRole';
import { useTheme } from '@/components/layout/ThemeContext';

export function HrmDevToolsUI() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'roles' | 'users' | 'applicants'>('roles');
  const { role, setRole } = useHrmRole();
  const { colorMode } = useTheme();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const isLightMode = role === 'RBT' && colorMode === 'light';

  // Always render Dev Tools in HRM
  const isDevEnabled = true;

  const hrmRoles: { role: HrmRole; label: string; desc: string; route: string }[] = [
    { role: 'NONE', label: 'Public Unauthenticated (No Role)', desc: 'View front public landing page & career application portal', route: '/' },
    { role: 'APPLICANT', label: 'RBT Applicant (Onboarding Tasks Portal)', desc: 'View applicant onboarding tasks, 40-hr cert, simulation & interview booking', route: '/rbt' },
    { role: 'HEAD_HR', label: 'Head HR (Staffing & Case Dispatch)', desc: 'Assigns RBT candidates & dispatches to CRM Case Coordinators', route: '/' },
    { role: 'HR_AGENT', label: 'HR Agent (Recruiter / Onboarding)', desc: 'Manages ATS pipeline, interviews, and compliance', route: '/ats' },
    { role: 'FINANCE', label: 'Finance (Payroll & Compensation)', desc: 'Manages timesheets, billable therapy hours, and direct deposit', route: '/payroll' },
    { role: 'RBT', label: 'RBT Active Staff (Session EMR)', desc: 'Records trial data, BRP timers, and digital SOAP notes', route: '/rbt' },
  ];

  const activePersonnelUsers = [
    { id: 'usr-1', name: 'Eleanor Vance', role: 'HEAD_HR', email: 'eleanor.v@riseandshine.nyc', route: '/' },
    { id: 'usr-2', name: 'Marcus Vance', role: 'HR_AGENT', email: 'marcus.v@riseandshine.nyc', route: '/ats' },
    { id: 'usr-3', name: 'Emily Taylor', role: 'FINANCE', email: 'emily.t@riseandshine.nyc', route: '/payroll' },
    { id: 'usr-4', name: 'David Miller (Active RBT)', role: 'RBT', email: 'david.m@riseandshine.nyc', route: '/rbt' },
  ];

  const [dynamicApplicants, setDynamicApplicants] = useState<Array<{ id: string; name: string; email: string; role: string; appliedDate: string }>>([
    { id: 'c1', name: 'Jane Doe', email: 'jane.doe@gmail.com', role: 'RBT Applicant', appliedDate: '2026-08-04' },
    { id: 'c3', name: 'Emily Taylor', email: 'emily.t@yahoo.com', role: 'RBT Applicant', appliedDate: '2026-08-02' },
  ]);

  React.useEffect(() => {
    async function loadAllApplicants() {
      try {
        const { getAtsCandidates } = await import('@/app/actions/atsActions');
        const res = await getAtsCandidates();
        let fetched: Array<{ id: string; name: string; email: string; role: string; appliedDate: string }> = [];

        if (res.success && res.data) {
          fetched = res.data.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            role: `${c.roleApplied} Applicant`,
            appliedDate: c.appliedDate,
          }));
        }

        const storedApp = localStorage.getItem('ras_latest_submitted_app');
        if (storedApp) {
          const parsed = JSON.parse(storedApp);
          if (parsed.fullName && !fetched.some(a => a.email.toLowerCase() === parsed.email.toLowerCase())) {
            fetched.unshift({
              id: parsed.applicantId || `cand-${Date.now()}`,
              name: parsed.fullName,
              email: parsed.email,
              role: 'RBT Applicant (Submitted)',
              appliedDate: parsed.submittedAt ? parsed.submittedAt.split('T')[0] : 'Today',
            });
          }
        }

        let deletedIds: string[] = [];
        try {
          deletedIds = JSON.parse(localStorage.getItem('ras_deleted_applicants') || '[]');
        } catch (e) {}

        fetched = fetched.filter(a => !deletedIds.includes(a.id));

        setDynamicApplicants(fetched);
      } catch (e) {}
    }

    loadAllApplicants();
    window.addEventListener('storage', loadAllApplicants);
    window.addEventListener('focus', loadAllApplicants);
    return () => {
      window.removeEventListener('storage', loadAllApplicants);
      window.removeEventListener('focus', loadAllApplicants);
    };
  }, []);

  const handleCreateTestApplicant = async (name: string, email: string) => {
    try {
      const { submitRbtApplication } = await import('@/app/actions/publicRbt');
      const [firstName, lastName] = name.split(' ');
      const res = await submitRbtApplication({
        firstName: firstName || 'Test',
        lastName: lastName || 'Applicant',
        email: email,
        phoneNumber: '(555) 123-4567',
        addressLine1: '150 Court Street',
        city: 'Brooklyn',
        state: 'NY',
        zipCode: '11201',
        gender: 'female',
        ethnicity: 'not_specified',
        rbtStatus: 'Yes',
        preferredBoroughs: ['Brooklyn'],
        availabilityHours: ['Monday', 'Tuesday', 'Wednesday'],
        isAdult: true,
        backgroundCheckConsent: true,
        hasTransportation: true,
      });
      if (res.success) {
        toast.success(`✨ Created test applicant: ${name} (${email})! Opening ATS Pipeline...`);
        window.dispatchEvent(new Event('storage'));
        setRole('HR_AGENT');
        setTimeout(() => {
          window.location.href = '/ats';
        }, 500);
      } else {
        toast.error(res.error || 'Failed to create applicant');
      }
    } catch (e) {
      toast.error('Could not submit applicant');
    }
  };

  const handleResetRbtOnboarding = () => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (
          k.startsWith('ras_rbt_') || 
          k.startsWith('ras_ats_') || 
          k.startsWith('ras_help_') || 
          k.startsWith('ras_submitted_app_') ||
          k.startsWith('ras_applicant_') ||
          k.startsWith('ras_active_')
        )) {
          localStorage.removeItem(k);
        }
      }
    } catch (e) {}

    localStorage.removeItem('ras_rbt_cleared');
    localStorage.removeItem('ras_rbt_sim_completed');
    localStorage.removeItem('ras_rbt_simulation_completed');
    localStorage.removeItem('ras_rbt_tasks_done');
    localStorage.removeItem('ras_rbt_interview_done');
    localStorage.removeItem('ras_rbt_interview_passed');
    localStorage.removeItem('ras_rbt_interview_payload');
    localStorage.removeItem('ras_rbt_availability_set');
    localStorage.removeItem('ras_ats_custom_stages');
    localStorage.removeItem('ras_latest_submitted_app');

    window.dispatchEvent(new Event('rbt_clearance_changed'));
    window.dispatchEvent(new Event('rbt_sim_changed'));
    window.dispatchEvent(new Event('rbt_tasks_changed'));
    window.dispatchEvent(new Event('rbt_interview_changed'));
    window.dispatchEvent(new Event('rbt_availability_changed'));
    window.dispatchEvent(new Event('storage'));
    toast.success('🔄 Demo RBT Onboarding progress reset to initial locked state!');
  };

  const handleFastClearAll = () => {
    localStorage.setItem('ras_rbt_cleared', 'true');
    localStorage.setItem('ras_rbt_sim_completed', 'true');
    localStorage.setItem('ras_rbt_simulation_completed', 'true');
    localStorage.setItem('ras_rbt_tasks_done', 'true');
    localStorage.setItem('ras_rbt_interview_done', 'true');
    localStorage.setItem('ras_rbt_interview_passed', 'true');
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
    localStorage.setItem('hrm_active_role', newRole);
    window.dispatchEvent(new Event('hrm_role_changed'));
    toast.success(`Switched HRM Role to: ${label}`);
  };

  const handleGoToDashboard = (newRole: HrmRole, label: string, targetRoute: string) => {
    setActiveUserId(null);
    setRole(newRole);
    localStorage.setItem('hrm_active_role', newRole);
    window.dispatchEvent(new Event('hrm_role_changed'));
    toast.success(`Navigating to ${label} Dashboard (${targetRoute})...`);
    setIsOpen(false);
    window.location.href = targetRoute;
  };

  const handleSwitchUser = (user: typeof activePersonnelUsers[0]) => {
    setActiveUserId(user.id);
    setRole(user.role as HrmRole);
    localStorage.setItem('hrm_active_role', user.role);
    window.dispatchEvent(new Event('hrm_role_changed'));
    toast.success(`Impersonating Active User: ${user.name} (${user.role})`);
    setIsOpen(false);
    window.location.href = user.route;
  };

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
              className={`text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                activeTab === 'roles' 
                  ? 'bg-orange-500/20 text-[#F97316] border border-orange-500/40' 
                  : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              HRM Roles
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                activeTab === 'users' 
                  ? 'bg-orange-500/20 text-[#F97316] border border-orange-500/40' 
                  : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              Active Users
            </button>
            <button
              onClick={() => setActiveTab('applicants')}
              className={`text-xs font-bold px-2.5 py-1 rounded-xl transition-all cursor-pointer ${
                activeTab === 'applicants' 
                  ? 'bg-orange-500/20 text-[#F97316] border border-orange-500/40' 
                  : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              Applicants
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

            {activeTab === 'users' && (
              <div className="space-y-2">
                {activePersonnelUsers.map((u) => {
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
                        <span>Impersonate &amp; Open Portal</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'applicants' && (
              <div className="space-y-2">
                {dynamicApplicants.map((app) => {
                  let isApproved = false;
                  try {
                    const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
                    const candObj = customStages[app.id] || {};
                    const candidateStage = candObj.stage || 'APPLIED';
                    const candidateStatus = candObj.activationStatus || '';
                    isApproved = candidateStage === 'HIRED' || candidateStage === 'OFFER' || candidateStage === 'PHONE_SCREEN' || candidateStage === 'INTERVIEW' || candidateStatus === 'INVITATION_SENT' || localStorage.getItem('ras_rbt_interview_passed') === 'true';
                  } catch (e) {}

                  return (
                    <div key={app.id} className="p-3 rounded-2xl bg-zinc-900 border border-white/10 text-xs space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-extrabold text-white">{app.name}</h4>
                          <span className="text-[10px] text-zinc-400 font-mono">{app.email}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isApproved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {isApproved ? 'Approved ✓' : 'Pending HR'}
                        </span>
                      </div>

                      {!isApproved ? (
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px]">
                          <span>🔒 Pending HR Approval</span>
                          <p className="text-[9px] text-zinc-400 mt-0.5">
                            HR Agent Marcus Vance must approve this applicant on the ATS Pipeline board before impersonation opens.
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setActiveUserId(app.id);
                            setRole('APPLICANT');
                            localStorage.setItem('hrm_active_role', 'APPLICANT');
                            localStorage.setItem('ras_active_applicant_id', app.id);
                            localStorage.setItem('ras_active_impersonated_applicant_id', app.id);
                            localStorage.setItem('ras_active_impersonated_applicant_name', app.name);
                            localStorage.setItem('ras_active_impersonated_applicant_email', app.email);

                            const impersonatedPayload = {
                              applicantId: app.id,
                              fullName: app.name,
                              email: app.email,
                              submittedAt: app.appliedDate || new Date().toISOString().split('T')[0]
                            };
                            localStorage.setItem('ras_latest_submitted_app', JSON.stringify(impersonatedPayload));
                            localStorage.setItem(`ras_submitted_app_${app.id}`, JSON.stringify(impersonatedPayload));

                            window.dispatchEvent(new Event('hrm_role_changed'));
                            window.dispatchEvent(new Event('storage'));
                            toast.success(`Impersonating Applicant: ${app.name}`);
                            setIsOpen(false);
                            window.location.href = '/rbt';
                          }}
                          className="w-full bg-[#F97316] hover:bg-orange-600 text-white font-extrabold text-[10px] py-1.5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1 shadow-md"
                        >
                          <span>Impersonate Applicant Portal →</span>
                        </button>
                      )}

                      {/* Direct Applicant Manager Controls */}
                      <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                        <button
                          onClick={async () => {
                            try {
                              const { deleteAtsCandidate } = await import('@/app/actions/atsActions');
                              await deleteAtsCandidate(app.id);
                              const customStages = JSON.parse(localStorage.getItem('ras_ats_custom_stages') || '{}');
                              delete customStages[app.id];
                              localStorage.setItem('ras_ats_custom_stages', JSON.stringify(customStages));
                              localStorage.removeItem(`ras_submitted_app_${app.id}`);
                              
                              const deletedIds = JSON.parse(localStorage.getItem('ras_deleted_applicants') || '[]');
                              if (!deletedIds.includes(app.id)) {
                                deletedIds.push(app.id);
                                localStorage.setItem('ras_deleted_applicants', JSON.stringify(deletedIds));
                              }

                              window.dispatchEvent(new Event('storage'));
                              toast.success(`Deleted applicant: ${app.name}`);
                              setDynamicApplicants(prev => prev.filter(a => a.id !== app.id));
                            } catch (e) {
                              toast.error('Failed to delete applicant.');
                            }
                          }}
                          className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold py-1 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete Applicant</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DEMO ONBOARDING QUICK ACTIONS */}
          <div className="pt-3 mt-3 border-t border-slate-200 space-y-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              🛠️ Quick Test Applicant Generator
            </span>
            <button
              onClick={() => handleCreateTestApplicant('Jane Doe', `jane.${Date.now().toString().slice(-4)}@gmail.com`)}
              className="w-full bg-[#F97316] hover:bg-orange-600 text-white text-[10px] font-black py-1.5 px-2 rounded-xl cursor-pointer transition-colors text-center shadow-md flex items-center justify-center gap-1"
            >
              <span>➕ Seed New Applicant (Jane Doe)</span>
            </button>
            <div className="flex gap-1.5 pt-1">
              <button
                onClick={handleResetRbtOnboarding}
                className="flex-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 text-[10px] font-black py-1.5 px-2 rounded-xl cursor-pointer transition-colors text-center shadow-xs"
              >
                🔄 Reset State
              </button>
              <button
                onClick={handleFastClearAll}
                className="flex-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-[10px] font-black py-1.5 px-2 rounded-xl cursor-pointer transition-colors text-center shadow-xs"
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
