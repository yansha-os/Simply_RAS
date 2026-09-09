'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { HrmSidebar } from '@/components/layout/HrmSidebar';
import { HrmHeader } from '@/components/layout/HrmHeader';
import { HrmDevToolsUI } from '@/components/HrmDevToolsUI';
import PwaInstallBanner from '@/components/layout/PwaInstallBanner';
import { useHrmRole } from '@/lib/useHrmRole';
import { useTheme } from '@/components/layout/ThemeContext';

export function HrmLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { role } = useHrmRole();
  const { colorMode } = useTheme();

  // Public routes / immersive Session Studio — no sidebar & header
  const isPublicRoute =
    pathname === '/' ||
    pathname === '/apply' ||
    pathname === '/public' ||
    pathname === '/login' ||
    pathname === '/mfa';
  const isSessionStudio = pathname.startsWith('/rbt/session');

  if (isPublicRoute || isSessionStudio) {
    return (
      <div
        className={`min-h-screen flex flex-col w-full relative z-20 ${
          isSessionStudio ? 'bg-[#F2ECE0] text-slate-900' : 'bg-white text-slate-900'
        }`}
      >
        <main className="flex-1 w-full">{children}</main>
        <HrmDevToolsUI />
      </div>
    );
  }

  // RBT / APPLICANT routes always render in Warm Soft Cream Light Mode
  const isRbtRoute = pathname.startsWith('/rbt');
  const isRbtLightMode = isRbtRoute || ((role === 'RBT' || role === 'APPLICANT') && colorMode === 'light');

  return (
    <div className={`flex h-screen overflow-hidden w-full transition-colors duration-300 relative z-20 ${
      isRbtLightMode 
        ? 'bg-[#F9F5EC] text-slate-900' 
        : 'bg-transparent'
    }`}>
      {/* Dynamic Background Patterns & Ambient Floating Bubbles for RBT Light Mode */}
      {isRbtLightMode && (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          {/* Subtle Warm Linen Dot Matrix Pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#D6C6A5_1.2px,transparent_1.2px)] [background-size:24px_24px] opacity-40" />

          {/* Floating Ambient Light Bubble 1 - Warm Sunlight */}
          <div className="absolute -top-12 left-1/4 w-[500px] h-[500px] bg-[#FFE4CC]/70 rounded-full blur-3xl animate-[bounce_8s_infinite_ease-in-out]" />

          {/* Floating Ambient Light Bubble 2 - Soft Sky Blue */}
          <div className="absolute top-1/3 -right-12 w-[550px] h-[550px] bg-[#DBEAFE]/70 rounded-full blur-3xl animate-[pulse_6s_infinite_ease-in-out]" />

          {/* Floating Ambient Light Bubble 3 - Peach Cream */}
          <div className="absolute -bottom-16 left-1/3 w-[600px] h-[600px] bg-[#FFEDD5]/60 rounded-full blur-3xl animate-[spin_20s_linear_infinite]" />

          {/* Floating Ambient Light Bubble 4 - Warm Amber */}
          <div className="absolute top-1/2 left-10 w-[350px] h-[350px] bg-[#FEF3C7]/60 rounded-full blur-2xl animate-[ping_10s_cubic-bezier(0,0,0.2,1)_infinite]" />
        </div>
      )}

      {/* Admin Sidebar */}
      <HrmSidebar />

      <div className="flex flex-col flex-1 overflow-hidden relative z-10">
        <PwaInstallBanner />
        <HrmHeader />
        <main className={`flex-1 overflow-y-auto p-6 md:p-8 transition-all ${
          isRbtLightMode ? 'bg-[#FAF6EF]/90 backdrop-blur-md' : ''
        }`}>
          {children}
        </main>
      </div>

      <HrmDevToolsUI />
    </div>
  );
}
