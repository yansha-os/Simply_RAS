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
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 relative font-sans">
        <div className="max-w-md w-full bg-white border border-amber-200 p-8 sm:p-10 rounded-3xl shadow-xl text-center animate-slide-up">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-amber-600 shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-heading font-extrabold text-slate-900 mb-3">This Link Is No Longer Active</h1>
          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            {liveness.error} Don&apos;t worry — everything you already filled out and uploaded is saved safely.
          </p>
          <div className="text-left space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="w-9 h-9 shrink-0 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Contact your care coordinator</p>
                <p className="text-xs text-slate-500 mt-0.5">Call or message the clinic and let them know your secure link stopped working.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="w-9 h-9 shrink-0 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Get a fresh link</p>
                <p className="text-xs text-slate-500 mt-0.5">They can send you a new secure link right away, and you&apos;ll pick up exactly where you left off.</p>
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

  if (!currentFingerprint || !/^[0-9a-f-]{36}$/i.test(currentFingerprint)) {
    notFound();
  }

  let boundFingerprint = packet.deviceFingerprint;
  if (!boundFingerprint) {
    const claimed = await prisma.intakePacket.updateMany({
      where: {
        id: packet.id,
        magicLinkToken: params.id,
        magicLinkRevokedAt: null,
        deviceFingerprint: null,
        OR: [
          { magicLinkExpiresAt: null },
          { magicLinkExpiresAt: { gt: new Date() } },
        ],
      },
      data: { deviceFingerprint: currentFingerprint },
    });

    if (claimed.count === 1) {
      boundFingerprint = currentFingerprint;
    } else {
      // Another request may have won the first-open race, or staff may have
      // revoked/rotated the link after the initial read. Re-read and fail closed.
      const latest = await prisma.intakePacket.findUnique({
        where: { id: packet.id },
        select: {
          magicLinkToken: true,
          magicLinkExpiresAt: true,
          magicLinkRevokedAt: true,
          deviceFingerprint: true,
        },
      });
      if (
        !latest ||
        latest.magicLinkToken !== params.id ||
        !magicLinkStatus(latest).ok
      ) {
        notFound();
      }
      boundFingerprint = latest.deviceFingerprint;
    }
  }

  if (boundFingerprint !== currentFingerprint) {
      // Mismatch! Security lock.
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 relative font-sans">
          <div className="max-w-md w-full bg-white border border-red-200 p-8 sm:p-10 rounded-3xl shadow-xl text-center animate-slide-up">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-5 text-red-600 shadow-sm">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-heading font-extrabold text-slate-900 mb-3">Device Locked</h1>
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              For your security, this portal is locked to the original device that opened this link.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-2xl p-4">
              Please return to your original device, or contact your care coordinator to request a fresh secure link.
            </p>
          </div>
        </div>
      );
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
