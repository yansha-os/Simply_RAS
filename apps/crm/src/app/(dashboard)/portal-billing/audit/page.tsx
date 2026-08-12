import React from 'react';
import Link from 'next/link';
import { FileSearch, ArrowLeft } from 'lucide-react';
import { listDualRunAuditNotes } from '@/app/actions/dualRunAuditActions';
import DualRunAuditWorksheet from '@/components/portal-billing/DualRunAuditWorksheet';
import { addClinicDays, clinicDateKey } from '@/lib/clinicTimezone';

export const dynamic = 'force-dynamic';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DualRunAuditPage({
  searchParams,
}: {
  searchParams?:
    | Promise<{ from?: string; to?: string; clientId?: string }>
    | { from?: string; to?: string; clientId?: string };
}) {
  const sp = searchParams instanceof Promise ? await searchParams : searchParams;

  const now = new Date();
  const defaultTo = clinicDateKey(now);
  const defaultFrom = clinicDateKey(addClinicDays(now, -30));

  const from = sp?.from && DATE_ONLY_RE.test(sp.from) ? sp.from : defaultFrom;
  const to = sp?.to && DATE_ONLY_RE.test(sp.to) ? sp.to : defaultTo;
  const clientId = sp?.clientId || undefined;

  const result = await listDualRunAuditNotes({ from, to, clientId });

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur-xl">
              <FileSearch className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-white tracking-tight">
                Dual-Run Billing Audit
              </h1>
              <p className="text-zinc-400 text-sm mt-0.5 max-w-2xl">
                Fully signed RAS session notes with claim-critical fields, side-by-side-able
                against Artemis for the cohort audit (cutover gate 10 — ≥10-note sample). Export
                the CSV to reconcile offline against Artemis exports.
              </p>
            </div>
          </div>
          <Link
            href="/portal-billing"
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-zinc-950/80 px-3 py-2 text-xs font-bold text-zinc-300 hover:text-white hover:border-brand-orange-500/40 transition-all duration-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Billing queues
          </Link>
        </div>

        <DualRunAuditWorksheet
          rows={result.rows}
          clients={result.clients}
          from={from}
          to={to}
          clientId={clientId ?? null}
          loadError={result.success ? null : result.error}
        />
      </div>
    </div>
  );
}
