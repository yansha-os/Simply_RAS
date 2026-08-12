'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  FileText,
  CheckCircle,
  Upload,
  Loader2,
  CircleDashed,
  ScrollText,
  User,
  CalendarRange,
  BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { assembleReport } from '@/app/(dashboard)/portal-case/actions/clinical-support';
import {
  buildTreatmentPlanReportModel,
  NOT_DOCUMENTED,
} from '@/lib/pdf/treatmentPlanReportModel';

export default function ReportAssemblyTab({ client }: { client: any }) {
  const [dataChecked, setDataChecked] = useState(false);
  const [formatChecked, setFormatChecked] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRouting, startRouting] = useTransition();

  const isAssembled = [
    'REPORT_ASSEMBLED',
    'TX_PA_SUBMITTED',
    'TX_PA_APPROVED',
    'STAFFING_PENDING',
    'ACTIVE',
  ].includes(client.status);
  const plan =
    client.treatmentPlan && typeof client.treatmentPlan === 'object' ? client.treatmentPlan : {};
  const hasSignature = !!plan.parentSignature;

  // Same model the PDF renders from — the checklist below is exactly what
  // prints, section for section ("Not yet documented" included).
  const reportModel = useMemo(
    () => buildTreatmentPlanReportModel({ client, treatmentPlan: plan }),
    [client, plan],
  );
  const documentedCount = reportModel.sections.filter((s) => s.documented).length;

  const handleGeneratePdf = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const toastId = toast.loading('Generating treatment plan PDF…');
    try {
      const res = await fetch(`/api/generate-report/${client.id}`);
      if (!res.ok) {
        const message =
          res.status === 403
            ? 'You do not have access to this client\u2019s report.'
            : res.status === 404
              ? 'Client not found.'
              : 'PDF generation failed. Please try again.';
        toast.error(message, { id: toastId });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // Give the new tab time to grab the blob before revoking
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success('Treatment plan PDF generated.', { id: toastId });
    } catch {
      toast.error('Network error while generating the PDF.', { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRouteToBilling = () => {
    startRouting(async () => {
      const res: any = await assembleReport(client.id);
      if (res && res.success === false) {
        toast.error(res.error || 'Failed to route report to Billing.');
      } else {
        toast.success('Report assembled and routed to Billing.');
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Report preview — mirrors the PDF section-for-section */}
      <Card className="border-white/10 shadow-2xl w-full relative overflow-hidden bg-zinc-950/80 backdrop-blur-xl">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
        <CardHeader className="pb-4 border-b border-white/5">
          <CardTitle className="text-lg text-white flex items-center gap-3 font-heading">
            <ScrollText className="w-5 h-5 text-teal-400" /> PDF Preview
            <span className="text-[10px] font-mono font-bold border px-2.5 py-1 rounded-md tracking-wider uppercase bg-teal-500/10 border-teal-500/20 text-teal-400">
              {documentedCount}/{reportModel.sections.length} sections documented
            </span>
          </CardTitle>
          <p className="text-sm text-zinc-400 mt-1">
            Exactly what the generated PDF renders — undocumented sections print as
            &ldquo;{NOT_DOCUMENTED}&rdquo; instead of blank gaps.
          </p>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3.5 transition-all duration-300 hover:border-teal-500/40">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                <User className="w-3 h-3" /> Client
              </div>
              <p className="text-sm font-medium text-white truncate">{reportModel.clientName}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3.5 transition-all duration-300 hover:border-teal-500/40">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                <CalendarRange className="w-3 h-3" /> Plan Period
              </div>
              <p className={`text-sm font-medium truncate ${reportModel.planPeriodLabel ? 'text-white' : 'italic text-zinc-500'}`}>
                {reportModel.planPeriodLabel ?? NOT_DOCUMENTED}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-3.5 transition-all duration-300 hover:border-teal-500/40">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                <BadgeCheck className="w-3 h-3" /> BCBA of Record
              </div>
              <p className={`text-sm font-medium truncate ${reportModel.bcbaOfRecord ? 'text-white' : 'italic text-zinc-500'}`}>
                {reportModel.bcbaOfRecord ?? NOT_DOCUMENTED}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-zinc-900/40 divide-y divide-white/5 overflow-hidden">
            {reportModel.sections.map((section) => (
              <div
                key={section.id}
                className="flex items-center justify-between px-4 py-2.5 transition-colors duration-300 hover:bg-white/[0.03]"
              >
                <span className="text-sm text-zinc-300">{section.title}</span>
                {section.documented ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">
                    <CheckCircle className="w-3 h-3" /> Documented
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <CircleDashed className="w-3 h-3" /> {NOT_DOCUMENTED}
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Assembly workflow */}
      <Card className="border-purple-500/20 shadow-sm w-full relative overflow-hidden bg-zinc-950/50">
        <CardHeader className="pb-4 border-b border-white/5">
          <div>
            <CardTitle className="text-lg text-white flex items-center gap-3">
              <FileText className="w-5 h-5 text-purple-500" /> Report Assembly
              {isAssembled && (
                <span className="text-[10px] font-bold border px-2.5 py-1 rounded-md tracking-wider uppercase bg-green-500/10 border-green-500/30 text-green-400">
                  ASSEMBLED &amp; ROUTED
                </span>
              )}
            </CardTitle>
            <p className="text-sm text-zinc-400 mt-1">
              Organize the BCBA&apos;s findings into the final report packet.
            </p>
          </div>
        </CardHeader>

        <CardContent className="p-8">
          <div className="space-y-6">
            <div
              className={`bg-zinc-900 border ${isAssembled ? 'border-green-500/20' : 'border-white/10'} p-5 rounded-xl`}
            >
              <h3 className="text-base font-semibold text-white mb-4 flex items-center">
                <Upload className="w-4 h-4 mr-2 text-zinc-400" />
                Assemble Report Packet
              </h3>

              <div className="space-y-4">
                <label
                  className={`flex items-start space-x-3 group ${isAssembled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    className={`mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-zinc-900 ${isAssembled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    checked={dataChecked || isAssembled}
                    onChange={(e) => setDataChecked(e.target.checked)}
                    disabled={isAssembled}
                  />
                  <div>
                    <p
                      className={`text-sm font-medium ${dataChecked || isAssembled ? 'text-zinc-300' : 'text-zinc-400'} group-hover:text-white transition-colors`}
                    >
                      Assessment Data Organized
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Entered/organized the data provided by the BCBA (without altering clinical
                      content).
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start space-x-3 group ${isAssembled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    className={`mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-zinc-900 ${isAssembled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    checked={formatChecked || isAssembled}
                    onChange={(e) => setFormatChecked(e.target.checked)}
                    disabled={isAssembled}
                  />
                  <div>
                    <p
                      className={`text-sm font-medium ${formatChecked || isAssembled ? 'text-zinc-300' : 'text-zinc-400'} group-hover:text-white transition-colors`}
                    >
                      Packet Formatted &amp; Uploaded
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Assembled the evaluation, data, and supporting docs into the final PDF.
                    </p>
                  </div>
                </label>

                {!isAssembled && !hasSignature && (
                  <div className="pt-4 border-t border-white/5">
                    <div className="flex items-center text-amber-400 text-sm font-medium bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                      Waiting for Parent Signature on the Treatment Plan before assembly can begin.
                    </div>
                  </div>
                )}

                {!isAssembled && hasSignature && (
                  <div className="pt-4 border-t border-white/5 flex flex-col gap-4">
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={handleGeneratePdf}
                        disabled={isGenerating}
                        className={`border-purple-500/30 text-purple-400 hover:bg-purple-500/10 transition-all duration-300 ${isGenerating ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:scale-[1.01]'}`}
                      >
                        {isGenerating ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4 mr-2" />
                        )}
                        {isGenerating ? 'Generating…' : 'Generate & Preview PDF'}
                      </Button>
                      <p className="text-xs text-zinc-500">
                        Renders the sections shown in the preview above, with signatures.
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleRouteToBilling}
                      className={`bg-purple-600 hover:bg-purple-700 text-white w-full max-w-[200px] ${!dataChecked || !formatChecked || isRouting ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      disabled={!dataChecked || !formatChecked || isRouting}
                    >
                      {isRouting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Routing…
                        </>
                      ) : (
                        'Route to Billing'
                      )}
                    </Button>
                  </div>
                )}

                {isAssembled && (
                  <div className="pt-2 space-y-3">
                    <div className="flex items-center text-green-400 text-sm font-medium bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                      <CheckCircle className="w-4 h-4 mr-2" /> Report Assembled. Routed to Billing
                      for Treatment PA.
                    </div>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={handleGeneratePdf}
                      disabled={isGenerating}
                      className={`border-white/10 text-zinc-300 hover:bg-white/5 transition-all duration-300 ${isGenerating ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4 mr-2" />
                      )}
                      {isGenerating ? 'Generating…' : 'Re-download PDF'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
