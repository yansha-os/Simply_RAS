'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  FileText,
  Loader2,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getWageOffer,
  saveWageOfferDraft,
  sendWageOffer,
  type WageOfferDto,
} from '@/app/actions/wageOfferActions';
import {
  buildDefaultLs54Payload,
  type Ls54Payload,
  type Ls54Status,
} from '@/lib/onboardingDocuments';
import { Ls54NoticeDocument, printLs54Notice } from '@/components/hrm/Ls54NoticeDocument';

type ExtendOfferTabProps = {
  candidateId: string;
  candidateName: string;
  preparerName?: string;
};

type LoadState = 'loading' | 'ready' | 'error';

const FLOW_STEPS: { key: Ls54Status | 'NONE'; label: string }[] = [
  { key: 'NONE', label: 'Prepare' },
  { key: 'DRAFT', label: 'Draft saved' },
  { key: 'SENT', label: 'Sent' },
  { key: 'SIGNED', label: 'Signed · hire' },
];

function statusLabel(status: Ls54Status): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft — awaiting send';
    case 'SENT':
      return 'Sent — awaiting applicant e-sign';
    case 'IN_DISCUSSION':
      return 'In discussion with applicant';
    case 'SIGNED':
      return 'Signed — hire complete';
    case 'DECLINED':
      return 'Declined by applicant';
    case 'NONE':
    default:
      return 'No notice yet — prepare wage & LS-54';
  }
}

function statusBadgeClass(status: Ls54Status): string {
  if (status === 'SIGNED') return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
  if (status === 'DECLINED') return 'border-rose-500/20 bg-rose-500/10 text-rose-300';
  if (status === 'SENT' || status === 'IN_DISCUSSION') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
  }
  if (status === 'DRAFT') return 'border-sky-500/20 bg-sky-500/10 text-sky-300';
  return 'border-white/10 bg-white/5 text-zinc-300';
}

function flowStepIndex(status: Ls54Status): number {
  if (status === 'SIGNED') return 3;
  if (status === 'SENT' || status === 'IN_DISCUSSION' || status === 'DECLINED') return 2;
  if (status === 'DRAFT') return 1;
  return 0;
}

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n)) || Number(n) <= 0) return null;
  return `$${Number(n).toFixed(2)}`;
}

export function ExtendOfferTab({
  candidateId,
  candidateName,
  preparerName = 'Head of HR',
}: ExtendOfferTabProps) {
  const [offer, setOffer] = useState<WageOfferDto | null>(null);
  const [payload, setPayload] = useState<Ls54Payload>(() =>
    buildDefaultLs54Payload(candidateName, preparerName)
  );
  const [expanded, setExpanded] = useState(true);
  const [pending, setPending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const applyLoadResult = useCallback(
    (res: Awaited<ReturnType<typeof getWageOffer>>) => {
      if (!res.success || !res.data) {
        setLoadState('error');
        setLoadError(res.error || 'Failed to load wage offer for this applicant.');
        setOffer(null);
        return;
      }
      setOffer(res.data);
      if (res.data.payload) {
        setPayload(res.data.payload);
      } else {
        setPayload(
          buildDefaultLs54Payload(res.data.employeeName || candidateName, preparerName)
        );
      }
      setLoadState('ready');
    },
    [candidateName, preparerName]
  );

  const load = useCallback(async () => {
    const res = await getWageOffer(candidateId);
    applyLoadResult(res);
  }, [applyLoadResult, candidateId]);

  useEffect(() => {
    let active = true;
    void getWageOffer(candidateId).then((res) => {
      if (active) applyLoadResult(res);
    });
    return () => {
      active = false;
    };
  }, [applyLoadResult, candidateId]);

  const status = offer?.status || 'NONE';
  const locked = status === 'SIGNED';
  const activeStep = flowStepIndex(status);
  const rateDisplay = money(payload.rateOfPay);
  const otDisplay = money(payload.overtimeRate);

  const noticeMeta = useMemo(
    () => ({
      version: offer?.version || 0,
      signedAt: offer?.signedAt,
      signerName: offer?.signatureMeta?.signerName || null,
      primaryLanguageEnglish: offer?.signatureMeta?.primaryLanguageEnglish,
      primaryLanguageOther: offer?.signatureMeta?.primaryLanguageOther,
      englishOnlyNoTemplate: offer?.signatureMeta?.englishOnlyNoTemplate,
    }),
    [offer]
  );

  const setField = <K extends keyof Ls54Payload>(key: K, value: Ls54Payload[K]) => {
    if (locked) return;
    setPayload((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'rateOfPay' && typeof value === 'number') {
        next.overtimeRate = Math.round(value * 1.5 * 100) / 100;
      }
      return next;
    });
  };

  const handleSaveDraft = async () => {
    setPending(true);
    const res = await saveWageOfferDraft(candidateId, payload);
    setPending(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success('Wage notice draft saved.');
    setLoadState('loading');
    setLoadError(null);
    await load();
  };

  const handleSend = async () => {
    setPending(true);
    const res = await sendWageOffer(candidateId, payload);
    setPending(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Wage notice v${res.data.version} sent to applicant.`);
    setLoadState('loading');
    setLoadError(null);
    await load();
  };

  if (loadState === 'loading') {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-xl backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.12),_transparent_55%)]" />
        <div className="relative flex items-center gap-3 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
          <p className="text-sm font-medium">Loading wage offer for this applicant…</p>
        </div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-rose-500/20 bg-zinc-950/80 p-8 shadow-xl backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(244,63,94,0.1),_transparent_50%)]" />
        <div className="relative space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-black tracking-tight text-white">
                Wage offer unavailable
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                {loadError || 'Could not load LS-54 data for this applicant.'}
              </p>
              <p className="mt-2 font-mono text-[11px] text-zinc-500">
                Applicant · {candidateName || '—'} · {candidateId.slice(0, 8)}…
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoadState('loading');
              setLoadError(null);
              void load();
            }}
            className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-white transition hover:border-orange-500/50 hover:bg-white/10"
          >
            Retry load
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-6 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-brand-orange-500/40 hover:shadow-2xl">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(249,115,22,0.14),_transparent_55%)]" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-orange-500/5 blur-3xl" />

        <div className="relative mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-500/30 bg-orange-500/10 text-orange-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-black tracking-tight text-white">
                Extend offer · NYS LS-54
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Prepare the wage notice for{' '}
                <span className="font-semibold text-zinc-200">{offer?.employeeName || candidateName}</span>
                , save a draft, then send. Hire runs only after the applicant e-signs.
              </p>
              <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Real ATS applicant · no demo seed
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${statusBadgeClass(status)}`}
          >
            {status === 'SENT' || status === 'IN_DISCUSSION' ? (
              <span className="dot-live h-1.5 w-1.5 rounded-full bg-amber-400" />
            ) : null}
            {statusLabel(status)}
          </span>
        </div>

        {/* Flow strip */}
        <div className="relative mb-6 grid gap-2 sm:grid-cols-4">
          {FLOW_STEPS.map((step, idx) => {
            const done = idx < activeStep || (idx === activeStep && status === 'SIGNED');
            const current = idx === activeStep && status !== 'SIGNED';
            return (
              <div
                key={step.key}
                className={`rounded-2xl border px-3 py-3 transition-all duration-300 ${
                  done
                    ? 'border-emerald-500/25 bg-emerald-500/10'
                    : current
                      ? 'border-orange-500/40 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                      : 'border-white/5 bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : current ? (
                    <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-zinc-600" />
                  )}
                  <span
                    className={`text-[11px] font-bold ${
                      done || current ? 'text-white' : 'text-zinc-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">Step {idx + 1}</p>
              </div>
            );
          })}
        </div>

        {/* Wage summary */}
        <div className="relative mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Hourly rate
            </p>
            <p className="mt-1 font-heading text-2xl font-black text-white">
              {rateDisplay ?? (
                <span className="text-lg text-zinc-500">Set rate below</span>
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Overtime (≥ 1.5×)
            </p>
            <p className="mt-1 font-heading text-2xl font-black text-white">
              {otDisplay ?? <span className="text-lg text-zinc-500">—</span>}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-4 backdrop-blur-sm">
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Notice version
            </p>
            <p className="mt-1 font-heading text-2xl font-black text-white">
              {offer?.version ? `v${offer.version}` : '—'}
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              {offer?.sentAt
                ? `Last sent ${new Date(offer.sentAt).toLocaleString()}`
                : status === 'NONE'
                  ? 'Not sent yet'
                  : status === 'DRAFT'
                    ? 'Draft only'
                    : '—'}
            </p>
          </div>
        </div>

        {status === 'NONE' && (
          <div className="relative mb-6 rounded-2xl border border-dashed border-white/15 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
            No LS-54 on file for this applicant yet. Employer defaults are prefilled; enter the real
            hourly rate, review fields, save a draft, then send. Nothing is invented as a live
            applicant.
          </div>
        )}

        {status === 'DECLINED' && (
          <div className="relative mb-6 flex items-start gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Applicant declined
              {offer?.declinedAt
                ? ` on ${new Date(offer.declinedAt).toLocaleString()}`
                : ''}
              . Update the rate if needed and resend a new notice version.
            </p>
          </div>
        )}

        {status === 'IN_DISCUSSION' && (
          <div className="relative mb-6 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Applicant opened a wage discussion. Adjust terms if needed, then resend so they can
              e-sign the updated notice.
            </p>
          </div>
        )}

        {status === 'SIGNED' && (
          <div className="relative mb-6 flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Signed
              {offer?.signedAt ? ` ${new Date(offer.signedAt).toLocaleString()}` : ''}
              {offer?.signatureMeta?.signerName
                ? ` by ${offer.signatureMeta.signerName}`
                : ''}
              . Fields are read-only — hire already ran from this e-sign.
            </p>
          </div>
        )}

        <div className="relative rounded-2xl border border-white/10 bg-zinc-900/80 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.02]"
          >
            <div>
              <p className="text-sm font-black text-white">NYS Wage Notice (LS-54) fields</p>
              <p className="text-xs text-zinc-500">
                Employer sections · payday · allowances · preparer
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold ${statusBadgeClass(status)}`}
            >
              {locked ? 'Locked' : 'Editable'}
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`}
              />
            </span>
          </button>

          {expanded && (
            <div className="space-y-5 border-t border-white/10 px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Employer name">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.employerName}
                    onChange={(e) => setField('employerName', e.target.value)}
                  />
                </Field>
                <Field label="DBA">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.dbaName}
                    onChange={(e) => setField('dbaName', e.target.value)}
                  />
                </Field>
                <Field label="FEIN (optional)">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.fein}
                    onChange={(e) => setField('fein', e.target.value)}
                    placeholder="XX-XXXXXXX"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                  />
                </Field>
                <Field label="Physical address">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.physicalAddress}
                    onChange={(e) => setField('physicalAddress', e.target.value)}
                  />
                </Field>
                <Field label="Mailing address">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.mailingAddress}
                    onChange={(e) => setField('mailingAddress', e.target.value)}
                  />
                </Field>
                <Field label="Employee name">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.employeeName}
                    onChange={(e) => setField('employeeName', e.target.value)}
                  />
                </Field>
                <Field label="Notice given">
                  <select
                    className={`${inputClass} ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    disabled={locked}
                    value={payload.noticeGiven}
                    onChange={(e) =>
                      setField('noticeGiven', e.target.value as Ls54Payload['noticeGiven'])
                    }
                  >
                    <option value="AT_HIRING">At hiring</option>
                    <option value="BEFORE_CHANGE">Before a change in pay rate</option>
                  </select>
                </Field>
                <Field label="Rate of pay ($ / hour)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputClass}
                    disabled={locked}
                    value={payload.rateOfPay || ''}
                    onChange={(e) => setField('rateOfPay', Number(e.target.value))}
                  />
                </Field>
                <Field label="Overtime rate ($ / hour, ≥ 1.5×)">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={inputClass}
                    disabled={locked}
                    value={payload.overtimeRate || ''}
                    onChange={(e) => setField('overtimeRate', Number(e.target.value))}
                  />
                </Field>
                <Field label="Regular payday">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.regularPayday}
                    onChange={(e) => setField('regularPayday', e.target.value)}
                    placeholder="Friday"
                  />
                </Field>
                <Field label="Pay frequency">
                  <select
                    className={`${inputClass} ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    disabled={locked}
                    value={payload.payFrequency}
                    onChange={(e) =>
                      setField('payFrequency', e.target.value as Ls54Payload['payFrequency'])
                    }
                  >
                    <option value="WEEKLY">Weekly</option>
                    <option value="BIWEEKLY">Bi-weekly</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                {payload.payFrequency === 'OTHER' && (
                  <Field label="Other frequency">
                    <input
                      className={inputClass}
                      disabled={locked}
                      value={payload.payFrequencyOther}
                      onChange={(e) => setField('payFrequencyOther', e.target.value)}
                    />
                  </Field>
                )}
                <Field label="Preparer name">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.preparerName}
                    onChange={(e) => setField('preparerName', e.target.value)}
                  />
                </Field>
                <Field label="Preparer title">
                  <input
                    className={inputClass}
                    disabled={locked}
                    value={payload.preparerTitle}
                    onChange={(e) => setField('preparerTitle', e.target.value)}
                  />
                </Field>
              </div>

              <label
                className={`flex items-center gap-2 text-sm text-zinc-300 ${
                  locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={payload.allowancesNone}
                  onChange={(e) => {
                    if (locked) return;
                    const checked = e.target.checked;
                    setPayload((prev) => ({
                      ...prev,
                      allowancesNone: checked,
                      ...(checked
                        ? {
                            tipsPerHour: null,
                            mealsPerMeal: null,
                            lodging: '',
                            otherAllowance: '',
                          }
                        : {}),
                    }));
                  }}
                  className={locked ? 'cursor-not-allowed' : 'cursor-pointer'}
                />
                No allowances taken (tips / meals / lodging)
              </label>

              {!payload.allowancesNone && (
                <div className="grid gap-4 rounded-2xl border border-white/10 bg-zinc-950/60 p-4 md:grid-cols-2">
                  <Field label="Tips ($ / hour)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClass}
                      disabled={locked}
                      value={payload.tipsPerHour ?? ''}
                      onChange={(e) =>
                        setField(
                          'tipsPerHour',
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                    />
                  </Field>
                  <Field label="Meals ($ / meal)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClass}
                      disabled={locked}
                      value={payload.mealsPerMeal ?? ''}
                      onChange={(e) =>
                        setField(
                          'mealsPerMeal',
                          e.target.value === '' ? null : Number(e.target.value)
                        )
                      }
                    />
                  </Field>
                  <Field label="Lodging">
                    <input
                      className={inputClass}
                      disabled={locked}
                      value={payload.lodging}
                      onChange={(e) => setField('lodging', e.target.value)}
                      placeholder="Description / amount"
                    />
                  </Field>
                  <Field label="Other allowance">
                    <input
                      className={inputClass}
                      disabled={locked}
                      value={payload.otherAllowance}
                      onChange={(e) => setField('otherAllowance', e.target.value)}
                    />
                  </Field>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white transition hover:border-orange-500/50 hover:bg-white/10"
                >
                  Preview full LS-54 notice
                </button>
                <a
                  href="/onboarding-docs/ls-54-wage-notice.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white transition hover:border-orange-500/50 hover:bg-white/10"
                >
                  Official blank LS-54
                </a>
                <button
                  type="button"
                  disabled={pending || locked}
                  onClick={() => void handleSaveDraft()}
                  className="cursor-pointer rounded-xl border border-white/10 bg-zinc-800 px-3 py-2 text-xs font-bold text-white transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  disabled={pending || locked || !(payload.rateOfPay > 0)}
                  onClick={() => void handleSend()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#F97316] px-3 py-2 text-xs font-bold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {status === 'SENT' || status === 'IN_DISCUSSION' || status === 'DECLINED'
                    ? 'Resend to applicant'
                    : 'Send to applicant'}
                </button>
              </div>

              <p className="text-xs text-zinc-500">
                {offer?.version
                  ? `Version ${offer.version}${
                      offer.sentAt
                        ? ` · last sent ${new Date(offer.sentAt).toLocaleString()}`
                        : ''
                    }. `
                  : ''}
                Applicant signs from their onboarding / tasks hub after pack clearance. Sending sets
                ATS stage to Offer when not already hired.
              </p>
            </div>
          )}
        </div>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-4 text-white shadow-2xl sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-heading text-lg font-black">LS-54 notice preview</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!printLs54Notice(payload, noticeMeta)) {
                      toast.error('Pop-up blocked — allow pop-ups to print.');
                    }
                  }}
                  className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-zinc-200 transition hover:bg-white/5"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/5 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10 bg-white">
              <Ls54NoticeDocument payload={payload} meta={noticeMeta} />
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Full notice layout for Head HR review. Official DOL blank form:{' '}
              <a
                href="/onboarding-docs/ls-54-wage-notice.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-orange-400 underline"
              >
                LS 54 PDF
              </a>
              .
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition focus:border-orange-500/50 disabled:cursor-not-allowed disabled:opacity-60';
