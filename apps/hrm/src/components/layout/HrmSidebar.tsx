'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useHrmRole, HrmRole } from '@/lib/useHrmRole';
import { useTheme } from '@/components/layout/ThemeContext';
import { ensureActiveApplicantId, getActiveApplicantName } from '@/lib/syncAtsProgress';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Activity, 
  Calendar,
  ClipboardList,
  Video,
  MessageSquare,
  Clock,
  HeartHandshake,
  Shield,
  Briefcase,
  UserCheck,
  CreditCard,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  name: string;
  href?: string;
  icon?: LucideIcon;
  isHeader?: boolean;
  isSubItem?: boolean;
  hasSubItems?: boolean;
}

export function HrmSidebar() {
  const { role } = useHrmRole();
  const { colorMode } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  
  const [isHired, setIsHired] = useState(false);
  const [isSimCompleted, setIsSimCompleted] = useState(false);
  const [isInterviewDone, setIsInterviewDone] = useState(false);
  const [isAvailabilitySet, setIsAvailabilitySet] = useState(false);
  const [isTasksDone, setIsTasksDone] = useState(false);

  // Accordion state for parent tabs with sub-items
  const [isAtsSubMenuOpen, setIsAtsSubMenuOpen] = useState(true);

  const isRbtRoute = pathname?.startsWith('/rbt') ?? false;
  const isRbtLightMode = isRbtRoute || ((role === 'RBT' || role === 'APPLICANT') && colorMode === 'light');

  useEffect(() => {
    const loadFromDb = (force = false) => {
      void import('@/lib/syncAtsProgress').then(({ loadAtsProgress, isLiveStaffRbtUnlocked }) =>
        loadAtsProgress(force).then((data) => {
          if (!data) {
            // Seed Active RBT (David Miller) has no ATS candidate — still staff
            if (isLiveStaffRbtUnlocked()) setIsHired(true);
            return;
          }
          setIsHired(isLiveStaffRbtUnlocked(data.stage));
          setIsSimCompleted(data.simulationDone);
          setIsInterviewDone(data.interviewPassed || data.interviewBooked);
          setIsAvailabilitySet(data.availabilityDone);
          setIsTasksDone(data.tasksDone);
        })
      );
    };

    loadFromDb(false);
    const onChange = () => loadFromDb(true);
    window.addEventListener('rbt_clearance_changed', onChange);
    window.addEventListener('rbt_sim_changed', onChange);
    window.addEventListener('rbt_tasks_changed', onChange);
    window.addEventListener('rbt_interview_changed', onChange);
    window.addEventListener('rbt_availability_changed', onChange);
    window.addEventListener('rbt_progress_synced', onChange);

    return () => {
      window.removeEventListener('rbt_clearance_changed', onChange);
      window.removeEventListener('rbt_sim_changed', onChange);
      window.removeEventListener('rbt_tasks_changed', onChange);
      window.removeEventListener('rbt_interview_changed', onChange);
      window.removeEventListener('rbt_availability_changed', onChange);
      window.removeEventListener('rbt_progress_synced', onChange);
    };
  }, []);

  // Hired / wage-signed candidates are official RBTs — promote UI role off APPLICANT
  useEffect(() => {
    void import('@/lib/syncAtsProgress').then(({ ensureHiredAsRbtStaff }) =>
      ensureHiredAsRbtStaff()
    );
  }, []);

  const interviewDoneOrBooked = isInterviewDone;

  // After hire OR seed Active RBT: staff surfaces only. Applicant tabs 1–5 are hidden.
  const showStaffRbtNav = isHired || role === 'RBT';
  const rbtNavItems: NavItem[] = showStaffRbtNav
    ? [
        { name: 'Dashboard Overview', href: '/rbt', icon: LayoutDashboard },
        { name: 'Schedule', href: '/rbt/schedule', icon: Calendar },
        { name: 'Job Board', href: '/rbt/job-board', icon: Briefcase },
        { name: 'Communication', href: '/rbt/communication', icon: MessageSquare },
        { name: 'Payroll', href: '/rbt/payroll', icon: CreditCard },
        { name: 'Help Desk', href: '/rbt/help-desk', icon: HeartHandshake },
      ]
    : [
        { name: isTasksDone ? '✓ 1. Tasks & Consent' : '1. My Tasks & Onboarding', href: '/rbt', icon: ClipboardList },
        { name: isSimCompleted ? '✓ 2. Data Simulator' : '2. Data Simulator', href: '/rbt/simulation', icon: Activity },
        { name: isAvailabilitySet ? '✓ 3. My Availability' : '3. My Availability', href: '/rbt/availability', icon: Clock },
        { name: interviewDoneOrBooked ? '✓ 4. HR Interview' : '4. HR Interview', href: '/rbt/interview', icon: Video },
        { name: '5. 40-Hr Course Upload', href: '/rbt/documents', icon: FileText },
        { name: 'Help Desk', href: '/rbt/help-desk', icon: MessageSquare },
      ];

  // Bounce deeper onboarding tabs after hire — but NEVER bounce `/rbt` itself.
  // assertApplicantHired redirects failures to `/rbt`; bouncing that to `/rbt/schedule`
  // (which also asserts) caused an infinite tab loop.
  useEffect(() => {
    if (!isHired || !pathname) return;
    if (role !== 'RBT' && role !== 'APPLICANT') return;
    const onApplicantTab =
      pathname.startsWith('/rbt/simulation') ||
      pathname.startsWith('/rbt/availability') ||
      pathname.startsWith('/rbt/interview') ||
      pathname.startsWith('/rbt/documents');
    if (onApplicantTab) {
      router.replace('/rbt/schedule');
    }
  }, [isHired, pathname, role, router]);

  const roleNavItems: Record<HrmRole, NavItem[]> = {
    HEAD_HR: [
      { name: 'Command Center', href: '/', icon: LayoutDashboard },
      { name: 'ATS Applicants', href: '/ats', icon: FileText, hasSubItems: true },
      { name: 'Help Tickets', href: '/ats/help-tickets', icon: MessageSquare, isSubItem: true },
      { name: 'RBT Staff Manager', href: '/rbt-manager', icon: UserCheck },
      { name: 'Staff Credentials', href: '/hr-dashboard/credentials', icon: Shield },
      { name: 'Case staffing note', href: '/clients', icon: Users },
      { name: 'Session EMR & Notes', href: '/session-emr', icon: Activity },
      { name: 'Payroll & Comp', href: '/payroll', icon: Calendar },
    ],
    HR_AGENT: [
      { name: 'HR Analytics & Stats', href: '/hr-dashboard', icon: LayoutDashboard },
      { name: 'ATS Applicant Pipeline', href: '/ats', icon: FileText, hasSubItems: true },
      { name: 'Help Tickets', href: '/ats/help-tickets', icon: MessageSquare, isSubItem: true },
      { name: 'RBT Staff Manager', href: '/rbt-manager', icon: UserCheck },
      { name: 'Case staffing note', href: '/clients', icon: Users },
    ],
    FINANCE: [
      { name: 'Payroll & Compensation', href: '/payroll', icon: Calendar },
      { name: 'Financial Overview', href: '/', icon: LayoutDashboard },
    ],
    RBT: rbtNavItems,
    APPLICANT: rbtNavItems,
    NONE: [],
  };

  const navItems = roleNavItems[role] ?? [];

  // Active route checking helper — exact /rbt must not match all /rbt/* children
  const isRouteActive = (href?: string) => {
    if (!href || !pathname) return false;
    if (href === '/') return pathname === '/';
    if (href === '/rbt') return pathname === '/rbt';
    // /ats parent covers applicant detail pages, but not help-tickets (its own nav sub-item)
    if (href === '/ats')
      return (
        (pathname === '/ats' || pathname.startsWith('/ats/')) &&
        !pathname.startsWith('/ats/help-tickets')
      );
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const [applicantName, setApplicantName] = useState<string>('Jane Doe');

  useEffect(() => {
    function loadName() {
      try {
        const impName = getActiveApplicantName();
        if (impName) {
          setApplicantName(impName);
          return;
        }
      } catch {}
    }
    void ensureActiveApplicantId().then(() => loadName());
    loadName();
    window.addEventListener('storage', loadName);
    window.addEventListener('hrm_role_changed', loadName);
    window.addEventListener('ras_applicant_session_changed', loadName);
    return () => {
      window.removeEventListener('storage', loadName);
      window.removeEventListener('hrm_role_changed', loadName);
      window.removeEventListener('ras_applicant_session_changed', loadName);
    };
  }, []);

  const hrAgentNames: Record<string, string> = {
    HEAD_HR: 'Eleanor Vance',
    HR_AGENT: 'Marcus Vance',
    FINANCE: 'Robert Sterling',
    RBT: applicantName || 'RBT Staff',
    APPLICANT: applicantName,
  };

  return (
    <>
      {/* Spacer div for layout margin */}
      <div className={`w-[76px] flex-shrink-0 transition-all duration-300 hidden md:block border-r ${
        isRbtLightMode ? 'bg-[#F2ECE0] border-[#E2D5B7]' : 'border-[var(--line)] bg-transparent'
      }`} />

      {/* ULTRA-PREMIUM MODERN SIDEBAR CONTAINER */}
      <div className={`group fixed top-0 left-0 h-full w-[76px] hover:w-[260px] border-r py-5 px-[14px] flex flex-col z-50 transition-all duration-300 ease-in-out overflow-hidden ${
        isRbtLightMode
          ? 'bg-[#F2ECE0] border-r-2 border-[#E2D5B7] text-slate-900 shadow-xl'
          : 'bg-zinc-950/90 hover:bg-zinc-950/95 backdrop-blur-2xl border-white/10 text-white shadow-[8px_0_32px_rgba(0,0,0,0.7)]'
      }`}>
        
        {/* BRAND HEADER */}
        <Link href="/" className={`flex items-center gap-3 px-1 pb-5 mb-4 border-b whitespace-nowrap min-w-[230px] cursor-pointer transition-all ${
          isRbtLightMode ? 'border-[#E2D5B7]' : 'border-white/10'
        }`}>
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-orange-500 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand-orange-500/25 border border-brand-orange-400/40 hover:scale-105 transition-transform">
            <Image src="/logo.png" alt="Rise & Shine ABA Logo" width={32} height={32} className="h-8 w-8 object-contain drop-shadow-md" />
          </div>
          <div>
            <div className={`font-heading font-black text-base tracking-tight opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
              isRbtLightMode ? 'text-slate-900' : 'text-white'
            }`}>
              Rise <span className="text-brand-orange-400">&amp;</span> Shine
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-brand-orange-400 font-extrabold tracking-wider opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange-400 animate-pulse" />
              <span>{role.replace('_', ' ')}</span>
            </div>
          </div>
        </Link>
        
        {/* NAVIGATION ITEMS */}
        <div className="flex-1 overflow-x-hidden overflow-y-hidden group-hover:overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
          {navItems.map((item, idx) => {
            if (item.isHeader) {
              if (role !== 'HEAD_HR') return null;

              return (
                <div key={`header-${idx}`} className={`font-mono text-[10px] font-extrabold tracking-widest uppercase px-3 mb-2 mt-5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap min-w-[200px] ${
                  isRbtLightMode ? 'text-brand-orange-600' : 'text-zinc-500'
                }`}>
                  <span className="opacity-50">{'//'}</span> {item.name}
                </div>
              );
            }
            
            // Hide sub-items if parent accordion is collapsed
            if (item.isSubItem && !isAtsSubMenuOpen) return null;

            const IconComponent = item.icon;
            const active = isRouteActive(item.href);

            return (
              <div key={`container-${item.name}-${idx}`} className="relative">
                <Link
                  href={item.href || '#'}
                  className={`flex items-center gap-2.5 px-3.5 group-hover:px-3 w-[44px] h-[40px] rounded-2xl text-xs font-bold cursor-pointer transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden group/item ${
                    item.isSubItem 
                      ? 'group-hover:ml-3 group-hover:w-[140px] text-[11px] group-hover:border-l-2 group-hover:border-brand-orange-500/50 my-0.5' 
                      : 'group-hover:w-[230px]'
                  } ${
                    active
                      ? isRbtLightMode
                        ? 'bg-orange-500 text-white font-extrabold shadow-md border border-orange-600'
                        : 'bg-brand-orange-500/20 text-white font-extrabold border-l-4 border-brand-orange-500 border-y border-r border-brand-orange-500/30 shadow-lg shadow-brand-orange-500/10 backdrop-blur-md'
                      : isRbtLightMode
                        ? 'text-slate-800 hover:bg-[#FFEBD6] hover:text-brand-orange-600 border border-transparent shadow-sm'
                        : 'text-zinc-400 hover:text-white hover:bg-white/10 hover:translate-x-1 border border-transparent'
                  }`}
                  title={item.name}
                >
                  {/* PERFECTLY CENTERED ICON CONTAINER FOR COLLAPSED SIDEBAR */}
                  <span className={`w-[20px] flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
                    active 
                      ? 'text-brand-orange-400 scale-110' 
                      : item.isSubItem 
                      ? 'text-amber-400/90' 
                      : 'text-brand-orange-400/80 group-hover/item:text-brand-orange-400 group-hover/item:scale-110'
                  }`}>
                    {IconComponent && <IconComponent size={item.isSubItem ? 14 : 18} />}
                  </span>

                  <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-between flex-1">
                    <span className="flex items-center gap-1.5">
                      {item.isSubItem && <span className="text-zinc-500 text-[10px]">└</span>}
                      <span className={active ? 'text-white font-black' : ''}>{item.name}</span>
                    </span>

                    {/* CHEVRON ARROW FOR COLLAPSIBLE PARENT TABS */}
                    {item.hasSubItems ? (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsAtsSubMenuOpen(!isAtsSubMenuOpen);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsAtsSubMenuOpen(!isAtsSubMenuOpen);
                          }
                        }}
                        className="p-1 hover:bg-white/10 rounded-lg text-zinc-400 hover:text-white transition-colors cursor-pointer ml-auto"
                        title={isAtsSubMenuOpen ? 'Minimize Sub-Tabs' : 'Expand Sub-Tabs'}
                      >
                        {isAtsSubMenuOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    ) : active ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-orange-400 animate-pulse ml-auto shrink-0" />
                    ) : null}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>

        {/* BOTTOM RECRUITER PERSONA FOOTER */}
        <div className={`pt-3 mt-auto border-t opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap min-w-[230px] ${
          isRbtLightMode ? 'border-[#E2D5B7]' : 'border-white/10'
        }`}>
          <div className={`p-2.5 rounded-2xl border flex items-center gap-2.5 text-xs ${
            isRbtLightMode
              ? 'bg-[#FFFDF8] border-[#E2D5B7] shadow-sm'
              : 'bg-zinc-900/80 border-white/10'
          }`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
              isRbtLightMode
                ? 'bg-orange-100 border border-orange-200 text-[#F97316]'
                : 'bg-brand-orange-500/20 border border-brand-orange-500/40 text-brand-orange-400'
            }`}>
              {hrAgentNames[role]?.[0] || (role === 'RBT' || role === 'APPLICANT' ? 'R' : '·')}
            </div>
            <div className="overflow-hidden">
              <span className={`block font-bold text-[11px] truncate ${
                isRbtLightMode ? 'text-slate-900' : 'text-white'
              }`}>
                {hrAgentNames[role] || (role === 'NONE' ? '…' : 'Staff')}
              </span>
              <span className={`block text-[9px] font-mono uppercase tracking-wider ${
                isRbtLightMode ? 'text-slate-500' : 'text-zinc-400'
              }`}>
                {role.replace('_', ' ')} Persona
              </span>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
