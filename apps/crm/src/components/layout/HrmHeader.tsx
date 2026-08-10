'use client';

import React, { useState, useRef, useEffect } from 'react';
import NotificationBell from '@/components/layout/NotificationBell';
import { Search, LogOut, ShieldCheck, Palette, Lock } from 'lucide-react';
import { useHrmRole } from '@/lib/useHrmRole';
import { useTheme } from './ThemeContext';
import ThemeSettingsModal from './ThemeSettingsModal';
import { toast } from 'sonner';

export function HrmHeader() {
  const { role } = useHrmRole();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { setIsSettingsOpen, colorMode } = useTheme();

  const isRbtLightMode = role === 'RBT' && colorMode === 'light';

  const userProfiles = {
    HEAD_HR: { name: 'Eleanor Vance', title: 'Head of HR & Dispatch Lead', badge: 'HEAD HR', email: 'eleanor.vance@riseandshine.com' },
    HR_AGENT: { name: 'Samantha Reed', title: 'ATS Recruiter & Compliance', badge: 'HR AGENT', email: 'samantha.reed@riseandshine.com' },
    FINANCE: { name: 'Robert Sterling', title: 'Payroll & Compensation Lead', badge: 'FINANCE', email: 'robert.s@riseandshine.com' },
    RBT: { name: 'Sarah Jenkins, RBT', title: 'Registered Behavior Technician', badge: 'RBT EMR', email: 'sarah.j@riseandshine.com' },
  };

  const currentProfile = userProfiles[role] || userProfiles.HEAD_HR;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <header className={`flex h-[72px] shrink-0 items-center justify-between px-[30px] transition-all duration-300 relative z-20 ${
        isRbtLightMode 
          ? 'bg-[#F2ECE0] border-b-2 border-[#E2D5B7] text-slate-900 shadow-sm' 
          : 'bg-[rgba(8,10,18,0.2)] hover:bg-[rgba(8,10,18,0.3)] border-b border-[var(--line)] backdrop-blur-[18px]'
      }`}>
        {!isRbtLightMode && (
          <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-[var(--grad-scan)] opacity-50 z-20"></div>
        )}

        {/* Search Bar */}
        <div className={`flex-1 max-w-[440px] border rounded-2xl px-[14px] py-[9px] text-[13px] flex items-center gap-[8px] font-mono transition-all ${
          isRbtLightMode
            ? 'bg-[#FFFDF8] border-[#DECFA9] text-slate-900 focus-within:border-[#F97316] focus-within:ring-2 focus-within:ring-orange-500/20 shadow-inner'
            : 'bg-[var(--glass)] border-[var(--line)] text-[var(--ink-500)]'
        }`}>
          <Search className={`w-4 h-4 ${isRbtLightMode ? 'text-[#F97316]' : 'text-[var(--ink-500)]'}`} />
          <input
            suppressHydrationWarning
            type="text"
            placeholder="search candidates, timesheets, or session logs…"
            className={`bg-transparent border-none outline-none w-full ${
              isRbtLightMode ? 'text-slate-900 placeholder:text-slate-500 font-semibold' : 'text-[var(--ink-300)] placeholder:text-[var(--ink-500)]'
            }`}
          />
        </div>

        {/* Right Controls: Notifications & User Profile */}
        <div className="flex items-center gap-[16px]">
          <NotificationBell />

          <div className="relative" ref={dropdownRef}>
            <div className={`flex items-center gap-3 pl-4 border-l ${isRbtLightMode ? 'border-[#E2D5B7]' : 'border-[var(--line)]'}`}>
              <div className="flex flex-col text-right">
                <span className={`text-xs font-black ${isRbtLightMode ? 'text-slate-900' : 'text-white'}`}>{currentProfile.name}</span>
                <span className="text-[10px] text-[#1E40AF] font-mono font-bold flex items-center justify-end gap-1">
                  <ShieldCheck className="w-3 h-3 text-[#F97316]" /> {currentProfile.badge} ACTIVE
                </span>
              </div>

              <div
                className="w-[38px] h-[38px] rounded-2xl bg-[#F97316] text-white flex items-center justify-center font-black text-xs shadow-lg shadow-orange-500/30 cursor-pointer hover:scale-105 transition-all"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                {role.substring(0, 2)}
              </div>
            </div>

            {showDropdown && (
              <div className={`profile-dropdown absolute right-0 mt-2 w-64 rounded-2xl shadow-2xl py-2 z-50 animate-fade-in space-y-1 ${
                isRbtLightMode 
                  ? 'bg-[#FFFDF9] border-2 border-[#E2D5B7] text-slate-900 shadow-orange-500/10' 
                  : 'bg-zinc-950/95 backdrop-blur-2xl border border-white/15 text-white'
              }`}>
                {/* User Profile Header */}
                <div className={`px-4 py-2.5 border-b ${isRbtLightMode ? 'border-orange-100 bg-[#FFEEDD]' : 'border-white/10'}`}>
                  <p className={`text-xs font-bold font-sans ${isRbtLightMode ? 'text-slate-900' : 'text-white'}`}>{currentProfile.name}</p>
                  <p className={`text-[10px] font-mono ${isRbtLightMode ? 'text-slate-600 font-medium' : 'text-zinc-400'}`}>{currentProfile.email}</p>
                  <span className="text-[9px] font-mono font-extrabold text-[#F97316] bg-orange-100 border border-orange-300 px-2 py-0.5 rounded mt-1 inline-block uppercase">
                    {currentProfile.badge} ACTIVE
                  </span>
                </div>

                {/* Dropdown Options */}
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setIsSettingsOpen(true);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center gap-2.5 cursor-pointer font-bold ${
                    isRbtLightMode ? 'text-slate-800 hover:bg-orange-50 hover:text-[#F97316]' : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Palette className="w-4 h-4 text-brand-orange-500" />
                  <span>Theme &amp; Customization Settings</span>
                </button>

                <button
                  onClick={() => {
                    setShowDropdown(false);
                    toast.info('Opened Account Security & Password Manager');
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex items-center gap-2.5 cursor-pointer font-bold ${
                    isRbtLightMode ? 'text-slate-800 hover:bg-orange-50 hover:text-[#F97316]' : 'text-zinc-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Lock className="w-4 h-4 text-cyan-600" />
                  <span>Account Security &amp; Password</span>
                </button>

                <div className={`border-t pt-1 ${isRbtLightMode ? 'border-orange-100' : 'border-white/10'}`}>
                  <button
                    className="w-full text-left px-4 py-2.5 text-xs text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2.5 cursor-pointer font-extrabold"
                    onClick={() => {
                      setShowDropdown(false);
                      toast.success('Signed out cleanly');
                    }}
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Theme Settings Modal */}
      <ThemeSettingsModal />
    </>
  );
}
