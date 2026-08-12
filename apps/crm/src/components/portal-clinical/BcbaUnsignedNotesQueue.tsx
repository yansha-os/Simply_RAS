'use client';

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  PenTool,
  ShieldCheck,
  FileSignature,
  ArrowRight,
  Calendar,
  MapPin,
  User,
  Search,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Send,
  LineChart,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  signSessionNotesAsBcba,
  signSingleSessionNoteAsBcba,
  type BcbaSignExpectation,
} from '@/app/actions/sessionNoteSignActions';
import type { BcbaUnsignedNoteItem } from '@/app/actions/bcbaNoteQueueActions';

function clientEmrHref(clientId: string) {
  return `/client/${clientId}?mode=bcba&tab=session_emr`;
}

function clientChartProgressHref(clientId: string) {
  return `/client/${clientId}?mode=bcba&tab=chart_progress`;
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function daysWaiting(iso: string | null | undefined) {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

type SignedClientRef = { id: string; name: string };

function ModalityChips({
  modality,
}: {
  modality: BcbaUnsignedNoteItem['modalityCounts'];
}) {
  if (
    !modality ||
    !(
      modality.trials > 0 ||
      modality.frequency > 0 ||
      modality.duration > 0 ||
      modality.probes > 0 ||
      modality.abc > 0 ||
      modality.taskAnalysis > 0
    )
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {modality.trials > 0 && (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-300 border border-orange-500/20">
          {modality.trials} trials
        </span>
      )}
      {modality.frequency > 0 && (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-300 border border-violet-500/20">
          {modality.frequency} freq
        </span>
      )}
      {modality.duration > 0 && (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20">
          {modality.duration} duration
        </span>
      )}
      {modality.probes > 0 && (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
          {modality.probes} probes
        </span>
      )}
      {modality.abc > 0 && (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">
          {modality.abc} ABC
        </span>
      )}
      {modality.taskAnalysis > 0 && (
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
          {modality.taskAnalysis} TA
        </span>
      )}
    </div>
  );
}

export default function BcbaUnsignedNotesQueue({
  notes,
  viewerRole,
  scopedToBcbaId,
}: {
  notes: BcbaUnsignedNoteItem[];
  viewerRole?: string;
  scopedToBcbaId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [lastSignedCount, setLastSignedCount] = useState<number | null>(null);
  const [lastSignedClients, setLastSignedClients] = useState<SignedClientRef[]>([]);

  const showPlutusReadyToast = (count: number, clients: SignedClientRef[]) => {
    setLastSignedCount(count);
    setLastSignedClients(clients);
    const primary = clients[0];
    toast.success('Ready for Plutus tracker', {
      description:
        count === 1
          ? 'Note is BCBA-signed and in the Ready for Plutus queue. Open Chart Progress for day-to-day clinical follow-up.'
          : `${count} notes are BCBA-signed and in the Ready for Plutus queue.`,
      action: primary
        ? {
            label: 'Chart Progress',
            onClick: () => router.push(clientChartProgressHref(primary.id)),
          }
        : {
            label: 'Open /notes',
            onClick: () => router.push('/notes?queue=ready'),
          },
      duration: 9000,
    });
  };

  const clientsFromNoteIds = (ids: string[]): SignedClientRef[] => {
    const map = new Map<string, SignedClientRef>();
    for (const id of ids) {
      const note = notes.find((n) => n.id === id);
      if (!note) continue;
      const c = note.session.client;
      map.set(c.id, { id: c.id, name: `${c.firstName} ${c.lastName}` });
    }
    return [...map.values()];
  };

  const expectationsFromNoteIds = (ids: string[]): BcbaSignExpectation[] =>
    ids.flatMap((id) => {
      const note = notes.find((candidate) => candidate.id === id);
      if (!note?.updatedAt || !note.submissionFingerprint) return [];
      return [
        {
          noteId: note.id,
          expectedNoteUpdatedAt: note.updatedAt,
          expectedSubmissionFingerprint: note.submissionFingerprint,
        },
      ];
    });

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const client = `${n.session.client.firstName} ${n.session.client.lastName}`.toLowerCase();
      const rbt = n.session.rbt
        ? `${n.session.rbt.firstName} ${n.session.rbt.lastName}`.toLowerCase()
        : '';
      return client.includes(q) || rbt.includes(q) || n.id.toLowerCase().includes(q);
    });
  }, [notes, searchQuery]);

  const oldestDays = useMemo(() => {
    if (notes.length === 0) return 0;
    return Math.max(...notes.map((n) => daysWaiting(n.rbtSignedAt || n.createdAt)));
  }, [notes]);

  const handleSelectAll = () => {
    if (selectedNotes.length === filtered.length) {
      setSelectedNotes([]);
    } else {
      setSelectedNotes(filtered.map((n) => n.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedNotes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBatchSign = () => {
    if (selectedNotes.length === 0) {
      toast.error('Select at least one note to e-sign.');
      return;
    }
    const ids = [...selectedNotes];
    const expectations = expectationsFromNoteIds(ids);
    if (expectations.length !== ids.length) {
      toast.error('One or more note revisions are incomplete. Reload before signing.');
      return;
    }
    const clients = clientsFromNoteIds(ids);
    startTransition(async () => {
      const res = await signSessionNotesAsBcba(expectations);
      if (res.success) {
        setSelectedNotes([]);
        showPlutusReadyToast(res.signedCount, clients);
        if (res.credentialWarnings?.length) {
          toast.warning('Credential check — signed, but review before claims', {
            description: res.credentialWarnings.join(' · '),
            duration: 10000,
          });
        }
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to e-sign notes');
      }
    });
  };

  const handleSignSingle = (id: string) => {
    const expectation = expectationsFromNoteIds([id])[0];
    if (!expectation) {
      toast.error('This note revision is incomplete. Reload before signing.');
      return;
    }
    const clients = clientsFromNoteIds([id]);
    startTransition(async () => {
      const res = await signSingleSessionNoteAsBcba(expectation);
      if (res.success) {
        showPlutusReadyToast(res.signedCount, clients);
        if (res.credentialWarnings?.length) {
          toast.warning('Credential check — signed, but review before claims', {
            description: res.credentialWarnings.join(' · '),
            duration: 10000,
          });
        }
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to e-sign note');
      }
    });
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Hero */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-zinc-950/80 border border-white/10 shadow-2xl backdrop-blur-2xl">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 font-mono text-[11px] font-bold">
              <span className="dot-live" />
              <span>BCBA CO-SIGN QUEUE · RBT SIGNED · AWAITING SUPERVISOR</span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold text-white font-heading tracking-tight leading-tight">
              Unsigned Session{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-300 to-brand-orange-300">
                Notes
              </span>
            </h1>

            <p className="text-sm text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Review RBT-signed notes, e-sign for Plutus eligibility, then open Chart Progress on the
              client profile for day-to-day clinical follow-up.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-zinc-500">
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900/80 border border-white/10">
                Role · {viewerRole || 'BCBA'}
              </span>
              {scopedToBcbaId ? (
                <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  Scoped to your caseload
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300">
                  Agency-wide view
                </span>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                E-sign → Plutus · Chart Progress
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 flex-shrink-0 font-mono">
            <div className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center">
              <span className="text-[10px] text-amber-400 font-bold block">AWAITING</span>
              <span className="text-xl font-black text-white mt-0.5 block">{notes.length}</span>
            </div>
            <div className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center">
              <span className="text-[10px] text-rose-400 font-bold block">OLDEST (D)</span>
              <span className="text-xl font-black text-white mt-0.5 block">{oldestDays}</span>
            </div>
            <div className="p-3 bg-zinc-900/90 rounded-2xl border border-white/10 text-center">
              <span className="text-[10px] text-cyan-400 font-bold block">FILTERED</span>
              <span className="text-xl font-black text-white mt-0.5 block">{filtered.length}</span>
            </div>
          </div>
        </div>
      </div>

      {lastSignedCount != null && lastSignedCount > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4 backdrop-blur-xl">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-brand-orange-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-emerald-100/90">
                <span className="font-bold text-emerald-300">Signed · Ready for Plutus</span>
                {' — '}
                {lastSignedCount} note{lastSignedCount === 1 ? '' : 's'} co-signed. Continue on Chart
                Progress, or open the Ready queue for claims handoff.
              </p>
              <Link
                href="/notes?queue=ready"
                className="inline-flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-xl bg-brand-orange-500/20 hover:bg-brand-orange-500/30 text-brand-orange-300 font-bold text-xs border border-brand-orange-500/30 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Open Ready for Plutus
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {lastSignedClients.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lastSignedClients.map((c) => (
                  <Link
                    key={c.id}
                    href={clientChartProgressHref(c.id)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-bold text-xs border border-cyan-500/30 transition-all cursor-pointer hover:scale-[1.02]"
                  >
                    <LineChart className="w-3.5 h-3.5" />
                    Chart Progress · {c.name}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action bar */}
      <Card className="p-4 bg-zinc-950/80 border border-white/10 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 backdrop-blur-xl">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search client, RBT, or note id…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white outline-none focus:border-amber-500/60 font-sans"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/notes?queue=ready"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs border border-white/10 transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" /> Plutus tracker
          </Link>

          <Link
            href="/portal-clinical/daily"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs border border-white/10 transition-all cursor-pointer"
          >
            <PenTool className="w-3.5 h-3.5" /> Daily Workstation
          </Link>

          <button
            type="button"
            onClick={handleSelectAll}
            className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs px-4 h-9 rounded-xl border border-white/10 transition-all cursor-pointer"
          >
            {selectedNotes.length === filtered.length && filtered.length > 0
              ? 'Deselect All'
              : 'Select All'}
          </button>

          <Button
            onClick={handleBatchSign}
            disabled={selectedNotes.length === 0 || isPending}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 text-white font-bold text-xs px-5 h-9 rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck className="w-4 h-4" /> Batch E-Sign ({selectedNotes.length})
          </Button>
        </div>
      </Card>

      {/* Queue list */}
      <div className="space-y-3">
        {filtered.map((note) => {
          const waitDays = daysWaiting(note.rbtSignedAt || note.createdAt);
          const stale = waitDays >= 3;
          const preview = note.summaryPreview || note.clinicalContent;
          const modality = note.modalityCounts;
          const clientId = note.session.client.id;

          return (
            <Card
              key={note.id}
              className="p-5 bg-zinc-950/80 border border-white/10 hover:border-brand-orange-500/40 hover:scale-[1.01] hover:shadow-2xl rounded-2xl transition-all duration-300 backdrop-blur-xl"
            >
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  checked={selectedNotes.includes(note.id)}
                  onChange={() => handleToggleSelect(note.id)}
                  className="mt-1.5 w-4 h-4 rounded border-white/20 bg-zinc-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  aria-label={`Select note ${note.id}`}
                />

                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading font-bold text-white text-base">
                          {note.session.client.firstName} {note.session.client.lastName}
                        </h3>
                        <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          CPT {note.session.cptCode || '97153'}
                        </span>
                        {stale && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" /> {waitDays}d waiting
                          </span>
                        )}
                        {note.checklistPassed === true && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Checklist OK
                          </span>
                        )}
                        {note.checklistPassed === false && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Checklist flags
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-zinc-500 truncate">
                        Note · {note.id}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{formatWhen(note.session.scheduledStart)}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-zinc-400 font-sans">
                    <p className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-zinc-500" />
                      RBT:{' '}
                      <span className="text-white font-medium">
                        {note.session.rbt
                          ? `${note.session.rbt.firstName} ${note.session.rbt.lastName}`
                          : note.rbtSignerName || 'Unassigned'}
                      </span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="text-white font-medium truncate">
                        {note.session.placeOfServiceCode
                          ? `POS ${note.session.placeOfServiceCode}`
                          : note.session.location || 'Home / Clinic'}
                      </span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-500" />
                      RBT signed:{' '}
                      <span className="text-white font-medium">
                        {formatWhen(note.rbtSignedAt || note.createdAt)}
                      </span>
                    </p>
                  </div>

                  {(note.goalsAddressed || note.objectiveData || (note.interventions?.length ?? 0) > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {note.goalsAddressed && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-300 border border-teal-500/20 max-w-full truncate">
                          Goals · {note.goalsAddressed}
                        </span>
                      )}
                      {note.objectiveData && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 max-w-full truncate">
                          Obj · {note.objectiveData.slice(0, 80)}
                          {note.objectiveData.length > 80 ? '…' : ''}
                        </span>
                      )}
                      {(note.interventions?.length ?? 0) > 0 && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-300 border border-orange-500/20 max-w-full truncate">
                          Protocols · {note.interventions!.slice(0, 2).join(', ')}
                          {note.interventions!.length > 2 ? '…' : ''}
                        </span>
                      )}
                    </div>
                  )}

                  <ModalityChips modality={modality} />

                  {preview && (
                    <div className="p-3 bg-zinc-900/60 rounded-xl border border-white/5 text-xs text-zinc-300 font-sans leading-relaxed">
                      <span className="font-bold text-zinc-400 block mb-1">Clinical preview</span>
                      {preview}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/5">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                      <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                        RBT Signed
                      </span>
                      <span className="text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                        <span className="dot-live" /> BCBA Pending
                      </span>
                      {typeof note.billableUnits === 'number' && (
                        <span className="text-zinc-400 bg-zinc-900 border border-white/10 px-2 py-0.5 rounded-md">
                          {note.billableUnits} units
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={clientChartProgressHref(clientId)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 font-bold text-xs border border-cyan-500/25 hover:border-cyan-500/50 transition-all cursor-pointer"
                      >
                        <LineChart className="w-3.5 h-3.5" /> Chart Progress
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>

                      <Link
                        href={clientEmrHref(clientId)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs border border-white/10 hover:border-white/20 transition-all cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Session EMR
                      </Link>

                      <Button
                        onClick={() => handleSignSingle(note.id)}
                        disabled={isPending}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-4 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 mr-1" /> E-Sign Note
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {filtered.length === 0 && notes.length > 0 && (
          <div className="p-14 text-center rounded-3xl border border-dashed border-white/10 bg-zinc-950/40">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-zinc-900/80 border border-white/10 flex items-center justify-center mb-4">
              <Search className="w-6 h-6 text-zinc-500" />
            </div>
            <p className="text-sm font-heading font-semibold text-white mb-1">
              No notes match your search
            </p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              Nothing matches “{searchQuery}” — {notes.length} note{notes.length === 1 ? ' is' : 's are'} still
              awaiting BCBA co-sign.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-300 transition-all hover:bg-amber-500/20"
            >
              Clear search
            </button>
          </div>
        )}

        {notes.length === 0 && (
          <div className="p-14 text-center rounded-3xl border border-dashed border-white/10 bg-zinc-950/40">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <FileSignature className="w-6 h-6 text-emerald-400" />
            </div>
            <p className="text-sm font-heading font-semibold text-white mb-1">
              Queue clear
            </p>
            <p className="text-xs text-zinc-500 max-w-md mx-auto">
              No session notes with RBT signed and BCBA unsigned
              {scopedToBcbaId ? ' on your caseload' : ''}. New submits land here after RBT Studio
              sign-off.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
              <Link
                href="/portal-clinical/daily"
                className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5" /> Open Daily Workstation
              </Link>
              <Link
                href="/notes?queue=ready"
                className="inline-flex items-center gap-2 text-xs font-bold text-brand-orange-300 hover:text-brand-orange-200 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Plutus Ready queue
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
