import React from 'react';
import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { prisma } from '@/lib/prisma';
import NotesPipelineClient from '@/components/notes/NotesPipelineClient';
import PlutusHandoffQueue from '@/components/billing/PlutusHandoffQueue';
import {
  evaluateAuthUnitHardStop,
  type AuthUnitHardStop,
} from '@/lib/billing/authUnits';
import Link from 'next/link';
import { Clock, Send, CheckCircle2, FileText, FileSearch } from 'lucide-react';
import { notFound } from 'next/navigation';
import { PLUTUS_TRACKER_ROLES, requireStaff } from '@/lib/auth-guard';

const noteInclude = {
  session: {
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          insurancePayer: true,
          memberId: true,
          medicaidId: true,
          authorizations: {
            where: { status: 'APPROVED' as const },
            select: { authNumber: true, type: true, status: true },
            orderBy: { updatedAt: 'desc' as const },
            take: 3,
          },
        },
      },
      rbt: { select: { id: true, firstName: true, lastName: true } },
      bcba: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  deficiencies: {
    where: { status: 'OPEN' as const },
  },
} as const;

export default async function NotesDashboard({
  searchParams,
}: {
  searchParams?: Promise<{ queue?: string }> | { queue?: string };
}) {
  const access = await requireStaff(PLUTUS_TRACKER_ROLES);
  if (!access.ok) notFound();

  const sp = searchParams instanceof Promise ? await searchParams : searchParams;
  const initialQueue = sp?.queue || 'ready';

  // Spec §9.3 — three durable SessionNote queues (no sample/mock claims).
  // KPI counts use count() so they don't silently cap at the take: 100 list limit.
  const [awaitingBcba, readyForPlutus, converted, awaitingCount, readyCount, convertedCount] =
    await Promise.all([
      prisma.sessionNote.findMany({
        where: { rbtSigned: true, bcbaSigned: false },
        include: noteInclude,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.findMany({
        where: { bcbaSigned: true, isConverted: false },
        include: noteInclude,
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.findMany({
        where: { isConverted: true },
        include: noteInclude,
        orderBy: { convertedAt: 'desc' },
        take: 100,
      }),
      prisma.sessionNote.count({ where: { rbtSigned: true, bcbaSigned: false } }),
      prisma.sessionNote.count({ where: { bcbaSigned: true, isConverted: false } }),
      prisma.sessionNote.count({ where: { isConverted: true } }),
    ]);

  // Pre-convert auth-unit warnings (gap 15): recompute the ledger per ready
  // note so billers see remaining vs requested BEFORE hitting the hard stop.
  const authUnitStatusByNoteId: Record<string, AuthUnitHardStop> = {};
  try {
    const readyClientIds = [
      ...new Set(
        readyForPlutus
          .map((n) => n.session?.clientId)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    const ledgerByClient = new Map(
      await Promise.all(
        readyClientIds.map(async (clientId) => {
          const [authorizations, paRequests, sessions] = await Promise.all([
            prisma.authorization.findMany({
              where: { clientId },
              include: { cptCodes: true },
            }),
            prisma.pARequest.findMany({ where: { clientId } }),
            prisma.session.findMany({
              where: { clientId },
              select: {
                id: true,
                status: true,
                cptCode: true,
                scheduledStart: true,
                scheduledEnd: true,
                actualStart: true,
                actualEnd: true,
                // Session.note is 1:1 (SessionNote?) — never treat as array
                note: {
                  select: {
                    billableUnits: true,
                    parentSigned: true,
                    parentSignedAt: true,
                    parentSignerName: true,
                    rbtSigned: true,
                    rbtSignedAt: true,
                    rbtSignerName: true,
                    bcbaSigned: true,
                    bcbaSignedAt: true,
                    bcbaSignerName: true,
                    isConverted: true,
                    checklistSnapshot: true,
                    structuredContent: true,
                    deficiencies: {
                      where: { status: 'OPEN' },
                      select: { id: true },
                    },
                  },
                },
              },
            }),
          ]);
          return [
            clientId,
            {
              authorizations,
              paRequests,
              sessions: sessions.map((session) => ({
                ...session,
                note: session.note
                  ? {
                      billableUnits: session.note.billableUnits,
                      parentSigned: session.note.parentSigned,
                      parentSignedAt: session.note.parentSignedAt,
                      parentSignerName: session.note.parentSignerName,
                      rbtSigned: session.note.rbtSigned,
                      rbtSignedAt: session.note.rbtSignedAt,
                      rbtSignerName: session.note.rbtSignerName,
                      bcbaSigned: session.note.bcbaSigned,
                      bcbaSignedAt: session.note.bcbaSignedAt,
                      bcbaSignerName: session.note.bcbaSignerName,
                      isConverted: session.note.isConverted,
                      checklistSnapshot: session.note.checklistSnapshot,
                      openDeficiencyCount: session.note.deficiencies.length,
                      submissionFingerprint: extractSubmissionFingerprint(
                        session.note.structuredContent,
                      ),
                    }
                  : null,
              })),
            },
          ] as const;
        })
      )
    );

    for (const note of readyForPlutus) {
      const clientId = note.session?.clientId;
      const sessionId = note.session?.id;
      const ledger = clientId ? ledgerByClient.get(clientId) : undefined;
      if (!clientId || !sessionId || !ledger) continue;
      authUnitStatusByNoteId[note.id] = evaluateAuthUnitHardStop({
        clientId,
        targetSessionId: sessionId,
        ...ledger,
      });
    }
  } catch (error) {
    // Warning layer only — the server-side hard stop still runs at convert
    console.error(
      'notes page auth-unit warnings failed:',
      error instanceof Error ? error.message : 'Unknown'
    );
  }

  const stats = [
    {
      label: 'Awaiting BCBA',
      count: awaitingCount,
      hint: 'rbtSigned && !bcbaSigned',
      icon: Clock,
      accent: 'text-amber-400',
      glow: 'bg-amber-500/10 border-amber-500/20',
    },
    {
      label: 'Ready for Plutus',
      count: readyCount,
      hint: 'bcbaSigned && !isConverted',
      icon: Send,
      accent: 'text-brand-orange-400',
      glow: 'bg-brand-orange-500/10 border-brand-orange-500/20',
    },
    {
      label: 'Converted',
      count: convertedCount,
      hint: 'isConverted',
      icon: CheckCircle2,
      accent: 'text-emerald-400',
      glow: 'bg-emerald-500/10 border-emerald-500/20',
    },
  ];

  return (
    <div className="relative space-y-8">
      <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-brand-orange-500/10 blur-3xl" />
      <div className="pointer-events-none absolute top-40 left-1/3 h-56 w-56 rounded-full bg-cyan-500/5 blur-3xl" />

      <div className="relative">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl">
              <FileText className="h-5 w-5 text-brand-orange-400" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-white tracking-tight">
                Manual Plutus / Claims Tracker
              </h1>
              <p className="text-zinc-400 text-sm mt-0.5">
                Live <span className="font-mono text-xs text-zinc-300">SessionNote</span> queues —
                mark <span className="font-mono text-xs text-zinc-300">isConverted</span> when you
                enter the claim in Plutus. No EDI in this phase.
              </p>
            </div>
          </div>
          <Link
            href="/portal-billing/audit"
            className="cursor-pointer shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/40 transition-all duration-300"
          >
            <FileSearch className="h-3.5 w-3.5" /> Dual-run audit
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 relative">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className={`rounded-2xl border backdrop-blur-xl bg-zinc-950/80 p-5 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-brand-orange-500/40 ${s.glow}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                  {s.label}
                </span>
                <Icon className={`h-4 w-4 ${s.accent}`} />
              </div>
              <div className={`mt-3 text-3xl font-heading font-bold ${s.accent}`}>{s.count}</div>
              <p className="mt-1 text-[11px] font-mono text-zinc-500">{s.hint}</p>
            </div>
          );
        })}
      </div>

      <NotesPipelineClient
        awaitingBcba={awaitingBcba}
        readyForPlutus={readyForPlutus}
        converted={converted}
        initialQueue={initialQueue}
        authUnitStatusByNoteId={authUnitStatusByNoteId}
      />

      <PlutusHandoffQueue readyNotes={readyForPlutus} convertedNotes={converted} />
    </div>
  );
}
