'use client';

import React, { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { exportPlutusHandoffCsv } from '@/app/(dashboard)/notes/actions';
import {
  Download,
  AlertTriangle,
  DollarSign,
  FileText,
  CheckCircle2,
  ExternalLink,
  Hash,
  Calendar,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  generateX12_837P_Payload,
  type ClaimHeaderInput,
} from '@/lib/billing/edi837Generator';
import { isDevToolsEnabled } from '@/lib/devToolsGate';
import { toast } from 'sonner';

type PlutusPerson = {
  firstName: string;
  lastName: string;
};

type PlutusClient = PlutusPerson & {
  id: string;
  memberId?: string | null;
  medicaidId?: string | null;
  insurancePayer?: string | null;
  authorizations?: Array<{ authNumber?: string | null }>;
};

type PlutusHandoffNote = {
  id: string;
  billableUnits?: number | null;
  isConverted?: boolean;
  plutusClaimRef?: string | null;
  session?: {
    actualStart?: string | Date | null;
    scheduledStart?: string | Date | null;
    actualEnd?: string | Date | null;
    scheduledEnd?: string | Date | null;
    cptCode?: string | null;
    client?: PlutusClient | null;
    bcba?: PlutusPerson | null;
    rbt?: PlutusPerson | null;
  } | null;
};

function durationMinutes(note: PlutusHandoffNote): number {
  const start = note.session?.actualStart || note.session?.scheduledStart;
  const end = note.session?.actualEnd || note.session?.scheduledEnd;
  if (!start || !end) return 0;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

/** Map a durable SessionNote → optional 837 preview header (display-only P3 stub). */
function noteToClaimInput(note: PlutusHandoffNote): ClaimHeaderInput | null {
  const client = note?.session?.client;
  if (!client) return null;

  const start = note.session?.actualStart || note.session?.scheduledStart;
  const serviceDate = start
    ? new Date(start).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const mins = durationMinutes(note);
  const units = note.billableUnits;
  const durationForLine =
    typeof units === 'number' && units > 0 ? Math.max(mins, units * 15) : mins || 60;

  const bcba = note.session?.bcba;
  const auth =
    client.authorizations?.find((authorization) => authorization.authNumber)?.authNumber ||
    undefined;

  return {
    claimId: (note.plutusClaimRef || note.id.slice(0, 8)).replace(/[^a-zA-Z0-9]/g, ''),
    patientFirstName: client.firstName,
    patientLastName: client.lastName,
    memberId: client.memberId || client.medicaidId || 'UNKNOWN',
    payerName: client.insurancePayer || 'Unknown Payer',
    renderingProviderNpi: '0000000000',
    renderingProviderName: bcba
      ? `${bcba.firstName} ${bcba.lastName}, BCBA`
      : 'Rendering BCBA',
    authNumber: auth,
    serviceDate,
    lines: [
      {
        cptCode: note.session?.cptCode || '97153',
        modifier: 'HN',
        durationMinutes: durationForLine,
        payerRules: 'MEDICAID_8_MIN',
        ratePerUnit: 18.5,
        diagnosisCode: 'F84.0',
      },
    ],
  };
}

function formatServiceDate(note: PlutusHandoffNote): string {
  const start = note.session?.actualStart || note.session?.scheduledStart;
  if (!start) return '—';
  return new Date(start).toLocaleDateString();
}

export default function PlutusHandoffQueue({
  readyNotes = [],
  convertedNotes = [],
}: {
  readyNotes?: PlutusHandoffNote[];
  convertedNotes?: PlutusHandoffNote[];
}) {
  const [filter, setFilter] = useState<'all' | 'ready' | 'converted'>('all');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showEdiPreview, setShowEdiPreview] = useState(false);
  const [isExporting, startExport] = useTransition();
  // Gap 27: EDI 837 preview is a P3 stub — dev-flagged, never shown in production.
  const ediPreviewEnabled = isDevToolsEnabled();

  const claimCandidates = useMemo(() => {
    if (filter === 'ready') return readyNotes;
    if (filter === 'converted') return convertedNotes;
    return [...readyNotes, ...convertedNotes];
  }, [readyNotes, convertedNotes, filter]);

  const selectedNote =
    claimCandidates.find((n) => n.id === selectedNoteId) ||
    (selectedNoteId
      ? [...readyNotes, ...convertedNotes].find((n) => n.id === selectedNoteId)
      : null) ||
    null;

  const claimInput = selectedNote ? noteToClaimInput(selectedNote) : null;
  const edi837Result = claimInput ? generateX12_837P_Payload(claimInput) : null;

  const downloadEdiFile = () => {
    if (!edi837Result || !claimInput) {
      toast.error('Select a SessionNote first.');
      return;
    }
    const element = document.createElement('a');
    const file = new Blob([edi837Result.rawEdiText], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `837P_PREVIEW_${claimInput.claimId}.edi`;
    document.body.appendChild(element);
    element.click();
    toast.message('Downloaded display-only 837P preview — production claims stay in Plutus.', {
      description: `${claimInput.patientFirstName} ${claimInput.patientLastName}`,
    });
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
      toast.success(`Exported ${result.rowCount} converted note(s) for Plutus filing.`);
    });
  };

  const readyCount = readyNotes.length;
  const convertedCount = convertedNotes.length;
  const totalCount = readyCount + convertedCount;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl p-6 space-y-6 shadow-2xl">
      <div className="pointer-events-none absolute -left-20 top-0 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-40 w-40 rounded-full bg-brand-orange-500/5 blur-3xl" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4 relative">
        <div>
          <h2 className="text-xl font-bold text-white font-heading flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-400" />
            Plutus handoff board
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-1 max-w-xl">
            Live BCBA-signed SessionNotes for manual Plutus tracking. No sample patients — no
            clearinghouse submission happens here; production remains the tracker above.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={downloadPlutusCsv}
            isLoading={isExporting}
            className="bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed border border-emerald-500/30"
          >
            <Download className="w-4 h-4" /> Export Plutus CSV
          </Button>
          <div className="flex bg-zinc-900/80 p-1 rounded-2xl border border-white/10 backdrop-blur-xl">
            {(
              [
                { id: 'all' as const, label: 'All', count: totalCount },
                { id: 'ready' as const, label: 'Ready', count: readyCount },
                { id: 'converted' as const, label: 'In Plutus', count: convertedCount },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilter(t.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  filter === t.id
                    ? 'bg-emerald-600/90 text-white shadow-md shadow-emerald-600/20'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {t.label}
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md ${
                    filter === t.id ? 'bg-emerald-500/40 text-emerald-50' : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5 relative">
        {/* Claim rows */}
        <div className="lg:col-span-3 space-y-3">
          {claimCandidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/30 p-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-zinc-700 mb-3" />
              <p className="font-heading text-white/80">No claim-eligible notes</p>
              <p className="text-xs mt-1.5 font-mono text-zinc-600 max-w-sm mx-auto">
                {filter === 'converted'
                  ? 'Nothing marked isConverted yet — use Ready for Plutus above.'
                  : filter === 'ready'
                    ? 'No bcbaSigned notes awaiting Plutus handoff.'
                    : 'Needs BCBA-signed SessionNotes (ready or converted) from Studio → co-sign.'}
              </p>
            </div>
          ) : (
            claimCandidates.map((note) => {
              const client = note.session?.client;
              const selected = selectedNote?.id === note.id;
              const mins = durationMinutes(note);
              const units = note.billableUnits;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    setShowEdiPreview(false);
                  }}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 cursor-pointer hover:scale-[1.01] hover:shadow-2xl ${
                    selected
                      ? 'bg-emerald-950/40 border-emerald-500/40 shadow-lg shadow-emerald-900/20'
                      : 'bg-zinc-900/50 border-white/5 hover:border-brand-orange-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-white truncate">
                        {client
                          ? `${client.firstName} ${client.lastName}`
                          : 'Unknown client'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-zinc-500">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatServiceDate(note)}
                        </span>
                        {note.session?.cptCode && (
                          <span className="inline-flex items-center gap-1 text-cyan-400/90">
                            <Hash className="h-3 w-3" /> CPT {note.session.cptCode}
                          </span>
                        )}
                        {(units != null || mins > 0) && (
                          <span className="text-brand-orange-300/90">
                            {units != null
                              ? `${units} unit${units === 1 ? '' : 's'}`
                              : `${mins} min`}
                          </span>
                        )}
                      </div>
                      {client?.insurancePayer && (
                        <p className="mt-1.5 text-[11px] font-mono text-cyan-400/70 truncate">
                          {client.insurancePayer}
                          {client.memberId || client.medicaidId
                            ? ` · ${client.memberId || client.medicaidId}`
                            : ''}
                        </p>
                      )}
                      {note.isConverted && note.plutusClaimRef && (
                        <p className="mt-1 text-[11px] font-mono text-emerald-400/90">
                          Ref {note.plutusClaimRef}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${
                        note.isConverted
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-brand-orange-500/10 text-brand-orange-400 border-brand-orange-500/20'
                      }`}
                    >
                      {note.isConverted ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> In Plutus
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="dot-live h-1.5 w-1.5 rounded-full bg-brand-orange-400" />
                          Ready
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Detail pane */}
        <div className="lg:col-span-2">
          {!selectedNote || !claimInput ? (
            <div className="h-full min-h-[200px] rounded-2xl border border-dashed border-white/10 bg-zinc-900/30 p-8 flex flex-col items-center justify-center text-center">
              <AlertTriangle className="h-6 w-6 text-zinc-600 mb-2" />
              <p className="font-heading text-white/70 text-sm">Select a claim row</p>
              <p className="text-[11px] text-zinc-600 mt-1 font-mono">
                Detail + optional 837 preview — no hardcoded patients.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-xl p-5 space-y-4 transition-all duration-300 hover:border-emerald-500/30">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                    Claim detail
                  </p>
                  <h3 className="font-heading font-bold text-white text-lg mt-0.5">
                    {claimInput.patientFirstName} {claimInput.patientLastName}
                  </h3>
                  <p className="text-xs font-mono text-cyan-400 mt-0.5">{claimInput.payerName}</p>
                </div>
                {selectedNote.session?.client?.id && (
                  <Link
                    href={`/client/${selectedNote.session.client.id}`}
                    className="inline-flex items-center gap-1 text-[11px] text-brand-orange-400 hover:text-brand-orange-300 cursor-pointer transition-colors"
                  >
                    Chart <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-xl border border-white/5 bg-zinc-950/60 p-3">
                  <span className="text-zinc-500 font-mono uppercase text-[9px]">Service</span>
                  <p className="text-white font-mono mt-0.5">{claimInput.serviceDate}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-zinc-950/60 p-3">
                  <span className="text-zinc-500 font-mono uppercase text-[9px]">CPT / Units</span>
                  <p className="text-emerald-400 font-mono mt-0.5">
                    {claimInput.lines[0]?.cptCode}
                    {edi837Result ? ` · ${edi837Result.totalUnits}u` : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-white/5 bg-zinc-950/60 p-3">
                  <span className="text-zinc-500 font-mono uppercase text-[9px]">Auth</span>
                  <p className="text-zinc-200 font-mono mt-0.5 truncate">
                    {claimInput.authNumber || '—'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/5 bg-zinc-950/60 p-3">
                  <span className="text-zinc-500 font-mono uppercase text-[9px]">Plutus ref</span>
                  <p className="text-zinc-200 font-mono mt-0.5 truncate">
                    {selectedNote.plutusClaimRef ||
                      (selectedNote.isConverted ? 'Marked (no ref)' : 'Not sent yet')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 border-t border-white/5 pt-3">
                <User className="h-3 w-3 text-zinc-600" />
                {selectedNote.session?.bcba
                  ? `${selectedNote.session.bcba.firstName} ${selectedNote.session.bcba.lastName}`
                  : 'BCBA —'}
                <span className="text-zinc-700">·</span>
                RBT{' '}
                {selectedNote.session?.rbt
                  ? `${selectedNote.session.rbt.firstName} ${selectedNote.session.rbt.lastName}`
                  : '—'}
              </div>

              {edi837Result && (
                <p className="text-xs font-mono text-zinc-400">
                  Preview amount{' '}
                  <span className="text-white font-bold">
                    ${edi837Result.totalBilledAmount.toFixed(2)}
                  </span>
                  <span className="text-amber-400/80"> · not submitted</span>
                </p>
              )}

              {ediPreviewEnabled && (
                <button
                  type="button"
                  onClick={() => setShowEdiPreview((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-zinc-950/50 px-3 py-2.5 text-xs font-bold text-zinc-300 hover:border-emerald-500/30 hover:text-white transition-all cursor-pointer"
                >
                  <span>Optional 837P preview (dev only, display only)</span>
                  {showEdiPreview ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              )}

              {ediPreviewEnabled && showEdiPreview && edi837Result && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                    <span>ANSI X12 837P</span>
                    <span className="text-amber-400 font-bold">P3 stub · Plutus is SoT</span>
                  </div>
                  <pre className="bg-zinc-950 p-3 rounded-xl border border-white/10 text-[10px] font-mono text-emerald-400/90 overflow-x-auto max-h-48 whitespace-pre">
                    {edi837Result.rawEdiText}
                  </pre>
                  <Button
                    onClick={downloadEdiFile}
                    className="w-full bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-white font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download .EDI preview
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
