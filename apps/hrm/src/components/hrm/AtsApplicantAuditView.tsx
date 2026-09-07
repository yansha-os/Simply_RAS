'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  FileText,
  CheckCircle2,
  Globe,
  Laptop,
  Hash,
  Download,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  exportCandidateAuditPack,
  getCandidateOnboardingAudit,
  type OnboardingAuditEventDto,
} from '@/app/actions/onboardingSignatureActions';

interface AuditEvent {
  time: string;
  action: string;
  detail?: string;
}

interface AuditRecord {
  id: string;
  documentTitle: string;
  category: 'Acknowledgment' | 'Fillable PDF' | 'In-app form' | 'Policy Review' | 'Tax & Legal';
  status: 'Completed' | 'Pending';
  completedAt: string;
  reviewedText: string;
  agreedText: string;
  signerName: string;
  signedAt: string;
  ipAddress: string;
  deviceInfo: string;
  eventHash: string;
  events: AuditEvent[];
}

interface AtsApplicantAuditViewProps {
  applicantId: string;
  candidateName?: string;
}

function formatAuditTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} ET`;
}

function toAuditRecord(event: OnboardingAuditEventDto): AuditRecord {
  return {
    id: event.id,
    documentTitle: `${event.documentTitle} · ${event.actionType}`,
    category:
      event.actionType === 'UPLOADED'
        ? 'Fillable PDF'
        : event.actionType === 'FORM_SUBMITTED'
        ? 'In-app form'
        : event.documentKey.includes('w4') ||
          event.documentKey.includes('it-2104') ||
          event.documentKey.includes('ls-54')
        ? 'Tax & Legal'
        : event.actionType === 'SIGNED'
        ? 'Acknowledgment'
        : 'Policy Review',
    status: event.actionType === 'QUIZ_FAILED' ? 'Pending' : 'Completed',
    completedAt: formatAuditTime(event.createdAt),
    reviewedText: `${event.documentTitle} (${event.documentVersion})`,
    agreedText: event.consents.eSign
      ? 'Confirmed electronic signature is intended as equivalent to a handwritten signature (E-SIGN / N.Y. ESRA).'
      : `${event.actionType} recorded for this document.`,
    signerName: (event.signerName || 'applicant').toLowerCase(),
    signedAt: formatAuditTime(event.createdAt),
    ipAddress: event.ipAddress || '—',
    deviceInfo: event.userAgent || '—',
    eventHash: `sha256:${event.auditHash}`,
    events: [
      {
        time: formatAuditTime(event.createdAt),
        action: event.actionType,
        detail: event.fileName
          ? event.fileName
          : event.quizScore != null
          ? `score ${event.quizScore}% · attempt #${event.quizAttempt || 1}`
          : event.deviceFingerprint || undefined,
      },
    ],
  };
}

export function AtsApplicantAuditView({
  applicantId,
  candidateName = 'Candidate',
}: AtsApplicantAuditViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void getCandidateOnboardingAudit(applicantId).then((res) => {
      setIsLoading(false);
      if (!res.success) {
        toast.error(res.error);
        setAuditRecords([]);
        return;
      }
      setAuditRecords(res.data.map(toAuditRecord));
    });
  }, [applicantId]);

  const filteredRecords = auditRecords.filter(
    (r) =>
      r.documentTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.signerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.eventHash.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExport = async () => {
    setExporting(true);
    const res = await exportCandidateAuditPack(applicantId);
    setExporting(false);
    if (!res.success || !res.data) {
      toast.error(res.error || 'Export failed');
      return;
    }

    const blob = new Blob([JSON.stringify(res.data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = candidateName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
    a.href = url;
    a.download = `audit-pack_${safeName}_${applicantId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Audit pack downloaded (JSON).');
  };

  return (
    <div className="select-none space-y-6 animate-fade-in text-white">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 font-bold text-orange-400 shadow-md">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-xl font-black tracking-tight text-white">
                Onboarding Audit Trail
              </h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-bold text-zinc-300">
                INTERNAL RECORD
              </span>
            </div>
            <p className="mt-0.5 text-xs font-medium text-zinc-400">
              Timestamped signature / upload events for{' '}
              <strong className="text-white">{candidateName}</strong>. Event integrity hashes cover
              action metadata (not a full document vault).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit trail or hash..."
              className="rounded-xl border border-white/10 bg-zinc-900/90 py-2 pl-9 pr-3 text-xs text-white placeholder-zinc-500 outline-none focus:border-brand-orange-500"
            />
          </div>

          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white shadow-md transition-all hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>{exporting ? 'Exporting…' : 'Export Audit Pack'}</span>
          </button>
        </div>
      </div>

      <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
        This log supports HR review and retention. It does <strong>not</strong> certify ESIGN / ESRA /
        UETA compliance by itself. Wage notices are created on the{' '}
        <strong>Extend Offer (LS-54)</strong> tab; signed LS-54 notice content SHA-256 is included in
        the export when present.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/80 p-12 text-center text-xs text-zinc-400 backdrop-blur-xl">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
          <span className="ml-3 font-mono">Loading onboarding audit trail…</span>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-heading flex items-center gap-2 text-sm font-black uppercase tracking-wider text-zinc-400">
              <FileText className="h-4 w-4 text-orange-500" /> Recorded events ({filteredRecords.length})
            </h3>
            <span className="font-mono text-[11px] font-semibold text-zinc-500">
              Head HR / ATS staff only
            </span>
          </div>

          {filteredRecords.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-8 text-sm text-zinc-400 backdrop-blur-xl">
              No signature, upload, or quiz events yet. Events appear here after the applicant confirms
              each step.
            </div>
          )}
          {filteredRecords.map((record) => (
            <div
              key={record.id}
              className="group relative space-y-6 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-6 text-white shadow-2xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.005] hover:border-brand-orange-500/40 sm:p-8"
            >
              <div className="flex flex-col justify-between gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 font-bold text-emerald-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-heading text-lg font-black text-white">{record.documentTitle}</h4>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10px] font-bold text-zinc-300">
                        {record.category}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-zinc-400">
                      Recorded: {record.completedAt}
                    </p>
                  </div>
                </div>

                <span className="self-start rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 font-mono text-xs font-black uppercase tracking-wider text-emerald-400 sm:self-auto">
                  {record.status}
                </span>
              </div>

              <div className="space-y-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-5">
                <span className="block font-mono text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Acknowledgment summary
                </span>
                <div className="space-y-2 text-xs leading-relaxed text-zinc-300">
                  <p>
                    <strong className="font-bold text-white">What they reviewed:</strong>{' '}
                    {record.reviewedText}
                  </p>
                  <p>
                    <strong className="font-bold text-white">What they agreed to:</strong>{' '}
                    {record.agreedText}
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-5 font-mono text-xs">
                <span className="block border-b border-white/10 pb-2 font-mono text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  Signature &amp; audit trail — {record.documentTitle.toUpperCase()}
                </span>

                <div className="grid grid-cols-1 gap-3 text-zinc-300 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p>
                      <span className="text-zinc-500">Signer:</span>{' '}
                      <strong className="text-white">{record.signerName}</strong>
                    </p>
                    <p>
                      <span className="text-zinc-500">Signed:</span>{' '}
                      <strong className="text-white">{record.signedAt}</strong>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-zinc-500">IP:</span>{' '}
                      <strong className="text-white">{record.ipAddress}</strong>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Laptop className="h-3.5 w-3.5 text-zinc-500" />
                      <span className="text-zinc-500">Device:</span>{' '}
                      <strong className="text-white">{record.deviceInfo}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 break-all rounded-xl border border-white/10 bg-zinc-950/80 p-3 text-[11px]">
                  <Hash className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange-500" />
                  <div>
                    <span className="block text-[10px] font-bold text-zinc-500">
                      Event integrity SHA-256 (metadata):
                    </span>
                    <code className="select-all font-mono text-orange-400">{record.eventHash}</code>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="block text-[11px] font-bold text-zinc-400">
                    Audit trail ({record.events.length} events)
                  </span>
                  <div className="space-y-1.5 border-l-2 border-orange-500/50 pl-2">
                    {record.events.map((evt, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px] text-zinc-300">
                        <span className="shrink-0 font-mono text-zinc-500">{evt.time}</span>
                        <span className="font-bold text-zinc-500">—</span>
                        <span className="font-bold text-white">{evt.action}</span>
                        {evt.detail && (
                          <span className="text-[10px] text-zinc-400">({evt.detail})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
