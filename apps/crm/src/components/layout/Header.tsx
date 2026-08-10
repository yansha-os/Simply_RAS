'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, User, LogOut, Settings, ShieldCheck, Palette, Lock } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useTheme } from './ThemeContext';
import ThemeSettingsModal from './ThemeSettingsModal';
import { toast } from 'sonner';

export function Header() {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { setIsSettingsOpen } = useTheme();

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
      <header className="flex h-[72px] shrink-0 items-center justify-between px-[30px] border-b border-[var(--line)] bg-[rgba(8,10,18,0.2)] hover:bg-[rgba(8,10,18,0.3)] transition-colors duration-300 backdrop-blur-[18px] relative z-10">
        <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-[var(--grad-scan)] opacity-50 z-20"></div>

        {/* Search Bar */}
        <div className="flex-1 max-w-[440px] bg-[var(--glass)] border border-[var(--line)] rounded-[10px] px-[14px] py-[9px] text-[var(--ink-500)] text-[13px] flex items-center gap-[8px] font-mono">
          <Search className="w-4 h-4 text-[var(--ink-500)]" />
          <input
            suppressHydrationWarning
            type="text"
            placeholder="search clients, auths, action_items…"
            className="bg-transparent border-none outline-none w-full text-[var(--ink-300)] placeholder:text-[var(--ink-500)]"
          />
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-[16px]">
          <NotificationBell />

          {/* Profile & Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <div
              className="w-[36px] h-[36px] rounded-[11px] bg-brand-orange-500/20 border border-brand-orange-500/30 flex items-center justify-center text-brand-orange-400 font-bold text-xs shadow-md cursor-pointer hover:border-brand-orange-500/60 transition-all"
              onClick={() => setShowDropdown(!showDropdown)}
            >
              JD
            </div>

            {showDropdown && (
              <div className="profile-dropdown absolute right-0 mt-2 w-64 bg-zinc-950/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl py-2 z-50 animate-fade-in space-y-1">
                {/* User Profile Header */}
                <div className="px-4 py-2.5 border-b border-white/10">
                  <p className="text-xs font-bold text-white font-sans">Jane Doe, BCBA</p>
                  <p className="text-[10px] text-zinc-400 font-mono">jane.doe@riseandshine.com</p>
                  <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded mt-1 inline-block uppercase">
                    Clinical Lead Active
                  </span>
                </div>

                {/* Dropdown Options */}
                <button
                  onClick={() => {
                    setShowDropdown(false);
                    setIsSettingsOpen(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-zinc-200 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2.5 cursor-pointer font-sans"
                >
                  <Palette className="w-4 h-4 text-brand-orange-400" />
                  <span>Theme & Customization Settings</span>
                </button>

                <button
                  onClick={() => {
                    setShowDropdown(false);
                    toast.info('Opened Account Security & Password Manager');
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs text-zinc-200 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2.5 cursor-pointer font-sans"
                >
                  <Lock className="w-4 h-4 text-cyan-400" />
                  <span>Account Security & Password</span>
                </button>

                <div className="border-t border-white/10 pt-1">
                  <button
                    className="w-full text-left px-4 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2.5 cursor-pointer font-sans"
                    onClick={() => {
                      setShowDropdown(false);
                      toast.success('Signed out cleanly');
                    }}
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
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
