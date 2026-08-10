'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  Briefcase
} from 'lucide-react';

interface NavItem {
  name: string;
  href?: string;
  icon?: any;
  isHeader?: boolean;
}

export function HrmSidebar() {
  const { role } = useHrmRole();
  const { colorMode } = useTheme();
  const [isRbtCleared, setIsRbtCleared] = useState(false);
  const [isSimCompleted, setIsSimCompleted] = useState(false);
  const [isInterviewDone, setIsInterviewDone] = useState(false);
  const [isAvailabilitySet, setIsAvailabilitySet] = useState(false);
  const [isTasksDone, setIsTasksDone] = useState(false);

  const isRbtLightMode = role === 'RBT' && colorMode === 'light';

  useEffect(() => {
    const checkClearanceAndSim = () => {
      const cleared = localStorage.getItem('ras_rbt_cleared') === 'true';
      const simDone = localStorage.getItem('ras_rbt_sim_completed') === 'true' || localStorage.getItem('ras_rbt_simulation_completed') === 'true';
      const interviewDone = localStorage.getItem('ras_rbt_interview_done') === 'true';
      const availSet = localStorage.getItem('ras_rbt_availability_set') === 'true';
      const tasksDone = localStorage.getItem('ras_rbt_tasks_done') === 'true';

      setIsRbtCleared(cleared);
      setIsSimCompleted(simDone);
      setIsInterviewDone(interviewDone);
      setIsAvailabilitySet(availSet);
      setIsTasksDone(tasksDone);
    };

    checkClearanceAndSim();
    window.addEventListener('rbt_clearance_changed', checkClearanceAndSim);
    window.addEventListener('rbt_sim_changed', checkClearanceAndSim);
    window.addEventListener('simulationCompleted', checkClearanceAndSim);
    window.addEventListener('rbt_interview_changed', checkClearanceAndSim);
    window.addEventListener('rbt_availability_changed', checkClearanceAndSim);
    window.addEventListener('rbt_tasks_changed', checkClearanceAndSim);
    return () => {
      window.removeEventListener('rbt_clearance_changed', checkClearanceAndSim);
      window.removeEventListener('rbt_sim_changed', checkClearanceAndSim);
      window.removeEventListener('simulationCompleted', checkClearanceAndSim);
      window.removeEventListener('rbt_interview_changed', checkClearanceAndSim);
      window.removeEventListener('rbt_availability_changed', checkClearanceAndSim);
      window.removeEventListener('rbt_tasks_changed', checkClearanceAndSim);
    };
  }, []);

  const roleNavItems: Record<string, NavItem[]> = {
    HEAD_HR: [
      { name: 'Command Center', href: '/', icon: LayoutDashboard },
      { name: 'RBT Pipeline', href: '/rbts', icon: Users },
      { name: 'Session EMR & Notes', href: '/session-emr', icon: Activity },
      { name: 'ATS Applicants', href: '/ats', icon: FileText },
      { name: 'Onboarding Checklist', href: '/onboarding', icon: ClipboardCheck },
      { name: 'Staffing Requests', href: '/requests', icon: Clock },
      { name: 'Active Cases', href: '/clients', icon: HeartHandshake },
      { name: 'Payroll & Comp', href: '/payroll', icon: Calendar },
      { name: 'Portal Directory', href: '/portal-hr', icon: Shield },
    ],
    CASE_COORDINATOR: [
      { name: 'Active Cases & Families', href: '/clients', icon: Users },
      { name: 'RBT Staffing Match', href: '/rbts', icon: ClipboardList },
      { name: 'Scheduling Grid', href: '/rbt/schedule', icon: Calendar },
    ],
    HR_AGENT: [
      { name: 'ATS Applicant Pipeline', href: '/ats', icon: FileText },
      { name: 'RBT Onboarding Checklist', href: '/onboarding', icon: ClipboardCheck },
      { name: 'Staffing Requests Queue', href: '/clients', icon: Users },
    ],
    FINANCE: [
      { name: 'Payroll & Compensation', href: '/payroll', icon: Calendar },
      { name: 'Financial Analytics', href: '/', icon: LayoutDashboard },
    ],
    RBT: [
      { name: 'My Tasks', href: '/rbt', icon: ClipboardList },
      isSimCompleted
        ? { name: 'Schedule', href: '/rbt/schedule', icon: Calendar }
        : { name: 'Data Simulation', href: '/rbt/simulation', icon: Activity },
      isAvailabilitySet
        ? { name: 'Client Job Board', href: '/rbt/job-board', icon: Briefcase }
        : { name: 'My Availability', href: '/rbt/availability', icon: Clock },
      ...(isRbtCleared ? [{ name: 'Pay', href: '/payroll', icon: Timer }] : []),
      isInterviewDone 
        ? { name: 'Communications', href: '/rbt/interview', icon: MessageSquare }
        : { name: 'HR Interview', href: '/rbt/interview', icon: Video },
      { name: 'Documents', href: '/rbt/documents', icon: FileText },
      { name: 'Resources', href: '/rbt/resources', icon: BookOpen },
    ],
  };

  const navItems = roleNavItems[role] || roleNavItems.HEAD_HR;

  return (
    <>
      <div className={`w-[76px] flex-shrink-0 transition-all duration-300 hidden md:block border-r ${
        isRbtLightMode ? 'bg-[#F2ECE0] border-[#E2D5B7]' : 'border-[var(--line)] bg-transparent'
      }`} />
      <div className={`group fixed top-0 left-0 h-full w-[76px] hover:w-[252px] border-r py-[20px] px-[14px] flex flex-col z-50 transition-all duration-300 ease-in-out overflow-hidden ${
        isRbtLightMode
          ? 'bg-[#F2ECE0] border-r-2 border-[#E2D5B7] text-slate-900 shadow-xl'
          : 'bg-[rgba(8,10,18,0.2)] hover:bg-[rgba(8,10,18,0.4)] backdrop-blur-[12px] border-[var(--line)] text-white shadow-[4px_0_24px_rgba(0,0,0,0.5)]'
      }`}>
        
        {/* Brand Header */}
        <div className={`flex items-center gap-[12px] px-[4px] pb-[24px] mb-[16px] border-b whitespace-nowrap min-w-[220px] ${
          isRbtLightMode ? 'border-[#E2D5B7]' : 'border-[var(--line)]'
        }`}>
          <div className="w-11 h-11 rounded-2xl bg-orange-100 flex items-center justify-center flex-shrink-0 shadow-md border border-orange-200">
            <img src="/logo.png" alt="Rise & Shine ABA Logo" className="w-8 h-8 object-contain drop-shadow-md" />
          </div>
          <div className={`font-heading font-black text-[17px] tracking-[.1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${
            isRbtLightMode ? 'text-slate-900' : 'text-white'
          }`}>
            Rise <span className="text-[#F97316]">&amp;</span> Shine
          </div>
          <div className="ml-auto flex items-center gap-[5px] font-mono text-[9px] text-[#F97316] font-extrabold tracking-[.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="dot-live bg-[#F97316]"></span>{role}
          </div>
        </div>
        
        {/* Navigation Items */}
        <div className="flex-1 overflow-x-hidden overflow-y-hidden group-hover:overflow-y-auto custom-scrollbar space-y-2 pr-1">
          {navItems.map((item, idx) => {
            if (item.isHeader) {
              if (role !== 'HEAD_HR') return null;

              return (
                <div key={`header-${idx}`} className={`font-mono text-[10px] font-bold tracking-[1.5px] uppercase px-[10px] mb-[8px] mt-[24px] flex items-center gap-[6px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap min-w-[200px] ${
                  isRbtLightMode ? 'text-[#F97316]' : 'text-[var(--dawn)]'
                }`}>
                  <span className="opacity-50">//</span> {item.name}
                </div>
              );
            }
            
            const IconComponent = item.icon;

            return (
              <Link
                key={`link-${item.name}-${idx}`}
                href={item.href || '#'}
                className={`flex items-center gap-[12px] px-[13px] group-hover:px-[12px] w-[44px] group-hover:w-[224px] h-[44px] rounded-2xl text-[13.5px] font-extrabold cursor-pointer transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden group/item ${
                  isRbtLightMode
                    ? 'text-slate-800 hover:bg-[#FFEBD6] hover:text-[#F97316] border border-transparent hover:border-orange-300 shadow-sm'
                    : 'text-[var(--ink-400)] bg-white/[0.02] hover:bg-white/[0.06] hover:text-white border border-transparent hover:border-white/[0.05]'
                }`}
                title={item.name}
              >
                <span className="w-[18px] flex-shrink-0 flex items-center justify-center text-[#F97316] group-hover/item:scale-110 transition-transform duration-200">
                  {IconComponent && <IconComponent size={18} />}
                </span>
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
