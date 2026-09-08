import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Toaster } from 'sonner';
import { Header } from '@/components/layout/Header';
import { GlobalStaffChat } from '@/components/GlobalStaffChat';
import { DevToolsWrapper } from '@/components/DevToolsWrapper';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth-guard';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gate = await requireStaff();
  if (!gate.ok) redirect('/login?error=inactive_or_unauthorized');

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
        <Toaster position="bottom-right" theme="dark" toastOptions={{ style: { background: '#09090b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' } }} />
      </div>
      <GlobalStaffChat />
      <DevToolsWrapper />
    </div>
  );
}
