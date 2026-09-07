'use client';

import React, { useState, useTransition } from 'react';
import { extractSubmissionFingerprint } from '@repo/db/session-note-attestation';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  PenTool,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Calendar,
  Search,
  LineChart,
  ArrowRight,
  Send,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
  signSessionNotesAsBcba,
  signSingleSessionNoteAsBcba,
  type BcbaSignExpectation,
} from '@/app/actions/sessionNoteSignActions';
import {
  summarizeSessionNoteForQueue,
  type NoteModalityCounts,
} from '@/lib/sessionNoteSummary';
import {
  summarizeSupervisionServiceRecords,
  type SupervisionServiceRecord,
} from './supervisionServiceSummary';

type DateValue = Date | string | number;
type PersonRef = {
  firstName: string;
  lastName: string;
};
type ClientRef = PersonRef & {
  id: string;
};
type WorkstationSession = {
  client?: ClientRef | null;
  rbt?: PersonRef | null;
  cptCode?: string | null;
  scheduledStart?: DateValue | null;
  location?: string | null;
};
type WorkstationSessionNote = {
  id: string;
  bcbaSigned: boolean;
  rbtSigned: boolean;
  createdAt: DateValue;
  updatedAt: DateValue;
  structuredContent?: unknown;
  clinicalContent?: string | null;
  session?: WorkstationSession | null;
};
type WorkstationDeficiency = {
  id: string;
  description: string;
  note?: {
    session?: WorkstationSession | null;
  } | null;
};
type WorkstationClient = ClientRef & {
  insurancePayer?: string | null;
  sessions?: readonly SupervisionServiceRecord[];
};

type WorkstationTab = 'esign' | 'supervision' | 'deficiencies';

interface BcbaDailyWorkstationProps {
  sessionNotes: WorkstationSessionNote[];
  deficiencies: WorkstationDeficiency[];
  clients: WorkstationClient[];
  initialTab?: WorkstationTab;
}

type SignedClientRef = { id: string; name: string };
const supervisionAvailability = summarizeSupervisionServiceRecords([], null);

function clientChartProgressHref(clientId: string) {
  return `/client/${clientId}?mode=bcba&tab=chart_progress`;
}

function clientEmrHref(clientId: string) {
  return `/client/${clientId}?mode=bcba&tab=session_emr`;
}

function formatRecordDate(value: DateValue) {
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === 'number') return new Date(value).toLocaleDateString();
  return new Date(value).toLocaleDateString();
}

function formatServiceTime(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';

  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60);
  const remainder = roundedMinutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function ModalityChips({ modality }: { modality: NoteModalityCounts | null }) {
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

export default function BcbaDailyWorkstation({
  sessionNotes,
  deficiencies,
  clients,
  initialTab = 'esign',
}: BcbaDailyWorkstationProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkstationTab>(initialTab);
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [lastSignedCount, setLastSignedCount] = useState<number | null>(null);
  const [lastSignedClients, setLastSignedClients] = useState<SignedClientRef[]>([]);

  // Durable filter — no local-only signedNoteIds (Bridge F)
  const unsignedNotes = sessionNotes.filter((n) => !n.bcbaSigned && n.rbtSigned);
  const signedTodayCount = sessionNotes.filter((n) => n.bcbaSigned).length;

  const filteredNotes = unsignedNotes.filter((n) => {
    const clientName = `${n.session?.client?.firstName || ''} ${n.session?.client?.lastName || ''}`.toLowerCase();
    const rbtName = n.session?.rbt
      ? `${n.session.rbt.firstName} ${n.session.rbt.lastName}`.toLowerCase()
      : '';
    return (
      clientName.includes(searchQuery.toLowerCase()) ||
      rbtName.includes(searchQuery.toLowerCase())
    );
  });

  const clientsFromNoteIds = (ids: string[]): SignedClientRef[] => {
    const map = new Map<string, SignedClientRef>();
    for (const id of ids) {
      const note = sessionNotes.find((n) => n.id === id);
      const c = note?.session?.client;
      if (!c?.id) continue;
      map.set(c.id, {
        id: c.id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Client',
      });
    }
    return [...map.values()];
  };

  const expectationsFromNoteIds = (ids: string[]): BcbaSignExpectation[] =>
    ids.flatMap((id) => {
      const note = sessionNotes.find((candidate) => candidate.id === id);
      const fingerprint = extractSubmissionFingerprint(note?.structuredContent);
      if (!note?.updatedAt || !fingerprint) return [];
      const updatedAt = new Date(note.updatedAt);
      if (!Number.isFinite(updatedAt.getTime())) return [];
      return [
        {
          noteId: note.id,
          expectedNoteUpdatedAt: updatedAt.toISOString(),
          expectedSubmissionFingerprint: fingerprint,
        },
      ];
    });

  const handleSelectAll = () => {
    if (selectedNotes.length === filteredNotes.length) {
      setSelectedNotes([]);
    } else {
      setSelectedNotes(filteredNotes.map((n) => n.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    if (selectedNotes.includes(id)) {
      setSelectedNotes(selectedNotes.filter((n) => n !== id));
    } else {
      setSelectedNotes([...selectedNotes, id]);
    }
  };

  const showBillingReadyToast = (count: number, signedClients: SignedClientRef[]) => {
    setLastSignedCount(count);
    setLastSignedClients(signedClients);
    const primary = signedClients[0];
    toast.success('Ready to bill', {
      description:
        count === 1
          ? 'Note is BCBA-signed and in the Ready to Bill queue. Open Chart Progress for clinical follow-up.'
          : `${count} notes are BCBA-signed and in the Ready to Bill queue.`,
      action: primary
        ? {
            label: 'Chart Progress',
            onClick: () => router.push(clientChartProgressHref(primary.id)),
          }
        : {
            label: 'Session Claims queue',
            onClick: () => router.push('/portal-billing/claims?queue=ready'),
          },
      duration: 9000,
    });
  };

  const handleBatchSign = () => {
    if (selectedNotes.length === 0) {
      toast.error('Please select at least one session note to sign.');
      return;
    }

    const ids = [...selectedNotes];
    const expectations = expectationsFromNoteIds(ids);
    if (expectations.length !== ids.length) {
      toast.error('One or more note revisions are incomplete. Reload before signing.');
      return;
    }
    const signedClients = clientsFromNoteIds(ids);
    startTransition(async () => {
      const res = await signSessionNotesAsBcba(expectations);
      if (res.success) {
        setSelectedNotes([]);
        showBillingReadyToast(res.signedCount, signedClients);
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
    const signedClients = clientsFromNoteIds([id]);
    startTransition(async () => {
      const res = await signSingleSessionNoteAsBcba(expectation);
      if (res.success) {
        showBillingReadyToast(res.signedCount, signedClients);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to e-sign note');
      }
    });
  };

  return (
    <div className="space-y-8 animate-fade-in-up">
      {/* Hero Master Workstation Banner */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 shadow-xl backdrop-blur-2xl group">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-700 dark:text-cyan-400 font-mono text-[11px] font-bold">
              <span className="dot-live"></span>
              <span>BCBA DAILY WORKSTATION &bull; BATCH E-SIGN HUB ACTIVE</span>
            </div>

            <h1 className="text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-white font-heading tracking-tight leading-tight">
              Daily Workstation{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 via-teal-500 to-brand-orange-500 dark:from-cyan-400 dark:via-teal-300 dark:to-brand-orange-300">
                &amp; E-Sign Hub
              </span>
            </h1>

            <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Review RBT session logs, batch e-sign for billing eligibility, then jump to client Chart
              Progress for day-to-day clinical follow-up.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <Link
                href="/portal-billing/claims?queue=ready"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-brand-orange-500/10 hover:bg-brand-orange-500/20 text-brand-orange-700 dark:text-brand-orange-300 font-bold text-[11px] border border-brand-orange-500/25 transition-all cursor-pointer shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Ready to Bill
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 flex-shrink-0 font-mono">
            <div className="p-3 bg-[#F9F5EC] dark:bg-zinc-900/90 rounded-2xl border border-[#E2D5B7] dark:border-white/10 text-center shadow-sm">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block">AWAITING SIGN</span>
              <span className="text-xl font-black text-slate-900 dark:text-white mt-0.5 block">{unsignedNotes.length}</span>
            </div>
            <div className="p-3 bg-[#F9F5EC] dark:bg-zinc-900/90 rounded-2xl border border-[#E2D5B7] dark:border-white/10 text-center shadow-sm">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold block">BCBA SIGNED</span>
              <span className="text-xl font-black text-slate-900 dark:text-white mt-0.5 block">{signedTodayCount}</span>
            </div>
            <div className="p-3 bg-[#F9F5EC] dark:bg-zinc-900/90 rounded-2xl border border-[#E2D5B7] dark:border-white/10 text-center shadow-sm">
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold block">DEFICIENCIES</span>
              <span className="text-xl font-black text-slate-900 dark:text-white mt-0.5 block">{deficiencies.length}</span>
            </div>
          </div>
        </div>
      </div>

      {lastSignedCount != null && lastSignedCount > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4 backdrop-blur-xl">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-emerald-800 dark:text-emerald-100/90">
                <span className="font-bold text-emerald-700 dark:text-emerald-300">Signed · Ready to Bill</span>
                {' — '}
                {lastSignedCount} note{lastSignedCount === 1 ? '' : 's'} co-signed. Open Chart
                Progress for clinical follow-up, or the Ready queue for claims handoff.
              </p>
              <Link
                href="/portal-billing/claims?queue=ready"
                className="inline-flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-xl bg-brand-orange-500/15 dark:bg-brand-orange-500/20 hover:bg-brand-orange-500/25 text-brand-orange-700 dark:text-brand-orange-300 font-bold text-xs border border-brand-orange-500/30 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Open Ready to Bill
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {lastSignedClients.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lastSignedClients.map((c) => (
                  <Link
                    key={c.id}
                    href={clientChartProgressHref(c.id)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/15 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold text-xs border border-cyan-500/30 transition-all cursor-pointer hover:scale-[1.02]"
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

      {/* Main Tabs Navigation */}
      <div className="flex gap-4 border-b border-[#E2D5B7] dark:border-white/10 pb-3 text-xs font-mono">
        <button
          type="button"
          onClick={() => setActiveTab('esign')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'esign' ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 font-bold shadow-md' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          <PenTool className="w-4 h-4" /> Batch E-Sign Hub ({unsignedNotes.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('supervision')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'supervision' ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 font-bold shadow-md' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          <Activity className="w-4 h-4" /> Supervision Evidence
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('deficiencies')}
          className={`px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer ${activeTab === 'deficiencies' ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/30 font-bold shadow-md' : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'}`}
        >
          <AlertTriangle className="w-4 h-4" /> Note Deficiency Audits ({deficiencies.length})
        </button>
      </div>

      {/* TAB 1: BATCH E-SIGN HUB */}
      {activeTab === 'esign' && (
        <div className="space-y-5">
          {/* Action Bar */}
          <Card className="p-4 bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
            <div className="flex items-center gap-3 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search client or RBT name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#F9F5EC] dark:bg-zinc-900 border border-[#E2D5B7] dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-white outline-none focus:border-cyan-500 font-sans"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className="bg-[#F9F5EC] dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold text-xs px-4 h-9 rounded-xl border border-[#E2D5B7] dark:border-white/10 transition-all cursor-pointer shadow-sm"
              >
                {selectedNotes.length === filteredNotes.length && filteredNotes.length > 0
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

          {/* Notes List */}
          <div className="space-y-3">
            {filteredNotes.map((note) => {
              const summary = summarizeSessionNoteForQueue(
                note.structuredContent,
                note.clinicalContent
              );
              const clientId = note.session?.client?.id as string | undefined;
              const preview = summary.preview || note.clinicalContent;

              return (
                <Card
                  key={note.id}
                  className="p-5 bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 hover:border-cyan-500/40 hover:scale-[1.01] hover:shadow-xl shadow-md rounded-2xl transition-all duration-300 space-y-3"
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={selectedNotes.includes(note.id)}
                      onChange={() => handleToggleSelect(note.id)}
                      className="mt-1 w-4 h-4 rounded border-[#E2D5B7] dark:border-white/20 bg-white dark:bg-zinc-900 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                    />

                    <div className="flex-1 space-y-2 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <h4 className="font-bold text-slate-900 dark:text-white text-base font-heading">
                            {note.session?.client?.firstName} {note.session?.client?.lastName}
                          </h4>
                          <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border border-cyan-500/20">
                            CPT {note.session?.cptCode || '97153'}
                          </span>
                        </div>

                        <div className="text-xs font-mono text-slate-500 dark:text-zinc-400 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                          <span>
                            {formatRecordDate(note.session?.scheduledStart ?? note.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-zinc-400 font-sans">
                        <p>
                          RBT:{' '}
                          <span className="text-slate-900 dark:text-white font-medium">
                            {note.session?.rbt
                              ? `${note.session.rbt.firstName} ${note.session.rbt.lastName}`
                              : 'Assigned RBT'}
                          </span>
                        </p>
                        <p>
                          Location:{' '}
                          <span className="text-slate-900 dark:text-white font-medium">
                            {note.session?.location || 'Home / Clinic'}
                          </span>
                        </p>
                      </div>

                      {(summary.goalsAddressed || summary.objectiveData) && (
                        <div className="flex flex-wrap gap-1.5">
                          {summary.goalsAddressed && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 max-w-full truncate">
                              Goals · {summary.goalsAddressed}
                            </span>
                          )}
                          {summary.objectiveData && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 max-w-full truncate">
                              Obj · {summary.objectiveData.slice(0, 80)}
                              {summary.objectiveData.length > 80 ? '…' : ''}
                            </span>
                          )}
                        </div>
                      )}

                      <ModalityChips modality={summary.modalityCounts} />

                      {preview && (
                        <div className="p-3 bg-[#F9F5EC] dark:bg-zinc-900/60 rounded-xl border border-[#E2D5B7]/60 dark:border-white/5 text-xs text-slate-700 dark:text-zinc-300 font-sans leading-relaxed">
                          <span className="font-bold text-slate-800 dark:text-zinc-400 block mb-1">
                            Clinical summary
                          </span>
                          {preview}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#E2D5B7]/60 dark:border-white/5">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                          <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                            RBT Signed ✅
                          </span>
                          <span className="text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                            BCBA Signature Pending ✍️
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {clientId && (
                            <>
                              <Link
                                href={clientChartProgressHref(clientId)}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/15 hover:bg-cyan-500/20 dark:hover:bg-cyan-500/25 text-cyan-700 dark:text-cyan-300 font-bold text-xs border border-cyan-500/25 hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                <LineChart className="w-3.5 h-3.5" /> Chart Progress
                                <ArrowRight className="w-3.5 h-3.5" />
                              </Link>
                              <Link
                                href={clientEmrHref(clientId)}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#F9F5EC] dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-bold text-xs border border-[#E2D5B7] dark:border-white/10 transition-all cursor-pointer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Session EMR
                              </Link>
                            </>
                          )}
                          <Button
                            onClick={() => handleSignSingle(note.id)}
                            disabled={isPending}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-4 rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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

            {filteredNotes.length === 0 && (
              <div className="p-12 text-center border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-3xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                  {unsignedNotes.length === 0 ? (
                    <ShieldCheck className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
                  ) : (
                    <Search className="h-6 w-6 text-slate-400 dark:text-zinc-500" />
                  )}
                </div>
                <p className="text-sm font-heading font-semibold text-slate-900 dark:text-white">
                  {unsignedNotes.length === 0 ? 'E-sign queue clear' : 'No notes match your search'}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500 max-w-md mx-auto">
                  {unsignedNotes.length === 0
                    ? 'No RBT-signed session notes are awaiting BCBA sign-off. New submits land here after RBT Studio sign.'
                    : `Nothing matches “${searchQuery}” — ${unsignedNotes.length} note${
                        unsignedNotes.length === 1 ? ' is' : 's are'
                      } still awaiting sign.`}
                </p>
                {unsignedNotes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-700 dark:text-cyan-300 transition-all hover:bg-cyan-500/20"
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SUPERVISION EVIDENCE */}
      {activeTab === 'supervision' && (
        <div className="space-y-6">
          <Card className="p-6 bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 rounded-3xl space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-heading">
              Supervision Evidence Readiness
            </h3>
            <p className="max-w-3xl text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
              Operational service-record context only. A compliance determination requires a
              resolved, versioned policy and direct supervisor-presence evidence; neither is
              available in the current data model.
            </p>

            <div
              role="status"
              aria-live="polite"
              className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-4"
            >
              <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
              <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                      Assessment unavailable
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
                      CPT codes, BCBA assignment, note signatures, and planned hours are not proof
                      of supervisor attendance. CPT 97155 is a protocol-modification service code.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 font-mono text-[10px] font-bold">
                  <span className="rounded-full border border-slate-400/20 bg-slate-400/10 px-3 py-1 text-slate-700 dark:text-zinc-300">
                    {supervisionAvailability.assessmentLabel}
                  </span>
                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-300">
                    {supervisionAvailability.policyLabel}
                  </span>
                  <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-violet-700 dark:text-violet-300">
                    {supervisionAvailability.evidenceLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {clients.map((client) => {
                const summary = summarizeSupervisionServiceRecords(
                  client.sessions,
                  client.insurancePayer
                );

                return (
                  <div
                    key={client.id}
                    className="group relative overflow-hidden rounded-2xl border border-[#E2D5B7] dark:border-white/5 bg-[#F9F5EC] dark:bg-zinc-900/50 p-4 transition-all duration-300 hover:scale-[1.01] hover:border-cyan-500/30 hover:shadow-xl shadow-sm"
                  >
                    <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-cyan-500/[0.04] blur-3xl pointer-events-none" />
                    <div className="relative z-10 space-y-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="font-heading text-sm font-bold text-slate-900 dark:text-white">
                            {client.firstName} {client.lastName}
                          </h4>
                          <p className="mt-1 text-xs text-slate-600 dark:text-zinc-400">
                            Payer: <span className="text-slate-800 dark:text-zinc-300 font-medium">{summary.payerLabel}</span>
                          </p>
                        </div>
                        <span
                          aria-label="Supervision assessment not available"
                          className="w-fit rounded-full border border-slate-400/20 bg-slate-400/10 px-3 py-1 font-mono text-[10px] font-bold text-slate-700 dark:text-zinc-300"
                        >
                          ASSESSMENT {summary.assessmentLabel}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#FFFDF8] dark:bg-zinc-950/60 p-3 shadow-sm">
                          <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                            Potential records
                          </span>
                          <span className="mt-1 block font-heading text-lg font-black text-slate-900 dark:text-white">
                            {summary.potentialServiceRecordCount}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-zinc-600">
                            97153 / 97155 coded
                          </span>
                        </div>
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-3 shadow-sm">
                          <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300/70">
                            97153 service time
                          </span>
                          <span className="mt-1 block font-heading text-lg font-black text-cyan-700 dark:text-cyan-300">
                            {formatServiceTime(summary.service97153.actualServiceMinutes)}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-zinc-600">
                            Completed + actual time
                          </span>
                        </div>
                        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-3 shadow-sm">
                          <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300/70">
                            97155 service-code time
                          </span>
                          <span className="mt-1 block font-heading text-lg font-black text-violet-700 dark:text-violet-300">
                            {formatServiceTime(summary.service97155.actualServiceMinutes)}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-zinc-600">
                            Not attendance proof
                          </span>
                        </div>
                        <div className="rounded-xl border border-[#E2D5B7] dark:border-white/5 bg-[#FFFDF8] dark:bg-zinc-950/60 p-3 shadow-sm">
                          <span className="block font-mono text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-500">
                            Actual-time coverage
                          </span>
                          <span className="mt-1 block font-heading text-lg font-black text-slate-900 dark:text-white">
                            {summary.completedRecordsWithActualTime}/
                            {summary.completedServiceRecordCount}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-zinc-600">
                            Completed coded records
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 border-t border-[#E2D5B7]/60 dark:border-white/5 pt-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-[11px] text-violet-700 dark:text-violet-300">
                            {summary.evidenceLabel}
                          </p>
                          {summary.completedRecordsMissingActualTime > 0 && (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300">
                              {summary.completedRecordsMissingActualTime} completed service record
                              {summary.completedRecordsMissingActualTime === 1 ? '' : 's'} omitted
                              from time totals: valid actual timestamps unavailable.
                            </p>
                          )}
                        </div>
                        <Link
                          href={clientChartProgressHref(client.id)}
                          className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 font-mono text-[10px] font-bold text-cyan-700 dark:text-cyan-300 transition-all hover:border-cyan-500/40 hover:bg-cyan-500/20 shadow-sm"
                        >
                          <LineChart className="h-3.5 w-3.5" aria-hidden="true" /> Chart Progress
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}

              {clients.length === 0 && (
                <div className="p-10 text-center border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
                    <Activity className="h-5 w-5 text-cyan-600 dark:text-cyan-400/70" />
                  </div>
                  <p className="text-sm font-heading font-semibold text-slate-900 dark:text-white">
                    No clients in review scope
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-zinc-500 max-w-md mx-auto">
                    Client-level service context appears here when active caseload records are
                    available. Policy and supervisor-presence evidence remain separate requirements.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: DEFICIENCY AUDITS */}
      {activeTab === 'deficiencies' && (
        <div className="space-y-4">
          <Card className="p-6 bg-[#FFFDF8] dark:bg-zinc-950/80 border border-[#E2D5B7] dark:border-white/10 rounded-3xl space-y-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-heading">
              Flagged Note Deficiency Audits
            </h3>
            <p className="text-xs text-slate-600 dark:text-zinc-400">
              Active notes flagged for clinical errors, missing signatures, or data gaps returned to
              RBTs.
            </p>

            <div className="space-y-3">
              {deficiencies.map((def) => {
                const clientId = def.note?.session?.client?.id as string | undefined;
                return (
                  <div
                    key={def.id}
                    className="p-4 bg-[#F9F5EC] dark:bg-zinc-900/50 border border-rose-500/20 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm"
                  >
                    <div className="space-y-1">
                      <h4 className="font-bold text-rose-600 dark:text-rose-400 text-sm">
                        {def.note?.session?.client?.firstName}{' '}
                        {def.note?.session?.client?.lastName}
                      </h4>
                      <p className="text-xs text-slate-700 dark:text-zinc-300 font-sans">&quot;{def.description}&quot;</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-mono text-xs">
                        Pending RBT Fix
                      </Badge>
                      {clientId && (
                        <Link
                          href={clientChartProgressHref(clientId)}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold text-xs border border-cyan-500/20 transition-all cursor-pointer shadow-sm"
                        >
                          <LineChart className="w-3.5 h-3.5" /> Chart Progress
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}

              {deficiencies.length === 0 && (
                <div className="p-8 text-center border border-dashed border-[#E2D5B7] dark:border-white/10 rounded-2xl bg-[#FFFDF8]/90 dark:bg-zinc-950/40 shadow-sm">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                    <ShieldCheck className="h-4 w-4 text-emerald-500 dark:text-emerald-400/80" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">No open deficiencies</p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-500">
                    Notes flagged for clinical errors or data gaps appear here until the RBT fixes
                    them.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
