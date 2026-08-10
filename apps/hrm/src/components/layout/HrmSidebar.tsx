'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useHrmRole, HrmRole } from '@/lib/useHrmRole';
import { useTheme } from '@/components/layout/ThemeContext';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  ClipboardCheck, 
  Activity, 
  Calendar,
  ClipboardList,
  Timer,
  BookOpen,
  Video,
  MessageSquare,
  Clock,
  HeartHandshake,
  Shield,
  Briefcase,
  UserCheck,
  CreditCard,
  Lock,
  ChevronRight,
  ChevronDown,
  Sparkles
} from 'lucide-react';

interface NavItem {
  name: string;
  href?: string;
  icon?: any;
  isHeader?: boolean;
  isSubItem?: boolean;
  hasSubItems?: boolean;
}

export function HrmSidebar() {
  const { role } = useHrmRole();
  const { colorMode } = useTheme();
  const pathname = usePathname();
  
  const [isRbtCleared, setIsRbtCleared] = useState(false);
  const [isSimCompleted, setIsSimCompleted] = useState(false);
  const [isInterviewDone, setIsInterviewDone] = useState(false);
  const [isAvailabilitySet, setIsAvailabilitySet] = useState(false);
  const [isTasksDone, setIsTasksDone] = useState(false);

  // Accordion state for parent tabs with sub-items
  const [isAtsSubMenuOpen, setIsAtsSubMenuOpen] = useState(true);

  const isRbtLightMode = (role === 'RBT' || role === 'APPLICANT') && colorMode === 'light';

  useEffect(() => {
    const checkClearanceAndSim = () => {
      const cleared = localStorage.getItem('ras_rbt_cleared') === 'true';
      const simDone = localStorage.getItem('ras_rbt_sim_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true';
      const interviewPassed = localStorage.getItem('ras_rbt_interview_passed') === 'true';
      const availDone = localStorage.getItem('ras_rbt_availability_set') === 'true';
      const tasksDone = localStorage.getItem('ras_rbt_tasks_done') === 'true';

      setIsRbtCleared(cleared);
      setIsSimCompleted(simDone);
      setIsInterviewDone(interviewPassed);
      setIsAvailabilitySet(availDone);
      setIsTasksDone(tasksDone);
    };

    checkClearanceAndSim();
    window.addEventListener('storage', checkClearanceAndSim);
    window.addEventListener('rbt_clearance_changed', checkClearanceAndSim);
    window.addEventListener('rbt_sim_changed', checkClearanceAndSim);
    window.addEventListener('rbt_tasks_changed', checkClearanceAndSim);
    window.addEventListener('rbt_interview_changed', checkClearanceAndSim);
    window.addEventListener('rbt_availability_changed', checkClearanceAndSim);

    return () => {
      window.removeEventListener('storage', checkClearanceAndSim);
      window.removeEventListener('rbt_clearance_changed', checkClearanceAndSim);
      window.removeEventListener('rbt_sim_changed', checkClearanceAndSim);
      window.removeEventListener('rbt_tasks_changed', checkClearanceAndSim);
      window.removeEventListener('rbt_interview_changed', checkClearanceAndSim);
      window.removeEventListener('rbt_availability_changed', checkClearanceAndSim);
    };
  }, []);

  const interviewDoneOrBooked = isInterviewDone || (typeof window !== 'undefined' && (localStorage.getItem('ras_rbt_interview_done') === 'true' || !!localStorage.getItem('ras_rbt_interview_payload')));
  const allRequirementsDone = isTasksDone && isSimCompleted && isAvailabilitySet && interviewDoneOrBooked;

  const rbtNavItems: NavItem[] = [
    { name: isTasksDone ? '✓ 1. Tasks & Consent' : '1. My Tasks & Onboarding', href: '/rbt', icon: ClipboardList },
    { name: isSimCompleted ? '✓ 2. Data Simulator' : '2. Data Simulator', href: '/rbt/simulation', icon: Activity },
    { name: isAvailabilitySet ? '✓ 3. My Availability' : '3. My Availability', href: '/rbt/availability', icon: Clock },
    { name: interviewDoneOrBooked ? '✓ 4. HR Interview' : '4. HR Interview', href: '/rbt/interview', icon: Video },
    { name: '5. 40-Hr Course Upload', href: '/rbt/documents', icon: FileText },
    { name: 'Help Desk', href: '/rbt/help-desk', icon: MessageSquare },
  ];

  if (allRequirementsDone) {
    rbtNavItems.push(
      { name: 'Schedule', href: '/rbt/schedule', icon: Calendar },
      { name: 'Job Board', href: '/rbt/job-board', icon: Briefcase }
    );
  }

  const roleNavItems: Record<HrmRole, NavItem[]> = {
    HEAD_HR: [
      { name: 'Command Center', href: '/', icon: LayoutDashboard },
      { name: 'ATS Applicants', href: '/ats', icon: FileText, hasSubItems: true },
      { name: 'Help Tickets', href: '/ats/help-tickets', icon: MessageSquare, isSubItem: true },
      { name: 'RBT Staff Manager', href: '/rbt-manager', icon: UserCheck },
      { name: 'Staffing Queue', href: '/clients', icon: Users },
      { name: 'Session EMR & Notes', href: '/session-emr', icon: Activity },
      { name: 'Payroll & Comp', href: '/payroll', icon: Calendar },
    ],
    HR_AGENT: [
      { name: 'HR Analytics & Stats', href: '/hr-dashboard', icon: LayoutDashboard },
      { name: 'ATS Applicant Pipeline', href: '/ats', icon: FileText, hasSubItems: true },
      { name: 'Help Tickets', href: '/ats/help-tickets', icon: MessageSquare, isSubItem: true },
      { name: 'RBT Staff Manager', href: '/rbt-manager', icon: UserCheck },
      { name: 'Staffing Requests Queue', href: '/clients', icon: Users },
    ],
    FINANCE: [
      { name: 'Payroll & Compensation', href: '/payroll', icon: Calendar },
      { name: 'Financial Overview', href: '/', icon: LayoutDashboard },
    ],
    RBT: rbtNavItems,
    APPLICANT: rbtNavItems,
    NONE: [],
  };

  const navItems = roleNavItems[role] || roleNavItems.HEAD_HR;

  // Active route checking helper
  const isRouteActive = (href?: string) => {
    if (!href || !pathname) return false;
    if (href === '/') return pathname === '/';
    return pathname === href || (href !== '/' && pathname.startsWith(href) && href !== '/ats');
  };

  const [applicantName, setApplicantName] = useState<string>('Jane Doe');

  useEffect(() => {
    function loadName() {
      try {
        const impName = localStorage.getItem('ras_active_impersonated_applicant_name');
        if (impName) {
          setApplicantName(impName);
          return;
        }
        const stored = localStorage.getItem('ras_latest_submitted_app');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.fullName) {
            setApplicantName(parsed.fullName);
            return;
          }
        }
      } catch (e) {}
    }
    loadName();
    window.addEventListener('storage', loadName);
    window.addEventListener('hrm_role_changed', loadName);
    return () => {
      window.removeEventListener('storage', loadName);
      window.removeEventListener('hrm_role_changed', loadName);
    };
  }, []);

  const hrAgentNames: Record<string, string> = {
    HEAD_HR: 'Eleanor Vance',
    HR_AGENT: 'Marcus Vance',
    FINANCE: 'Robert Sterling',
    RBT: 'David Miller',
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
            <img src="/logo.png" alt="Rise & Shine ABA Logo" className="w-8 h-8 object-contain drop-shadow-md" />
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
                  <span className="opacity-50">//</span> {item.name}
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
          <div className="p-2.5 rounded-2xl bg-zinc-900/80 border border-white/10 flex items-center gap-2.5 text-xs">
            <div className="w-8 h-8 rounded-xl bg-brand-orange-500/20 border border-brand-orange-500/40 text-brand-orange-400 flex items-center justify-center font-black text-xs shrink-0">
              {hrAgentNames[role]?.[0] || 'H'}
            </div>
            <div className="overflow-hidden">
              <span className="block font-bold text-white text-[11px] truncate">
                {hrAgentNames[role] || 'HR Specialist'}
              </span>
              <span className="block text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                {role.replace('_', ' ')} Persona
              </span>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
