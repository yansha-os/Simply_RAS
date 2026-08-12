'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  Layers,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  logOpsAuditReportExport,
  type OpsDashboardData,
} from '@/app/(dashboard)/ops/actions';
import { CLINIC_TIME_ZONE } from '@/lib/clinicTimezone';

const CLINIC_REPORT_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});
const CLINIC_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
});

export default function OpsAuditReportCompiler({
  snapshot,
}: {
  snapshot: OpsDashboardData;
}) {
  const [reportReady, setReportReady] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, startExport] = useTransition();

  const { metrics } = snapshot;
  const reportDate = CLINIC_REPORT_DATE.format(new Date(snapshot.generatedAt));
  const paWindowEnd = CLINIC_DATE.format(new Date(snapshot.scope.paRiskWindowEnd));
  const hasOperationalData =
    metrics.totalClients > 0 ||
    metrics.paAdjudicatedCount > 0 ||
    metrics.agedUnconvertedNotes > 0 ||
    metrics.caseCoordOpenActionItems > 0;

  const handleCompileReport = () => {
    setReportReady(true);
    setExportError(null);
    toast.success('Operations snapshot report prepared from the loaded database counts.');
  };

  const handleDownloadPdf = () => {
    startExport(async () => {
      try {
        const result = await logOpsAuditReportExport({
          generatedAt: snapshot.generatedAt,
        });
        if (!result.success) {
          const message = result.error ?? 'Unable to audit the report export.';
          setExportError(message);
          toast.error(message);
          return;
        }

        setExportError(null);
        window.print();
        toast.success('Print dialog opened. Choose “Save as PDF” to create a PDF file.');
      } catch {
        const message = 'Unable to prepare the report export. Please try again.';
        setExportError(message);
        toast.error(message);
      }
    });
  };

  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur-2xl transition-all duration-300 hover:border-brand-orange-500/40">
      <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-brand-orange-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />

      <CardHeader className="relative z-10 flex flex-col justify-between gap-4 border-b border-white/10 p-6 lg:flex-row lg:items-center">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-brand-orange-500/20 bg-brand-orange-500/10 text-brand-orange-400 shadow-[0_0_20px_rgba(255,107,0,0.2)]">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="font-heading text-lg font-bold tracking-wide text-white">
                Executive Operations Snapshot Report
              </CardTitle>
              <span className="rounded-full border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-teal-400">
                DB SNAPSHOT
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              Formats the current command-center snapshot for printing. It does not infer missing
              SLA data or send email.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!reportReady ? (
            <Button
              type="button"
              onClick={handleCompileReport}
              className="relative flex h-11 cursor-pointer items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand-orange-500 to-orange-600 px-5 text-xs font-bold text-white shadow-[0_0_25px_rgba(255,107,0,0.35)] transition-all hover:scale-[1.02] hover:from-brand-orange-600 hover:to-orange-700 active:scale-[0.98]"
            >
              <Layers className="h-4 w-4" />
              <span>Prepare Snapshot Report</span>
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExporting}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-4 text-xs font-semibold text-white transition-all hover:border-white/20 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExporting ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-teal-400" />
                ) : (
                  <Printer className="h-4 w-4 text-teal-400" />
                )}
                <span>{isExporting ? 'Preparing print…' : 'Print / Save PDF'}</span>
              </Button>
              <Button
                type="button"
                disabled
                title="No email delivery integration is configured for this report."
                className="flex h-10 cursor-not-allowed items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/60 px-4 text-xs font-semibold text-zinc-500 opacity-70"
              >
                <Send className="h-4 w-4" />
                <span>Email unavailable</span>
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="relative z-10 p-6">
        {exportError && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold">Export not opened</p>
              <p className="mt-0.5 text-rose-200/70">{exportError}</p>
            </div>
          </div>
        )}

        {reportReady ? (
          <div className="space-y-6 rounded-2xl border border-white/10 bg-zinc-900/90 p-6 text-xs text-zinc-300 shadow-inner">
            <div className="flex flex-col items-start justify-between gap-3 border-b border-white/10 pb-5 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  <h3 className="font-heading text-base font-bold uppercase tracking-wide text-white">
                    RISE &amp; SHINE ABA — OPERATIONS SNAPSHOT
                  </h3>
                </div>
                <p className="font-mono text-[11px] text-zinc-400">
                  Snapshot generated {reportDate} • Scope: Intake, Billing, Clinical, Case Coord
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 font-mono text-xs font-bold text-cyan-400 shadow-sm">
                <Database className="h-3.5 w-3.5" />
                <span>STATUS: DATABASE SNAPSHOT</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 rounded-xl border border-white/5 bg-zinc-950/80 p-4 transition-all hover:border-brand-orange-500/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-brand-orange-400">
                    1. INTAKE
                  </span>
                  <span className="h-2 w-2 rounded-full bg-brand-orange-500" />
                </div>
                <p className="text-lg font-black text-white">
                  {metrics.intakeSubmittedPackets} submitted
                </p>
                <p className="font-mono text-[11px] text-zinc-400">
                  {metrics.intakeSubmittedOver48h} last updated &gt;48h ago
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-white/5 bg-zinc-950/80 p-4 transition-all hover:border-emerald-500/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    2. BILLING
                  </span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-lg font-black text-white">
                  {metrics.billingAwaitingVob} awaiting VOB
                </p>
                <p className="font-mono text-[11px] text-zinc-400">
                  {metrics.billingExpiringPas} approved PAs expire by {paWindowEnd}
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-white/5 bg-zinc-950/80 p-4 transition-all hover:border-cyan-500/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                    3. CLINICAL
                  </span>
                  <span className="h-2 w-2 rounded-full bg-cyan-500" />
                </div>
                <p className="text-lg font-black text-white">
                  {metrics.clinicalAwaitingReports} awaiting reports
                </p>
                <p className="font-mono text-[11px] text-zinc-400">
                  ASSESSMENT_SCHEDULED clients; SLA unavailable
                </p>
              </div>

              <div className="space-y-2 rounded-xl border border-white/5 bg-zinc-950/80 p-4 transition-all hover:border-purple-500/30">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-purple-400">
                    4. CASE COORD
                  </span>
                  <span className="h-2 w-2 rounded-full bg-purple-500" />
                </div>
                <p className="text-lg font-black text-white">
                  {metrics.caseCoordStaffingPending} staffing pending
                </p>
                <p className="font-mono text-[11px] text-zinc-400">
                  {metrics.caseCoordOpenActionItems} assigned unresolved work items
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-white/5 bg-zinc-950/90 p-5 leading-relaxed">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
                <ShieldCheck className="h-4 w-4 text-brand-orange-400" />
                <span>Snapshot interpretation</span>
              </div>
              <p className="text-zinc-300">
                The database contains{' '}
                <strong className="text-white">{metrics.totalClients} total client records</strong>, of
                which <strong className="text-white">{metrics.activeClients} are ACTIVE</strong>. The
                aged-note query found{' '}
                <strong className="text-white">{metrics.agedUnconvertedNotes} unconverted notes</strong>{' '}
                created at least 48 hours before this snapshot.
              </p>
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/5 p-3 text-amber-200/80">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <p>
                  SLA compliance is intentionally omitted: the current schema does not persist the
                  transition timestamps required to calculate it. Email dispatch is also unavailable
                  because no delivery integration is configured.
                </p>
              </div>

              {!hasOperationalData && (
                <div className="flex items-start gap-2 rounded-lg border border-cyan-500/15 bg-cyan-500/5 p-3 text-cyan-200/80">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                  <p>
                    All audited aggregate counts returned zero. These are database results, not
                    seeded or fallback values.
                  </p>
                </div>
              )}
            </div>

            <p className="font-mono text-[10px] text-zinc-600">
              Print / Save PDF submits a best-effort EXPORT breadcrumb to AuditLogVault before
              opening the browser print dialog. Report content is snapshot-based and may become
              stale after operational changes.
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-dashed border-white/10 bg-zinc-950/50 p-12 text-center text-xs text-zinc-400">
            <Layers className="mx-auto h-8 w-8 text-zinc-600" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">Snapshot loaded; report not prepared</p>
              <p className="text-zinc-500">
                Prepare the report to format the already-loaded {reportDate} database snapshot.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
