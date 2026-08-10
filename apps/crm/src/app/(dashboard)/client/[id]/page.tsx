import React from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ClientProfileTabs from '@/components/client-profile/ClientProfileTabs';
import FlowMap from '@/components/client-profile/FlowMap';
import ClientActiveCommandCenter from '@/components/client-profile/ClientActiveCommandCenter';
import BackButton from '@/components/ui/BackButton';
import { AlertTriangle } from 'lucide-react';

export default async function ClientProfilePage(props: { params: Promise<{ id: string }>, searchParams: Promise<{ mode?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const client = await prisma.client.findUnique({
    where: { id: params.id },
    include: {
      intakePacket: true,
      paRequests: true,
      bcba: true,
      rbt: true,
      messages: { orderBy: { createdAt: 'asc' } }
    }
  });

  if (!client) {
    notFound();
  }

  const allBcbas = await prisma.user.findMany({
    where: { role: 'BCBA', isActive: true },
    select: { 
      id: true, 
      firstName: true, 
      lastName: true,
      _count: {
        select: { supervisedClients: true }
      }
    }
  });

  // Calculate PA Expiring logic
  const txPa = client.paRequests?.find(p => p.type === 'TREATMENT');
  let isPaExpiringSoon = false;
  if (txPa && txPa.status === 'APPROVED' && txPa.expirationDate) {
    const daysUntil = Math.ceil((new Date(txPa.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 30 && daysUntil > 0) {
      isPaExpiringSoon = true;
    }
  }

  const isActive = client.status === 'ACTIVE';

  return (
    <div className="flex flex-col h-full animate-slide-up">

      <div className="px-[30px] pt-[28px] pb-[50px]">

        {/* Back Button */}
        <div className="mb-2">
          <BackButton />
        </div>

        {/* Client Header */}
        <h1 className="font-heading text-[31px] font-semibold m-0 mb-[8px] text-[var(--ink-100)]">
          {client.firstName} {client.lastName}
        </h1>
        <div className="text-[var(--ink-500)] text-[13.5px] mb-[24px] flex items-center gap-[10px]">
          <b className="text-[var(--ink-300)] font-semibold">Parent:</b> {client.guardianName} &nbsp;·&nbsp;
          <span className="inline-flex items-center gap-[6px] bg-[rgba(255,122,69,0.1)] text-[var(--dawn-hot)] border border-[rgba(255,122,69,0.28)] px-[10px] py-[3px] rounded-full font-mono text-[11px] font-semibold tracking-[.4px]">
            <span className="dot-live"></span>
            {client.status.replace(/_/g, ' ')}
          </span>
          {isPaExpiringSoon && (
            <span className="inline-flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-[10px] py-[3px] rounded-full font-mono text-[11px] font-semibold tracking-[.4px]">
              <AlertTriangle className="w-3.5 h-3.5" />
              PA EXPIRES &lt; 30 DAYS
            </span>
          )}
        </div>

      {/* Conditionally Render Command Center for Active Clients or FlowMap for Pipeline Clients */}
      {isActive ? (
        <ClientActiveCommandCenter client={client} />
      ) : (
        <FlowMap key={`flowmap-${client.status}-${client.intakePacket?.status}`} client={client} />
      )}

      {/* Sub Tabs: Overview, Documents, Authorization */}
      <ClientProfileTabs client={client} mode={searchParams?.mode} bcbas={allBcbas} />
      
      </div>
    </div>
  );
}
