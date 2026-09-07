'use client';



import React, { useMemo, useState, useTransition, useActionState } from 'react';

import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';



import { Card } from '@/components/ui/Card';

import { Button } from '@/components/ui/Button';

import { toast } from 'sonner';

import { useRouter } from 'next/navigation';

import {

  convertNoteToBillable,

  exportPlutusHandoffCsv,

  flagDeficiency,

} from '@/app/(dashboard)/notes/actions';

import type { AuthUnitHardStop } from '@/lib/billing/authUnits';

import type { ClaimScrubResult } from '@/lib/claimScrubberEngine';

import {

  EmptyColumn,

  QueueBoard,

  QueueLane,

  QueueSearchInput,

} from '@/components/portal-billing/PaQueueShared';

import {

  AlertTriangle,

  ArrowRight,

  Calendar,

  CheckCircle2,

  Clock,

  Download,

  FileWarning,

  Gauge,

  Hash,

  Loader2,

  Send,

  ShieldAlert,

} from 'lucide-react';

import Link from 'next/link';



type FlagActionState = { error?: string; success?: boolean };

const flagInitialState: FlagActionState = {};



type QueueMode = 'awaiting' | 'ready' | 'converted';



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

    bcba?: { firstName: string; lastName: string } | null;

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



const BADGE_BASE =

  'inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border';



function SignBadge({

  label,

  signed,

  optional,

}: {

  label: string;

  signed: boolean;

  optional?: boolean;

}) {

  const cls = signed

    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'

    : optional

      ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'

      : 'bg-amber-500/10 text-amber-400 border-amber-500/20';

  return (

    <span className={`${BADGE_BASE} ${cls}`}>

      {signed && <CheckCircle2 className="h-2.5 w-2.5" />}

      {label} {signed ? '✓' : optional ? 'opt' : '—'}

    </span>

  );

}



function ScrubBadge({ scrub }: { scrub?: ClaimScrubResult }) {

  if (!scrub) return null;

  if (scrub.status === 'CLEAN') {

    return (

      <span className={`${BADGE_BASE} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>

        <CheckCircle2 className="h-2.5 w-2.5" /> Scrub clean

      </span>

    );

  }

  const blocking = scrub.defects.filter((d) => d.severity === 'BLOCKING').length;

  return (

    <span className={`${BADGE_BASE} bg-rose-500/10 text-rose-400 border-rose-500/20`}>

      <FileWarning className="h-2.5 w-2.5" /> {blocking} scrub blocker{blocking === 1 ? '' : 's'}

    </span>

  );

}



function AuthUnitBadge({ status }: { status?: AuthUnitHardStop }) {

  if (!status) return null;



  if (!status.enforced) {

    if (!status.manualReviewRequired) return null;

    return (

      <span

        title={status.reason.replaceAll('_', ' ').toLowerCase()}

        className={`${BADGE_BASE} bg-amber-500/10 text-amber-400 border-amber-500/20`}

      >

        <ShieldAlert className="h-2.5 w-2.5" /> Auth review

      </span>

    );

  }



  if (status.exceeded) {

    return (

      <span className={`${BADGE_BASE} bg-rose-500/10 text-rose-400 border-rose-500/20`}>

        <ShieldAlert className="h-2.5 w-2.5" /> Auth exceeded

      </span>

    );

  }



  if (status.remainingAfterNote <= 8) {

    return (

      <span className={`${BADGE_BASE} bg-amber-500/10 text-amber-400 border-amber-500/20`}>

        <Gauge className="h-2.5 w-2.5" /> Low auth

      </span>

    );

  }



  return (

    <span className={`${BADGE_BASE} bg-emerald-500/10 text-emerald-400 border-emerald-500/20`}>

      <Gauge className="h-2.5 w-2.5" /> Auth OK

    </span>

  );

}



function sessionMinutes(note: PipelineNote): number {

  const start = note.session?.actualStart || note.session?.scheduledStart;

  const end = note.session?.actualEnd || note.session?.scheduledEnd;

  if (!start || !end) return 0;

  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));

}



function filterNotesByQuery(notes: PipelineNote[], query: string) {

  const q = query.trim().toLowerCase();

  if (!q) return notes;

  return notes.filter((note) => {

    const client = note.session?.client;

    const name = client ? `${client.firstName} ${client.lastName}`.toLowerCase() : '';

    const rbt = note.session?.rbt

      ? `${note.session.rbt.firstName} ${note.session.rbt.lastName}`.toLowerCase()

      : '';

    const bcba = note.session?.bcba

      ? `${note.session.bcba.firstName} ${note.session.bcba.lastName}`.toLowerCase()

      : '';

    return name.includes(q) || rbt.includes(q) || bcba.includes(q);

  });

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

  scrubStatus,

  convertBlockers,

  isConverting,

  convertingId,

  claimRefs,

  setClaimRef,

  flagAction,

  isFlagging,

  canConvert = true,

}: {

  note: PipelineNote;

  mode: QueueMode;

  onConvert: (id: string) => void;

  onOverrideConvert: (id: string) => void;

  overridePrompt?: OverridePrompt;

  overrideReason: string;

  setOverrideReason: (id: string, value: string) => void;

  authUnitStatus?: AuthUnitHardStop;

  scrubStatus?: ClaimScrubResult;

  convertBlockers?: string[];

  isConverting: boolean;

  convertingId: string | null;

  claimRefs: Record<string, string>;

  setClaimRef: (id: string, value: string) => void;

  flagAction: (payload: FormData) => void;

  isFlagging: boolean;

  canConvert?: boolean;

}) {

  const client = note.session?.client;

  const clientName = client ? `${client.firstName} ${client.lastName}` : 'Unknown client';

  const serviceDate = note.session?.scheduledStart

    ? new Date(note.session.scheduledStart).toLocaleDateString()

    : '—';

  const units = note.billableUnits ?? null;

  const mins = sessionMinutes(note);

  const openDeficiencies = note.deficiencies?.length || 0;

  const expectedNoteUpdatedAt = note.updatedAt ? new Date(note.updatedAt).toISOString() : '';

  const expectedSubmissionFingerprint = extractSubmissionFingerprint(note.structuredContent) ?? '';

  const hasCurrentRevision = Boolean(expectedNoteUpdatedAt && expectedSubmissionFingerprint);

  const hasConvertBlockers = (convertBlockers?.length ?? 0) > 0;

  const clientHref = client?.id
    ? `/client/${client.id}?mode=billing&tab=session_notes`
    : '#';



  return (

    <Card className="group overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-brand-orange-500/40 hover:shadow-2xl hover:scale-[1.01]">

      <Link href={clientHref} className="block cursor-pointer p-3.5 pb-2.5">

        <div className="flex items-start justify-between gap-2">

          <div className="min-w-0">

            <h4 className="truncate font-heading text-sm font-bold text-white transition-colors group-hover:text-brand-orange-300">

              {clientName}

            </h4>

            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[10px] text-zinc-500">

              <span className="inline-flex items-center gap-0.5">

                <Calendar className="h-2.5 w-2.5" /> {serviceDate}

              </span>

              {note.session?.cptCode && (

                <span className="inline-flex items-center gap-0.5 text-cyan-400/90">

                  <Hash className="h-2.5 w-2.5" /> {note.session.cptCode}

                </span>

              )}

              {(units != null || mins > 0) && (

                <span className="text-brand-orange-300/90">

                  {units != null ? `${units}u` : `${mins}m`}

                </span>

              )}

            </div>

          </div>

          {mode === 'awaiting' && (

            <span className="dot-live h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />

          )}

          {mode === 'ready' && (

            <span className="dot-live h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange-400" />

          )}

          {mode === 'converted' && (

            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />

          )}

        </div>



        <div className="mt-2 flex flex-wrap gap-1">

          <SignBadge label="RBT" signed={note.rbtSigned} />

          <SignBadge label="BCBA" signed={note.bcbaSigned} />

          <SignBadge label="Parent" signed={note.parentSigned} optional />

        </div>



        {(mode === 'ready' || openDeficiencies > 0) && (

          <div className="mt-2 flex flex-wrap gap-1">

            {mode === 'ready' && authUnitStatus && <AuthUnitBadge status={authUnitStatus} />}

            {mode === 'ready' && scrubStatus && <ScrubBadge scrub={scrubStatus} />}

            {openDeficiencies > 0 && (

              <span className={`${BADGE_BASE} bg-rose-500/10 text-rose-400 border-rose-500/20`}>

                <AlertTriangle className="h-2.5 w-2.5" /> {openDeficiencies} deficiency

              </span>

            )}

          </div>

        )}



        {mode === 'converted' && (

          <p className="mt-2 truncate font-mono text-[10px] text-emerald-400/90">

            {note.plutusClaimRef ? `Ref ${note.plutusClaimRef}` : 'Claim filed'}

            {note.convertedAt ? ` · ${new Date(note.convertedAt).toLocaleDateString()}` : ''}

          </p>

        )}

      </Link>



      {mode === 'ready' && convertBlockers && convertBlockers.length > 0 && (

        <ul className="mx-3.5 mb-2 space-y-0.5 rounded-lg border border-rose-500/20 bg-rose-950/20 p-2 text-[10px] text-rose-300">

          {convertBlockers.slice(0, 2).map((line) => (

            <li key={line} className="flex items-start gap-1">

              <ShieldAlert className="mt-0.5 h-2.5 w-2.5 shrink-0" />

              <span className="line-clamp-2">{line}</span>

            </li>

          ))}

          {convertBlockers.length > 2 && (

            <li className="text-rose-400/70">+{convertBlockers.length - 2} more blockers</li>

          )}

        </ul>

      )}



      {mode === 'ready' && canConvert && (

        <div className="space-y-2 border-t border-white/5 px-3.5 py-3">

          <input

            type="text"

            value={claimRefs[note.id] || ''}

            onChange={(e) => setClaimRef(note.id, e.target.value)}

            placeholder="Claim / batch reference…"

            className="w-full rounded-lg border border-white/10 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] font-mono text-white placeholder:text-zinc-600 focus:border-brand-orange-500/50 focus:outline-none"

          />

          <Button

            variant="primary"

            size="sm"

            className="w-full cursor-pointer rounded-lg bg-brand-orange-500 text-xs hover:bg-brand-orange-600 disabled:cursor-not-allowed"

            onClick={() => onConvert(note.id)}

            isLoading={isConverting && convertingId === note.id}

            disabled={

              isConverting ||

              !hasCurrentRevision ||

              !(claimRefs[note.id] || '').trim() ||

              hasConvertBlockers

            }

          >

            Mark claim filed

          </Button>



          {overridePrompt && (

            <div className="space-y-1.5 rounded-lg border border-rose-500/25 bg-rose-950/30 p-2.5">

              <p className="text-[10px] leading-snug text-rose-300">

                Auth hard stop — {overridePrompt.remainingUnits} left vs{' '}

                {overridePrompt.requestedUnits} req (CPT {overridePrompt.cptCode}). Override is

                audited.

              </p>

              <input

                type="text"

                value={overrideReason}

                onChange={(e) => setOverrideReason(note.id, e.target.value)}

                placeholder="Override reason (required)…"

                className="w-full rounded-lg border border-rose-500/25 bg-zinc-900/80 px-2.5 py-1.5 text-[11px] text-white placeholder:text-zinc-600 focus:border-rose-500/50 focus:outline-none"

              />

              <Button

                size="sm"

                variant="outline"

                className="w-full cursor-pointer rounded-lg border-rose-500/30 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed"

                onClick={() => onOverrideConvert(note.id)}

                isLoading={isConverting && convertingId === note.id}

                disabled={

                  isConverting ||

                  !hasCurrentRevision ||

                  !(claimRefs[note.id] || '').trim() ||

                  overrideReason.trim().length === 0

                }

              >

                Override & convert

              </Button>

            </div>

          )}



          <form action={flagAction} className="flex gap-1.5">

            <input type="hidden" name="noteId" value={note.id} />

            <input type="hidden" name="expectedNoteUpdatedAt" value={expectedNoteUpdatedAt} />

            <input

              type="hidden"

              name="expectedSubmissionFingerprint"

              value={expectedSubmissionFingerprint}

            />

            <input

              type="text"

              name="description"

              placeholder="Flag chart error…"

              className="min-w-0 flex-1 rounded-lg border border-rose-500/20 bg-rose-950/20 px-2.5 py-1.5 text-[11px] text-white placeholder:text-zinc-600 focus:border-rose-500/40 focus:outline-none"

              required

            />

            <Button

              type="submit"

              size="sm"

              variant="outline"

              className="cursor-pointer rounded-lg border-rose-500/30 px-2 text-[10px] text-rose-400 hover:bg-rose-500/10 disabled:cursor-not-allowed"

              isLoading={isFlagging}

              disabled={!hasCurrentRevision || isFlagging}

            >

              <AlertTriangle className="mr-0.5 h-3 w-3" /> Flag

            </Button>

          </form>

        </div>

      )}



      {mode === 'awaiting' && client?.id && (

        <div className="border-t border-white/5 px-3.5 py-2">

          <Link

            href={`/client/${client.id}`}

            className="inline-flex cursor-pointer items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 transition-colors hover:text-amber-300"

          >

            Session Claims

            <ArrowRight className="h-3 w-3" />

          </Link>

        </div>

      )}

    </Card>

  );

}



export default function NotesPipelineClient({

  awaitingBcba = [],

  readyForPlutus = [],

  converted = [],

  queueCounts,

  authUnitStatusByNoteId = {},

  scrubStatusByNoteId = {},

  convertBlockersByNoteId = {},

  canConvert = true,

  showExportCsv = true,

  onPipelineMutated,

}: {

  awaitingBcba?: PipelineNote[];

  readyForPlutus?: PipelineNote[];

  converted?: PipelineNote[];

  queueCounts: { awaiting: number; ready: number; converted: number };

  authUnitStatusByNoteId?: Record<string, AuthUnitHardStop>;

  scrubStatusByNoteId?: Record<string, ClaimScrubResult>;

  convertBlockersByNoteId?: Record<string, string[]>;

  /** When false, convert / export actions are hidden (e.g. read-only leadership preview). */

  canConvert?: boolean;

  /** Hide global CSV export (e.g. client-scoped profile panel). */

  showExportCsv?: boolean;

  /** Called after convert or deficiency flag so parent can reload scoped data. */

  onPipelineMutated?: () => void;

}) {

  const router = useRouter();

  const [query, setQuery] = useState('');

  const [isConverting, startTransition] = useTransition();

  const [isExporting, startExport] = useTransition();

  const [convertingId, setConvertingId] = useState<string | null>(null);

  const [claimRefs, setClaimRefs] = useState<Record<string, string>>({});

  const [overridePrompts, setOverridePrompts] = useState<Record<string, OverridePrompt>>({});

  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});

  const [flagState, flagAction, isFlagging] = useActionState<FlagActionState, FormData>(

    flagDeficiency,

    flagInitialState,

  );



  React.useEffect(() => {

    if (flagState?.success) {

      toast.success('Deficiency flagged — signatures cleared for correction.');

      onPipelineMutated?.();

      router.refresh();

    } else if (flagState?.error) {

      toast.error(flagState.error);

    }

  }, [flagState, router, onPipelineMutated]);



  const filteredAwaiting = useMemo(

    () => filterNotesByQuery(awaitingBcba, query),

    [awaitingBcba, query],

  );

  const filteredReady = useMemo(

    () => filterNotesByQuery(readyForPlutus, query),

    [readyForPlutus, query],

  );

  const filteredConverted = useMemo(

    () => filterNotesByQuery(converted, query),

    [converted, query],

  );



  const laneCount = (mode: QueueMode, filtered: PipelineNote[]) => {

    if (query.trim()) return filtered.length;

    if (mode === 'awaiting') return queueCounts.awaiting;

    if (mode === 'ready') return queueCounts.ready;

    return queueCounts.converted;

  };



  const runConvert = (noteId: string, override: boolean) => {

    const note = readyForPlutus.find((candidate) => candidate.id === noteId);

    const expectedSubmissionFingerprint = extractSubmissionFingerprint(note?.structuredContent);

    const expectedNoteUpdatedAt = note?.updatedAt ? new Date(note.updatedAt).toISOString() : null;

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

            ? 'Already marked as claim filed.'

            : 'authUnitOverridden' in res && res.authUnitOverridden

              ? 'Converted past the auth-unit stop — override recorded in the audit vault.'

              : 'Claim filed (manual tracker).',

        );

        if ('credentialWarnings' in res && res.credentialWarnings?.length) {

          toast.warning('Credential check — converted, but review before claims', {

            description: res.credentialWarnings.join(' · '),

            duration: 10000,

          });

        }

        router.refresh();

        onPipelineMutated?.();

      } else if ('error' in res && res.error) {

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



  const downloadPlutusCsv = () => {

    startExport(async () => {

      const result = await exportPlutusHandoffCsv();

      if (!result.success) {

        toast.error(result.error);

        return;

      }

      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });

      const anchor = document.createElement('a');

      anchor.href = URL.createObjectURL(blob);

      anchor.download = result.filename;

      document.body.appendChild(anchor);

      anchor.click();

      toast.success(`Exported ${result.rowCount} converted note(s) for claims filing.`);

    });

  };



  const renderLaneNotes = (notes: PipelineNote[], mode: QueueMode) =>

    notes.map((note) => (

      <NoteCard

        key={note.id}

        note={note}

        mode={mode}

        onConvert={handleConvert}

        onOverrideConvert={handleOverrideConvert}

        overridePrompt={overridePrompts[note.id]}

        overrideReason={overrideReasons[note.id] || ''}

        setOverrideReason={setOverrideReason}

        authUnitStatus={authUnitStatusByNoteId[note.id]}

        scrubStatus={scrubStatusByNoteId[note.id]}

        convertBlockers={convertBlockersByNoteId[note.id]}

        isConverting={isConverting}

        convertingId={convertingId}

        claimRefs={claimRefs}

        setClaimRef={setClaimRef}

        flagAction={flagAction}

        isFlagging={isFlagging}

        canConvert={canConvert}

      />

    ));



  return (

    <div className="space-y-3 pb-2">

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

        <QueueSearchInput

          value={query}

          onChange={setQuery}

          placeholder="Search by client or staff name…"

        />

        {canConvert && showExportCsv && (

          <button

            type="button"

            onClick={downloadPlutusCsv}

            disabled={isExporting}

            className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"

          >

            {isExporting ? (

              <Loader2 className="h-3.5 w-3.5 animate-spin" />

            ) : (

              <Download className="h-3.5 w-3.5" />

            )}

            Export claims CSV

          </button>

        )}

      </div>



      {query.trim() &&

        filteredAwaiting.length + filteredReady.length + filteredConverted.length === 0 && (

          <p className="text-xs text-zinc-500">No notes match “{query.trim()}”.</p>

        )}



      <QueueBoard

        columns={[

          <QueueLane

            key="awaiting"

            eyebrow="Clinical gate"

            title="Awaiting BCBA"

            count={laneCount('awaiting', filteredAwaiting)}

            icon={Clock}

            accentClass="text-amber-400"

            borderClass="border-amber-500/20"

          >

            {filteredAwaiting.length > 0 ? (

              renderLaneNotes(filteredAwaiting, 'awaiting')

            ) : (

              <EmptyColumn message="No RBT-signed notes awaiting BCBA co-sign — new Studio submits land here." />

            )}

          </QueueLane>,

          <QueueLane

            key="ready"

            eyebrow="Billing claims"

            title="Ready to Bill"

            count={laneCount('ready', filteredReady)}

            icon={Send}

            accentClass="text-brand-orange-400"

            borderClass="border-brand-orange-500/20"

          >

            {filteredReady.length > 0 ? (

              renderLaneNotes(filteredReady, 'ready')

            ) : (

              <EmptyColumn message="No BCBA-signed notes ready to bill — e-sign in the BCBA queue to fill this lane." />

            )}

          </QueueLane>,

          <QueueLane

            key="converted"

            eyebrow="Manual tracker"

            title="Claim Filed"

            count={laneCount('converted', filteredConverted)}

            icon={CheckCircle2}

            accentClass="text-emerald-400"

            borderClass="border-emerald-500/20"

          >

            {filteredConverted.length > 0 ? (

              renderLaneNotes(filteredConverted, 'converted')

            ) : (

              <EmptyColumn message="No claims filed yet — use “Mark claim filed” on a ready note." />

            )}

          </QueueLane>,

        ]}

      />

    </div>

  );

}
