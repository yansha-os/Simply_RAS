'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle, Clock, FileText, Send } from 'lucide-react';
import { toast } from 'sonner';
import { submitTreatmentPacket } from '@/app/(dashboard)/clinical-support/actions';

type BillingHandoffClient = {
  id: string;
  status: string;
};

export default function ClinicalSupportBillingHandoffTab({
  client,
}: {
  client: BillingHandoffClient;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isSubmitted = [
    'TX_PA_SUBMITTED',
    'TX_PA_APPROVED',
    'STAFFING_PENDING',
    'ACTIVE',
    'DISCHARGED',
  ].includes(client.status);
  const canSubmit = client.status === 'REPORT_ASSEMBLED';

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await submitTreatmentPacket(client.id);
      if (!result.success) {
        toast.error(result.error || 'Failed to route the packet to Billing.');
        return;
      }
      toast.success('Treatment PA marked submitted — routed to Billing.');
      setConfirmed(false);
      router.refresh();
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="relative overflow-hidden border border-emerald-500/20 bg-zinc-950/80 shadow-2xl backdrop-blur-xl">
        <div className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <CardHeader className="border-b border-white/5 pb-4">
          <CardTitle className="flex items-center gap-3 font-heading text-lg text-white">
            <Send className="h-5 w-5 text-emerald-400" />
            Billing handoff
            {isSubmitted && (
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Submitted
              </span>
            )}
          </CardTitle>
          <p className="mt-1 text-sm text-zinc-400">
            Confirm the assembled report packet is ready for Billing to track the Treatment PA
            in RAS.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-zinc-200">Assembled report packet</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Advances the client to Treatment PA submitted and creates or updates the
                  Treatment PA tracker row for Billing.
                </p>
              </div>
            </div>
          </div>

          {canSubmit && (
            <>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-zinc-950/60 p-4 transition-all hover:border-emerald-500/30">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={isPending}
                  className={`mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900 ${
                    isPending ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                />
                <span className="text-sm text-zinc-300">
                  I confirm the signed report packet is complete and ready for Billing to submit
                  the Treatment PA.
                </span>
              </label>

              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={!confirmed || isPending}
                isLoading={isPending}
                className={`w-full max-w-xs bg-emerald-600 text-white hover:bg-emerald-500 ${
                  !confirmed || isPending ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <Send className="mr-2 h-4 w-4" />
                Route to Billing
              </Button>
            </>
          )}

          {isSubmitted && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Treatment PA is in Billing&apos;s queue for payer submission and tracking.
            </div>
          )}

          {!canSubmit && !isSubmitted && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-300">
              <Clock className="h-4 w-4 shrink-0" />
              Complete report assembly before routing to Billing.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
