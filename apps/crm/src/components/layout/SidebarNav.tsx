'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Activity,
  PenTool,
  FileSignature,
  ClipboardCheck,
  FileSearch,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  name: string;
  href?: string;
  icon?: LucideIcon;
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
    { name: 'Dual-Run Audit', href: '/portal-billing/audit', icon: FileSearch },
    { name: 'Clinical', isHeader: true },
    { name: 'Dashboard', href: '/portal-clinical', icon: LayoutDashboard },
    { name: 'Clients (BCBAs)', href: '/portal-clinical/bcbas', icon: Users },
    { name: 'Clinical Review', href: '/portal-clinical/review', icon: ClipboardCheck },
    { name: 'Unsigned Notes', href: '/portal-clinical/notes', icon: FileSignature },
    { name: 'Daily Workstation', href: '/portal-clinical/daily', icon: PenTool },
    { name: 'Case Coordinator', isHeader: true },
    { name: 'Dashboard', href: '/portal-case-coord', icon: LayoutDashboard },
    { name: 'Job Openings', href: '/portal-case-coord/openings', icon: Users },
    { name: 'Clients', href: '/portal-case-coord/clients', icon: Users },
  ],
  INTAKE_PA_COORDINATOR: [
    { name: 'Dashboard', href: '/portal-case', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-case/clients', icon: Users },
  ],
  CASE_COORDINATOR: [
    { name: 'Dashboard', href: '/portal-case-coord', icon: LayoutDashboard },
    { name: 'Job Openings', href: '/portal-case-coord/openings', icon: Users },
    { name: 'Clients', href: '/portal-case-coord/clients', icon: Users },
  ],
  // HR product lives in HRM (NEXT_PUBLIC_HRM_URL). No CRM HR portal nav.
  CLINICAL_SUPPORT: [
    { name: 'Clinical Support', isHeader: true },
    { name: 'Dashboard', href: '/clinical-support', icon: LayoutDashboard },
    { name: 'Clients', href: '/clinical-support/clients', icon: Users },
  ],
  CLINICAL_DIRECTOR: [
    { name: 'Clinical Command', isHeader: true },
    { name: 'Dashboard', href: '/portal-clinical', icon: LayoutDashboard },
    { name: 'Clinical Queue', href: '/portal-clinical/bcbas', icon: Users },
    { name: 'Clinical Review', href: '/portal-clinical/review', icon: ClipboardCheck },
    { name: 'Unsigned Notes', href: '/portal-clinical/notes', icon: FileSignature },
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
    { name: 'Dual-Run Audit', href: '/portal-billing/audit', icon: FileSearch },
    { name: 'Clinical', isHeader: true },
    { name: 'Dashboard', href: '/portal-clinical', icon: LayoutDashboard },
    { name: 'Clinical Queue', href: '/portal-clinical/bcbas', icon: Users },
    { name: 'Clinical Review', href: '/portal-clinical/review', icon: ClipboardCheck },
    { name: 'Unsigned Notes', href: '/portal-clinical/notes', icon: FileSignature },
    { name: 'Daily Workstation', href: '/portal-clinical/daily', icon: PenTool },
    { name: 'Case Coordinator', isHeader: true },
    { name: 'Dashboard', href: '/portal-case-coord', icon: LayoutDashboard },
    { name: 'Job Openings', href: '/portal-case-coord/openings', icon: Users },
    { name: 'Clients', href: '/portal-case-coord/clients', icon: Users },
  ],
  BCBA: [
    { name: 'Clinical Dashboard', href: '/portal-clinical', icon: LayoutDashboard },
    { name: 'Clinical Queue', href: '/portal-clinical/bcbas', icon: Users },
    { name: 'Clinical Review', href: '/portal-clinical/review', icon: ClipboardCheck },
    { name: 'Unsigned Notes', href: '/portal-clinical/notes', icon: FileSignature },
    { name: 'Daily Workstation', href: '/portal-clinical/daily', icon: PenTool },
  ],
  BILLING: [
    { name: 'Billing Dashboard', href: '/portal-billing', icon: LayoutDashboard },
    { name: 'Clients', href: '/portal-billing/clients', icon: Users },
    { name: 'Dual-Run Audit', href: '/portal-billing/audit', icon: FileSearch },
  ],
};

export function SidebarNav({ role }: { role: string }) {
  const pathname = usePathname();
  const items = navItems[role] || [];

  // Longest-prefix match so nested routes (e.g. /portal-billing/audit) highlight
  // their own item instead of the section dashboard link.
  let activeHref: string | undefined;
  for (const item of items) {
    if (!item.href) continue;
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!activeHref || item.href.length > activeHref.length) activeHref = item.href;
    }
  }

  return (
    <div className="flex-1 overflow-x-hidden overflow-y-hidden group-hover:overflow-y-auto custom-scrollbar space-y-1 pr-1">
      {items.map((item, idx) => {
        if (item.isHeader) {
          return (
            <div
              key={`header-${idx}`}
              className="font-mono text-[10px] font-semibold tracking-[1.5px] text-[var(--dawn)] uppercase px-[10px] mb-[8px] mt-[24px] flex items-center gap-[6px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap min-w-[200px]"
            >
              <span className="opacity-50">//</span> {item.name}
            </div>
          );
        }

        const active = item.href !== undefined && item.href === activeHref;

        return (
          <Link
            key={`link-${item.name}-${idx}`}
            href={item.href || '#'}
            className={`flex items-center gap-[12px] px-[13px] group-hover:px-[12px] w-[44px] group-hover:w-[224px] h-[44px] rounded-xl text-[13.5px] font-medium cursor-pointer transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden group/item ${
              active
                ? 'bg-brand-orange-500/15 text-white font-semibold border border-brand-orange-500/30 shadow-lg shadow-brand-orange-500/10'
                : 'text-[var(--ink-400)] bg-white/[0.02] hover:bg-white/[0.06] hover:text-white hover:shadow-md border border-transparent hover:border-white/[0.05]'
            }`}
            title={item.name}
          >
            <span
              className={`w-[18px] flex-shrink-0 flex items-center justify-center text-[15px] transition-colors duration-200 drop-shadow-[0_0_8px_rgba(255,107,0,0.4)] ${
                active ? 'text-brand-orange-400' : 'text-brand-orange-500 group-hover/item:text-brand-orange-400'
              }`}
            >
              {item.icon === Activity ? '◷' : item.icon === Users ? '◍' : item.icon === FileSearch ? '◈' : '▦'}
            </span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-[8px]">
              {item.name}
              {active && (
                <span className="w-1.5 h-1.5 rounded-full bg-brand-orange-400 animate-pulse shrink-0" />
              )}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
