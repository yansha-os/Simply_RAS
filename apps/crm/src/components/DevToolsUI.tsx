'use client';

import React, { useState, useTransition } from 'react';
import { setImpersonationCookie } from '@/app/actions/devTools';
import { UserCircle2, X } from 'lucide-react';

export function DevToolsUI({ 
  users, 
  roles,
  currentImpersonatedId, 
  currentImpersonatedRole 
}: { 
  users: any[], 
  roles: string[],
  currentImpersonatedId: string | null,
  currentImpersonatedRole: string | null
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [isPending, startTransition] = useTransition();

  if (process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== 'true') {
    return null;
  }

  const handleImpersonateUser = (userId: string | null) => {
    startTransition(() => {
      setImpersonationCookie(userId, null);
      setIsOpen(false);
    });
  };

  const handleImpersonateRole = (role: string) => {
    startTransition(() => {
      setImpersonationCookie(null, role);
      setIsOpen(false);
    });
  };

  return (
    <div className="fixed bottom-4 left-4 z-[9999]">
      {!isOpen ? (
        <button
          suppressHydrationWarning
          onClick={() => setIsOpen(true)}
          className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center border-2 transition-all hover:scale-110 ${(currentImpersonatedId || currentImpersonatedRole) ? 'bg-red-600 border-red-400' : 'bg-zinc-800 border-zinc-600'}`}
          title="Developer Tools"
        >
          <UserCircle2 className="w-6 h-6 text-white" />
          {(currentImpersonatedId || currentImpersonatedRole) && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-pulse border-2 border-zinc-900" />
          )}
        </button>
      ) : (
        <div className="devtools-panel bg-zinc-950 border border-zinc-700 p-4 rounded-xl shadow-2xl w-80 mb-2 animate-in slide-in-from-bottom-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <UserCircle2 className="w-4 h-4 text-cyan-400" />
              Dev Impersonation
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2 mb-4 border-b border-zinc-800 pb-2">
            <button 
              onClick={() => setActiveTab('users')}
              className={`text-xs font-semibold px-2 py-1 rounded ${activeTab === 'users' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
            >
              Real Users
            </button>
            <button 
              onClick={() => setActiveTab('roles')}
              className={`text-xs font-semibold px-2 py-1 rounded ${activeTab === 'roles' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
            >
              Mock Roles
            </button>
          </div>
          
          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
            <button
              onClick={() => handleImpersonateUser(null)}
              disabled={isPending}
              className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${!currentImpersonatedId && !currentImpersonatedRole ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-zinc-400 hover:bg-zinc-900'}`}
            >
              Default (No Impersonation)
            </button>
            
            {activeTab === 'users' && users.filter(u => !['HR', 'HEAD_HR', 'HR_AGENT', 'FINANCE'].includes(u.role)).map(u => (
              <button
                key={u.id}
                onClick={() => handleImpersonateUser(u.id)}
                disabled={isPending}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 ${currentImpersonatedId === u.id ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-zinc-400 hover:bg-zinc-900'}`}
              >
                <span className="font-semibold">{u.firstName} {u.lastName}</span>
                <span className="text-[10px] opacity-70 font-mono">{u.role}</span>
              </button>
            ))}

            {activeTab === 'roles' && roles.filter(r => !['HR', 'HEAD_HR', 'HR_AGENT', 'FINANCE'].includes(r)).map(r => (
              <button
                key={r}
                onClick={() => handleImpersonateRole(r)}
                disabled={isPending}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors flex flex-col gap-1 ${currentImpersonatedRole === r ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-zinc-400 hover:bg-zinc-900'}`}
              >
                <span className="font-semibold">{r}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
