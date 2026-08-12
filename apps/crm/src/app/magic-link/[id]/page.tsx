import React from 'react';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ShieldAlert, Phone, RefreshCw } from 'lucide-react';

import ClientPortalView from '@/components/magic-link/ClientPortalView';
import { magicLinkStatus } from '@/lib/magicLinkGuard';

export const dynamic = 'force-dynamic';

export default async function MagicLinkPage(props: { params: Promise<{ id: string }>, searchParams: Promise<{ success?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  
  const packet = await prisma.intakePacket.findUnique({
    where: { magicLinkToken: params.id },
    include: { client: true }
  });

  if (!packet || !packet.client) {
    notFound();
  }

  // EXPIRY / REVOCATION (gap 7): dead links render a contact-the-clinic screen.
  const liveness = magicLinkStatus(packet);
  if (!liveness.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a0c] bg-grid-pattern relative">
        <div className="max-w-md w-full bg-[#0f1115] border border-amber-500/30 p-10 rounded-[2rem] shadow-[0_0_50px_rgba(255,180,0,0.12)] text-center animate-slide-up">
          <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-10 h-10 text-amber-400" />
          </div>
          <h1 className="text-3xl font-heading font-black text-white text-glow mb-4">This Link Is No Longer Active</h1>
          <p className="text-slate-400 leading-relaxed mb-8">
            {liveness.error} Don&apos;t worry — everything you already filled out and uploaded is saved safely.
          </p>
          <div className="text-left space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-zinc-950/60 p-4">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-brand-blue-500/10 border border-brand-blue-500/25 flex items-center justify-center">
                <Phone className="w-4 h-4 text-brand-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Contact your care coordinator</p>
                <p className="text-xs text-zinc-400 mt-0.5">Call or message the clinic and let them know your secure link stopped working.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-zinc-950/60 p-4">
              <div className="w-9 h-9 shrink-0 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Get a fresh link</p>
                <p className="text-xs text-zinc-400 mt-0.5">They can send you a new secure link right away, and you&apos;ll pick up exactly where you left off.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // DEVICE LOCKING LOGIC
  const headersList = await headers();
  const currentFingerprint = headersList.get('x-device-fingerprint');

  if (!currentFingerprint) {
    // If somehow middleware didn't run, fallback to soft warning or pass
    console.warn("No device fingerprint found in headers. Middleware might not be running.");
  } else {
    if (!packet.deviceFingerprint) {
      // First time clicking link, lock the device
      await prisma.intakePacket.update({
        where: { id: packet.id },
        data: { deviceFingerprint: currentFingerprint }
      });
      packet.deviceFingerprint = currentFingerprint;
    } else if (packet.deviceFingerprint !== currentFingerprint) {
      // Mismatch! Security lock.
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#0a0a0c] bg-grid-pattern relative">
          <div className="max-w-md w-full bg-[#0f1115] border border-red-500/30 p-10 rounded-[2rem] shadow-[0_0_50px_rgba(255,0,0,0.15)] text-center animate-slide-up">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-10 h-10 text-red-500" />
            </div>
            <h1 className="text-3xl font-heading font-black text-white text-glow mb-4">Device Locked</h1>
            <p className="text-slate-400 leading-relaxed">
              For your security and HIPAA compliance, this portal is locked to the original device that opened this link. 
              Please return to your original device, or contact the clinic to request a new secure link.
            </p>
          </div>
        </div>
      );
    }
  }

  // To keep compatibility with ContinuousIntakeForm
  const client = { ...packet.client, intakePacket: [packet] };

  // Fetch Message History
  const messages = await prisma.clientMessage.findMany({
    where: { clientId: packet.clientId },
    orderBy: { createdAt: 'asc' }
  });

  // Parent therapy loop (ACTIVE / STAFFING) — schedule + light note status, no clinical PHI / EDI
  const showTherapyLoop = ['ACTIVE', 'STAFFING_PENDING'].includes(packet.client.status);
  const now = new Date();

  function placeLabelFromLocation(location: string | null | undefined): string | null {
    if (!location?.trim()) return null;
    // POS-style label only (e.g. "Home") — strip codes / avoid address PHI
    return location.includes('-')
      ? location.split('-').slice(1).join('-').trim() || null
      : location.trim();
  }

  function mapParentSession(s: {
    id: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    status: string;
    location: string | null;
    note: { rbtSigned: boolean; bcbaSigned: boolean } | null;
  }) {
    return {
      id: s.id,
      scheduledStart: s.scheduledStart.toISOString(),
      scheduledEnd: s.scheduledEnd.toISOString(),
      status: s.status,
      placeLabel: placeLabelFromLocation(s.location),
      // SessionNote is one-to-one on Session — rbtSigned / bcbaSigned live on the note
      rbtSigned: s.note?.rbtSigned ?? false,
      bcbaSigned: s.note?.bcbaSigned ?? false,
      hasNote: Boolean(s.note),
    };
  }

  const sessionNoteSelect = {
    rbtSigned: true,
    bcbaSigned: true,
  } as const;

  let upcomingSessions: ReturnType<typeof mapParentSession>[] = [];
  let pastSessions: ReturnType<typeof mapParentSession>[] = [];

  if (showTherapyLoop) {
    const [upcomingRows, pastRows] = await Promise.all([
      prisma.session.findMany({
        where: {
          clientId: packet.clientId,
          status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          scheduledEnd: { gte: now },
          NOT: { cptCode: '97151' },
        },
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          location: true,
          note: { select: sessionNoteSelect },
        },
        orderBy: { scheduledStart: 'asc' },
        take: 8,
      }),
      prisma.session.findMany({
        where: {
          clientId: packet.clientId,
          status: 'COMPLETED',
          NOT: { cptCode: '97151' },
        },
        select: {
          id: true,
          scheduledStart: true,
          scheduledEnd: true,
          status: true,
          location: true,
          note: { select: sessionNoteSelect },
        },
        orderBy: { scheduledStart: 'desc' },
        take: 8,
      }),
    ]);
    upcomingSessions = upcomingRows.map(mapParentSession);
    pastSessions = pastRows.map(mapParentSession);
  }

  return (
    <ClientPortalView
      packet={packet}
      client={client}
      messages={messages}
      upcomingSessions={upcomingSessions}
      pastSessions={pastSessions}
      showTherapyLoop={showTherapyLoop}
      justSubmitted={searchParams?.success === 'true' && packet.status === 'SUBMITTED'}
    />
  );
}
