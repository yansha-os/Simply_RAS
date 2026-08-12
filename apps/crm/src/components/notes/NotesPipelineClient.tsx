'use client';

import React, { useState, useTransition, useActionState } from 'react';
import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { convertNoteToBillable, flagDeficiency } from '@/app/(dashboard)/notes/actions';
import type { AuthUnitHardStop } from '@/lib/billing/authUnits';
import {
  CheckSquare,
  AlertTriangle,
  Clock,
  Send,
  CheckCircle2,
  User,
  Calendar,
  Hash,
  PenTool,
  ShieldAlert,
  Gauge,
} from 'lucide-react';
import Link from 'next/link';

type FlagActionState = { error?: string; success?: boolean };
const flagInitialState: FlagActionState = {};

type QueueTab = 'awaiting' | 'ready' | 'converted';

type OverridePrompt = {
  remainingUnits: number;
  requestedUnits: number;
  cptCode: string;
  authNumber: string | null;
};

type PipelineNote = {
  id: string;
  updatedAt: Date | string;
  structuredContent: unknown;
  billableUnits: number | null;
  rbtSigned: boolean;
  parentSigned: boolean;
  bcbaSigned: boolean;
  plutusClaimRef?: string | null;
  convertedAt?: Date | string | null;
  deficiencies?: Array<{ id: string }>;
  session?: {
    id?: string;
    rbtId?: string | null;
    cptCode?: string | null;
    scheduledStart?: Date | string | null;
    scheduledEnd?: Date | string | null;
    actualStart?: Date | string | null;
    actualEnd?: Date | string | null;
    rbt?: { firstName: string; lastName: string } | null;
    client?: {
      id: string;
      firstName: string;
      lastName: string;
      insurancePayer?: string | null;
      memberId?: string | null;
      medicaidId?: string | null;
      authorizations?: Array<{ authNumber: string | null }>;
    } | null;
  } | null;
};

/** Honest pre-convert auth-unit badge (gap 15) — server hard stop is the enforcement */
function AuthUnitBadge({ status }: { status?: AuthUnitHardStop }) {
  if (!status) return null;

  if (!status.enforced) {
    if (!status.manualReviewRequired) return null;
    return (
      <span
        title={status.reason.replaceAll('_', ' ').toLowerCase()}
        className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400"
      >
        <ShieldAlert className="h-3 w-3" /> Auth manual review
      </span>
    );
  }

  if (status.exceeded) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-400">
        <ShieldAlert className="h-3 w-3" /> Exceeds auth · {status.remainingBeforeNote} left /{' '}
        {status.requestedUnits} req
      </span>
    );
  }

  if (status.remainingAfterNote <= 8) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400">
        <Gauge className="h-3 w-3" /> Low auth · {status.remainingAfterNote} left after convert
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400">
      <Gauge className="h-3 w-3" /> Auth OK · {status.remainingBeforeNote} units left
    </span>
  );
}

function sessionMinutes(note: PipelineNote): number {
  const start = note.session?.actualStart || note.session?.scheduledStart;
  const end = note.session?.actualEnd || note.session?.scheduledEnd;
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function NoteCard({
  note,
  mode,
  onConvert,
  onOverrideConvert,
  overridePrompt,
  overrideReason,
  setOverrideReason,
  authUnitStatus,
  isConverting,
  convertingId,
  claimRefs,
  setClaimRef,
  flagAction,
  isFlagging,
}: {
  note: PipelineNote;
  mode: QueueTab;
  onConvert: (id: string) => void;
  onOverrideConvert: (id: string) => void;
  overridePrompt?: OverridePrompt;
  overrideReason: string;
  setOverrideReason: (id: string, value: string) => void;
  authUnitStatus?: AuthUnitHardStop;
  isConverting: boolean;
  convertingId: string | null;
  claimRefs: Record<string, string>;
  setClaimRef: (id: string, value: string) => void;
  flagAction: (payload: FormData) => void;
  isFlagging: boolean;
}) {
  const client = note.session?.client;
  const clientName = client
    ? `${client.firstName} ${client.lastName}`
    : 'Unknown client';
  const serviceDate = note.session?.scheduledStart
    ? new Date(note.session.scheduledStart).toLocaleDateString()
    : '—';
  const units = note.billableUnits ?? null;
  const mins = sessionMinutes(note);
  const auth =
    client?.authorizations?.find((authorization) => authorization.authNumber)
      ?.authNumber || '—';
  const openDeficiencies = note.deficiencies?.length || 0;
  const expectedNoteUpdatedAt = note.updatedAt
    ? new Date(note.updatedAt).toISOString()
    : '';
  const expectedSubmissionFingerprint =
    extractSubmissionFingerprint(note.structuredContent) ?? '';
  const hasCurrentRevision = Boolean(
    expectedNoteUpdatedAt && expectedSubmissionFingerprint,
  );

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-5 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-brand-orange-500/40">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-orange-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="flex justify-between items-start gap-3 relative">
        <div className="min-w-0">
          <Link
            href={client?.id ? `/client/${client.id}` : '#'}
            className="font-heading font-semibold text-lg text-white hover:text-brand-orange-400 transition-colors cursor-pointer truncate block"
          >
            {clientName}
          </Link>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {serviceDate}
            </span>
            {note.session?.cptCode && (
              <span className="inline-flex items-center gap-1 text-cyan-400/90">
                <Hash className="h-3 w-3" /> CPT {note.session.cptCode}
              </span>
            )}
            {(units != null || mins > 0) && (
              <span className="inline-flex items-center gap-1 text-brand-orange-300/90">
                {units != null ? `${units} billable unit${units === 1 ? '' : 's'}` : `${mins} min`}
              </span>
            )}
          </div>
          {mode === 'ready' && authUnitStatus && (
            <div className="mt-2">
              <AuthUnitBadge status={authUnitStatus} />
            </div>
          )}
        </div>

        {mode === 'awaiting' && (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-400">
            <span className="dot-live h-1.5 w-1.5 rounded-full bg-amber-400" />
            Awaiting BCBA
          </span>
        )}
        {mode === 'ready' && (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-brand-orange-500/20 bg-brand-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-orange-400">
            Ready
          </span>
        )}
        {mode === 'converted' && (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
            Converted
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-zinc-400 border-t border-white/5 pt-3">
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-zinc-600" />
          RBT:{' '}
          <span className="text-zinc-300">
            {note.session?.rbt
              ? `${note.session.rbt.firstName} ${note.session.rbt.lastName}`
              : '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <PenTool className="h-3 w-3 text-zinc-600" />
          Auth: <span className="font-mono text-zinc-300">{auth}</span>
        </div>
        <div className="flex items-center gap-1.5 col-span-2">
          <CheckSquare
            className={`h-3 w-3 ${note.rbtSigned ? 'text-emerald-400' : 'text-zinc-600'}`}
          />
          RBT {note.rbtSigned ? 'signed' : 'unsigned'}
          <span className="text-zinc-700">·</span>
          <CheckSquare
            className={`h-3 w-3 ${note.parentSigned ? 'text-emerald-400' : 'text-amber-500'}`}
          />
          Parent {note.parentSigned ? 'signed' : 'optional'}
          <span className="text-zinc-700">·</span>
          <CheckSquare
            className={`h-3 w-3 ${note.bcbaSigned ? 'text-emerald-400' : 'text-amber-500'}`}
          />
          BCBA {note.bcbaSigned ? 'signed' : 'pending'}
        </div>
        {client?.insurancePayer && (
          <div className="col-span-2 text-cyan-400/80 font-mono truncate">
            {client.insurancePayer}
            {client.memberId || client.medicaidId
              ? ` · ${client.memberId || client.medicaidId}`
              : ''}
          </div>
        )}
        {openDeficiencies > 0 && (
          <div className="col-span-2 flex items-center gap-1.5 text-rose-400">
            <AlertTriangle className="h-3 w-3" />
            {openDeficiencies} open deficiency(ies)
          </div>
        )}
        {mode === 'converted' && (
          <div className="col-span-2 font-mono text-emerald-400/90">
            {note.plutusClaimRef
              ? `Claim ref: ${note.plutusClaimRef}`
              : 'Marked in Plutus'}
            {note.convertedAt
              ? ` · ${new Date(note.convertedAt).toLocaleDateString()}`
              : ''}
          </div>
        )}
      </div>

      {mode === 'ready' && (
        <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
          <input
            type="text"
            value={claimRefs[note.id] || ''}
            onChange={(e) => setClaimRef(note.id, e.target.value)}
            placeholder="Plutus claim / batch ref (required)…"
            className="w-full rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-brand-orange-500/50"
          />
          <Button
            variant="primary"
            size="sm"
            className="w-full bg-brand-orange-500 hover:bg-brand-orange-600 text-white cursor-pointer rounded-xl disabled:cursor-not-allowed"
            onClick={() => onConvert(note.id)}
            isLoading={isConverting && convertingId === note.id}
            disabled={
              isConverting ||
              !hasCurrentRevision ||
              !(claimRefs[note.id] || '').trim()
            }
          >
            Mark sent to Plutus (manual tracker)
          </Button>

          {overridePrompt && (
            <div className="space-y-2 rounded-xl border border-rose-500/25 bg-rose-950/30 p-3">
              <p className="flex items-start gap-1.5 text-[11px] text-rose-300">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Auth-unit hard stop — {overridePrompt.remainingUnits} unit(s) remaining for CPT{' '}
                {overridePrompt.cptCode}
                {overridePrompt.authNumber ? ` (auth ${overridePrompt.authNumber})` : ''} vs{' '}
                {overridePrompt.requestedUnits} requested. Overrides are recorded in the audit
                vault.
              </p>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(note.id, e.target.value)}
                placeholder="Override reason (required, audited)…"
                className="w-full rounded-xl border border-rose-500/25 bg-zinc-900/80 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-rose-500/50"
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full text-rose-300 border-rose-500/30 hover:bg-rose-500/10 cursor-pointer rounded-xl disabled:cursor-not-allowed"
                onClick={() => onOverrideConvert(note.id)}
                isLoading={isConverting && convertingId === note.id}
                disabled={
                  isConverting ||
                  !hasCurrentRevision ||
                  !(claimRefs[note.id] || '').trim() ||
                  overrideReason.trim().length === 0
                }
              >
                Override & convert past auth units (audited)
              </Button>
            </div>
          )}

          <form action={flagAction} className="flex gap-2">
            <input type="hidden" name="noteId" value={note.id} />
            <input
              type="hidden"
              name="expectedNoteUpdatedAt"
              value={expectedNoteUpdatedAt}
            />
            <input
              type="hidden"
              name="expectedSubmissionFingerprint"
              value={expectedSubmissionFingerprint}
            />
            <input
              type="text"
              name="description"
              placeholder="Describe chart/note error to alert RBT…"
              className="flex-1 rounded-xl border border-rose-500/20 bg-rose-950/20 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-rose-500/40"
              required
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10 text-xs px-2 cursor-pointer rounded-xl"
              isLoading={isFlagging}
              disabled={!hasCurrentRevision || isFlagging}
            >
              <AlertTriangle className="w-3 h-3 mr-1" /> Flag
            </Button>
          </form>
        </div>
      )}

      {mode === 'awaiting' && client?.id && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <Link
            href={`/client/${client.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 cursor-pointer transition-colors"
          >
            Open client chart for BCBA sign-off →
          </Link>
        </div>
      )}
    </div>
  );
}

function parseQueueTab(raw: string | null | undefined): QueueTab {
  if (raw === 'awaiting' || raw === 'ready' || raw === 'converted') return raw;
  return 'ready';
}

export default function NotesPipelineClient({
  awaitingBcba = [],
  readyForPlutus = [],
  converted = [],
  initialQueue = 'ready',
  authUnitStatusByNoteId = {},
}: {
  awaitingBcba?: PipelineNote[];
  readyForPlutus?: PipelineNote[];
  converted?: PipelineNote[];
  /** Deep-link from BCBA e-sign CTA: /notes?queue=ready */
  initialQueue?: string;
  /** Pre-convert auth-unit ledger status per ready note (gap 15) */
  authUnitStatusByNoteId?: Record<string, AuthUnitHardStop>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<QueueTab>(() => parseQueueTab(initialQueue));
  const [isConverting, startTransition] = useTransition();
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [claimRefs, setClaimRefs] = useState<Record<string, string>>({});
  const [overridePrompts, setOverridePrompts] = useState<Record<string, OverridePrompt>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [flagState, flagAction, isFlagging] = useActionState<
    FlagActionState,
    FormData
  >(
    flagDeficiency,
    flagInitialState
  );

  React.useEffect(() => {
    if (flagState?.success) {
      toast.success('Deficiency flagged — signatures cleared for correction.');
      router.refresh();
    } else if (flagState?.error) {
      toast.error(flagState.error);
    }
  }, [flagState, router]);

  const runConvert = (noteId: string, override: boolean) => {
    const note = readyForPlutus.find((candidate) => candidate.id === noteId);
    const expectedSubmissionFingerprint = extractSubmissionFingerprint(
      note?.structuredContent,
    );
    const expectedNoteUpdatedAt = note?.updatedAt
      ? new Date(note.updatedAt).toISOString()
      : null;
    if (!note || !expectedNoteUpdatedAt || !expectedSubmissionFingerprint) {
      toast.error('This note revision is incomplete. Reload before conversion.');
      return;
    }
    setConvertingId(noteId);
    startTransition(async () => {
      const res = await convertNoteToBillable(noteId, {
        plutusClaimRef: claimRefs[noteId],
        expectedNoteUpdatedAt,
        expectedSubmissionFingerprint,
        ...(override
          ? { overrideAuthUnits: true, overrideReason: overrideReasons[noteId]?.trim() }
          : {}),
      });
      setConvertingId(null);
      if (res.success) {
        setOverridePrompts((prev) => {
          const next = { ...prev };
          delete next[noteId];
          return next;
        });
        toast.success(
          'alreadyConverted' in res && res.alreadyConverted
            ? 'Already marked for Plutus.'
            : 'authUnitOverridden' in res && res.authUnitOverridden
              ? 'Converted past the auth-unit stop — override recorded in the audit vault.'
              : 'Marked sent to Plutus (manual tracker).'
        );
        if ('credentialWarnings' in res && res.credentialWarnings?.length) {
          toast.warning('Credential check — converted, but review before claims', {
            description: res.credentialWarnings.join(' · '),
            duration: 10000,
          });
        }
        router.refresh();
      } else if ('error' in res && res.error) {
        // Auth-unit hard stop (gap 15): leadership roles get an inline,
        // reason-required override path; everyone else just sees the block.
        if ('authUnitStop' in res && res.authUnitStop?.canOverride) {
          setOverridePrompts((prev) => ({ ...prev, [noteId]: res.authUnitStop! }));
        }
        toast.error(res.error);
      }
    });
  };

  const handleConvert = (noteId: string) => runConvert(noteId, false);
  const handleOverrideConvert = (noteId: string) => runConvert(noteId, true);

  const setClaimRef = (id: string, value: string) => {
    setClaimRefs((prev) => ({ ...prev, [id]: value }));
  };

  const setOverrideReason = (id: string, value: string) => {
    setOverrideReasons((prev) => ({ ...prev, [id]: value }));
  };

  const tabs: { id: QueueTab; label: string; count: number; icon: typeof Clock }[] = [
    { id: 'awaiting', label: 'Awaiting BCBA', count: awaitingBcba.length, icon: Clock },
    { id: 'ready', label: 'Ready for Plutus', count: readyForPlutus.length, icon: Send },
    { id: 'converted', label: 'Converted', count: converted.length, icon: CheckCircle2 },
  ];

  const activeNotes =
    tab === 'awaiting' ? awaitingBcba : tab === 'ready' ? readyForPlutus : converted;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold font-heading text-white">Session note queues</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Driven by Prisma <span className="font-mono">SessionNote</span> + Session + Client.
            Convert sets <span className="font-mono">isConverted</span> only when{' '}
            <span className="font-mono">bcbaSigned</span>.
          </p>
        </div>

        <div className="flex bg-zinc-900/80 p-1 rounded-2xl border border-white/10 backdrop-blur-xl">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? 'bg-brand-orange-500/20 text-brand-orange-300 border border-brand-orange-500/30 shadow-md'
                    : 'text-zinc-400 hover:text-white border border-transparent'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{t.label}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md ${
                    active ? 'bg-brand-orange-500/30 text-brand-orange-200' : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {activeNotes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            mode={tab}
            onConvert={handleConvert}
            onOverrideConvert={handleOverrideConvert}
            overridePrompt={overridePrompts[note.id]}
            overrideReason={overrideReasons[note.id] || ''}
            setOverrideReason={setOverrideReason}
            authUnitStatus={authUnitStatusByNoteId[note.id]}
            isConverting={isConverting}
            convertingId={convertingId}
            claimRefs={claimRefs}
            setClaimRef={setClaimRef}
            flagAction={flagAction}
            isFlagging={isFlagging}
          />
        ))}

        {activeNotes.length === 0 && (
          <div className="col-span-2 relative overflow-hidden text-center p-12 border border-dashed border-white/10 rounded-2xl bg-zinc-950/40 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,107,0,0.05),transparent_60%)]" />
            <div className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/80">
              {tab === 'awaiting' && <Clock className="h-5 w-5 text-amber-400/80" />}
              {tab === 'ready' && <Send className="h-5 w-5 text-brand-orange-400/80" />}
              {tab === 'converted' && <CheckCircle2 className="h-5 w-5 text-emerald-400/80" />}
            </div>
            <p className="relative font-heading text-sm font-semibold text-white">Queue empty</p>
            <p className="relative text-xs mt-1.5 text-zinc-500 max-w-md mx-auto">
              {tab === 'awaiting' &&
                'No RBT-signed notes awaiting BCBA co-sign — new RBT Studio submits land here.'}
              {tab === 'ready' &&
                'No BCBA-signed notes ready for Plutus handoff — e-sign notes in the BCBA queue to fill this.'}
              {tab === 'converted' &&
                'No notes marked converted yet — use “Mark sent to Plutus” on a ready note.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
