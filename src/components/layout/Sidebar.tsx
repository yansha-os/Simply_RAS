import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  ClipboardCheck, 
  Calendar,
  Settings,
  LogOut,
  Activity,
  ShieldCheck,
  CalendarDays,
  PenTool
} from 'lucide-react';
import { cn } from '../ui/Button';

// Mocking the user role for now until auth is connected
interface NavItem {
  name: string;
  href?: string;
  icon?: any;
  isHeader?: boolean;
}

const navItems: Record<string, NavItem[]> = {
  OPS_DIRECTOR: [
    { name: 'Master Operations', href: '/ops', icon: Activity },
    { name: 'Intake Portal', isHeader: true },
    { name: 'Dashboard', href: '/portal-case', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-case/clients', icon: Users },
    { name: 'Clinical Support', isHeader: true },
    { name: 'Dashboard', href: '/clinical-support', icon: LayoutDashboard },
    { name: 'Clients', href: '/clinical-support/clients', icon: Users },
    { name: 'Billing', isHeader: true },
    { name: 'Dashboard', href: '/portal-billing', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-billing/clients', icon: Users },
    { name: 'Clinical', isHeader: true },
    { name: 'Dashboard', href: '/portal-clinical', icon: LayoutDashboard },
    { name: 'Clients (BCBAs)', href: '/portal-clinical/bcbas', icon: Users },
    { name: 'Case Coordinator', isHeader: true },
    { name: 'Dashboard', href: '/portal-case-coord', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-case-coord/clients', icon: Users },
  ],
  INTAKE_PA_COORDINATOR: [
    { name: 'Dashboard', href: '/portal-case', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-case/clients', icon: Users },
  ],
  CASE_COORDINATOR: [
    { name: 'Dashboard', href: '/portal-case-coord', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-case-coord/clients', icon: Users },
  ],
  HR: [
    { name: 'Dashboard', href: '/portal-hr', icon: LayoutDashboard },
    { name: 'Staffing Queue', href: '/portal-hr/clients', icon: Users },
    { name: 'ATS Recruitment', href: '/portal-hr/ats', icon: FileText },
    { name: 'RBT Onboarding', href: '/portal-hr/onboarding', icon: ClipboardCheck },
    { name: 'RBT Session EMR', href: '/portal-hr/session-emr', icon: Activity },
    { name: 'Payroll & Benefits', href: '/portal-hr/payroll', icon: Calendar },
  ],
  CLINICAL_SUPPORT: [
    { name: 'Clinical Support', isHeader: true },
    { name: 'Dashboard', href: '/clinical-support', icon: LayoutDashboard },
    { name: 'Clients', href: '/clinical-support/clients', icon: Users },
  ],
  CLINICAL_DIRECTOR: [
    { name: 'Clinical Command', isHeader: true },
    { name: 'Dashboard', href: '/portal-clinical', icon: LayoutDashboard },
    { name: 'Clinical Queue', href: '/portal-clinical/bcbas', icon: Users },
    { name: 'Daily Workstation', href: '/portal-clinical/daily', icon: PenTool },
    { name: 'Clinical Support', isHeader: true },
    { name: 'Dashboard', href: '/clinical-support', icon: LayoutDashboard },
    { name: 'Clients', href: '/clinical-support/clients', icon: Users },
  ],
  CEO: [
    { name: 'Master Operations', href: '/ops', icon: Activity },
    { name: 'Intake Portal', isHeader: true },
    { name: 'Dashboard', href: '/portal-case', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-case/clients', icon: Users },
    { name: 'Clinical Support', isHeader: true },
    { name: 'Dashboard', href: '/clinical-support', icon: LayoutDashboard },
    { name: 'Clients', href: '/clinical-support/clients', icon: Users },
    { name: 'Billing', isHeader: true },
    { name: 'Dashboard', href: '/portal-billing', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-billing/clients', icon: Users },
    { name: 'Clinical', isHeader: true },
    { name: 'Dashboard', href: '/portal-clinical', icon: LayoutDashboard },
    { name: 'Clinical Queue', href: '/portal-clinical/bcbas', icon: Users },
    { name: 'Daily Workstation', href: '/portal-clinical/daily', icon: PenTool },
    { name: 'Case Coordinator', isHeader: true },
    { name: 'Dashboard', href: '/portal-case-coord', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-case-coord/clients', icon: Users },
  ],
  BCBA: [
    { name: 'Clinical Dashboard', href: '/portal-clinical', icon: LayoutDashboard },
    { name: 'Clinical Queue', href: '/portal-clinical/bcbas', icon: Users },
    { name: 'Daily Workstation', href: '/portal-clinical/daily', icon: PenTool },
  ],
  BILLING: [
    { name: 'Billing Dashboard', href: '/portal-billing', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-billing/clients', icon: Users },
  ]
};

export async function Sidebar() {
  const { getCurrentUser } = await import('@/lib/auth');
  const user = await getCurrentUser();
  
  let role = user?.role || 'RBT'; // Default fallback

  const items = navItems[role as keyof typeof navItems] || [];

  return (
    <>
      <div className="w-[76px] flex-shrink-0 transition-all duration-300 hidden md:block border-r border-[var(--line)] bg-transparent" />
      <div className="group fixed top-0 left-0 h-full w-[76px] hover:w-[252px] bg-[rgba(8,10,18,0.2)] hover:bg-[rgba(8,10,18,0.4)] backdrop-blur-[12px] border-r border-[var(--line)] py-[20px] px-[14px] flex flex-col z-50 transition-all duration-300 ease-in-out overflow-hidden shadow-[4px_0_24px_rgba(0,0,0,0)] hover:shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
        
        <div className="flex items-center gap-[12px] px-[4px] pb-[24px] mb-[16px] border-b border-[var(--line)] whitespace-nowrap min-w-[220px]">
          <div className="w-11 h-11 rounded-xl bg-brand-orange-500/10 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(255,107,0,0.3)] border border-brand-orange-500/20">
            <img src="/logo.png" alt="Rise & Shine ABA Logo" className="w-8 h-8 object-contain drop-shadow-md" />
          </div>
          <div className="font-heading font-semibold text-[17px] tracking-[.1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            Rise <span className="text-[var(--dawn)]">&</span> Shine
          </div>
          <div className="ml-auto flex items-center gap-[5px] font-mono text-[9px] text-[var(--teal)] tracking-[.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="dot-live"></span>LIVE
          </div>
        </div>
        
        <div className="flex-1 overflow-x-hidden overflow-y-hidden group-hover:overflow-y-auto custom-scrollbar space-y-1 pr-1">
          {items.map((item, idx) => {
            if (item.isHeader) {
              return (
                <div key={`header-${idx}`} className="font-mono text-[10px] font-semibold tracking-[1.5px] text-[var(--dawn)] uppercase px-[10px] mb-[8px] mt-[24px] flex items-center gap-[6px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap min-w-[200px]">
                  <span className="opacity-50">//</span> {item.name}
                </div>
              );
            }
            
            return (
              <Link
                key={`link-${item.name}-${idx}`}
                href={item.href || '#'}
                className="flex items-center gap-[12px] px-[13px] group-hover:px-[12px] w-[44px] group-hover:w-[224px] h-[44px] rounded-xl text-[var(--ink-400)] text-[13.5px] font-medium cursor-pointer transition-all duration-300 ease-in-out bg-white/[0.02] hover:bg-white/[0.06] hover:text-white hover:shadow-md border border-transparent hover:border-white/[0.05] whitespace-nowrap overflow-hidden group/item"
                title={item.name}
              >
                <span className="w-[18px] flex-shrink-0 flex items-center justify-center text-[15px] text-brand-orange-500 group-hover/item:text-brand-orange-400 transition-colors duration-200 drop-shadow-[0_0_8px_rgba(255,107,0,0.4)]">
                  {item.icon === Activity ? '◷' : item.icon === Users ? '◍' : '▦'}
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
