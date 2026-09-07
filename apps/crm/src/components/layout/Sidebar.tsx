import React from 'react';
import Image from 'next/image';
import { SidebarNav } from './SidebarNav';

export async function Sidebar() {
  const { getCurrentUser } = await import('@/lib/auth');
  const user = await getCurrentUser();

  const role = user?.role || 'RBT'; // Default fallback

  return (
    <>
      <div className="w-[76px] flex-shrink-0 transition-all duration-300 hidden md:block border-r border-[#E2D5B7] dark:border-[var(--line)] bg-transparent" />
      <div className="group fixed top-0 left-0 h-full w-[76px] hover:w-[252px] bg-[#FFFDF8]/90 dark:bg-[rgba(8,10,18,0.2)] hover:bg-[#FFFDF8] dark:hover:bg-[rgba(8,10,18,0.4)] backdrop-blur-[12px] border-r border-[#E2D5B7] dark:border-[var(--line)] py-[20px] px-[14px] flex flex-col z-50 transition-all duration-300 ease-in-out overflow-hidden shadow-[4px_0_24px_rgba(226,213,183,0.3)] dark:shadow-[4px_0_24px_rgba(0,0,0,0)] hover:shadow-[4px_0_24px_rgba(226,213,183,0.5)] dark:hover:shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
        
        <div className="flex items-center gap-[12px] px-[4px] pb-[24px] mb-[16px] border-b border-[#E2D5B7] dark:border-[var(--line)] whitespace-nowrap min-w-[220px]">
          <div className="w-11 h-11 rounded-xl bg-brand-orange-500/10 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(255,107,0,0.3)] border border-brand-orange-500/20">
            <Image
              src="/logo.png"
              alt="Rise & Shine ABA Logo"
              width={32}
              height={32}
              className="h-8 w-8 object-contain drop-shadow-md"
            />
          </div>
          <div className="font-heading font-semibold text-[17px] tracking-[.1px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-slate-900 dark:text-white">
            Rise <span className="text-brand-orange-600 dark:text-[var(--dawn)]">&</span> Shine
          </div>
          <div className="ml-auto flex items-center gap-[5px] font-mono text-[9px] text-teal-600 dark:text-[var(--teal)] tracking-[.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <span className="dot-live"></span>LIVE
          </div>
        </div>
        
        <SidebarNav role={role} />
      </div>
    </>
  );
}
