'use client';

import type { Ls54Payload } from '@/lib/onboardingDocuments';

export type Ls54NoticeMeta = {
  version?: number | null;
  signedAt?: string | null;
  signerName?: string | null;
  preparerSignedAt?: string | null;
  primaryLanguageEnglish?: boolean | null;
  primaryLanguageOther?: string | null;
  /** DOL has no template in employee's primary language */
  englishOnlyNoTemplate?: boolean | null;
};

function money(n: number | null | undefined) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function payFrequencyLabel(payload: Ls54Payload) {
  if (payload.payFrequency === 'WEEKLY') return 'Weekly';
  if (payload.payFrequency === 'BIWEEKLY') return 'Bi-weekly';
  return payload.payFrequencyOther?.trim() || 'Other';
}

/** Printable / downloadable LS-54-style notice (HTML). Not a filled DOL PDF AcroForm. */
export function Ls54NoticeDocument({
  payload,
  meta = {},
}: {
  payload: Ls54Payload;
  meta?: Ls54NoticeMeta;
}) {
  const allowancesNone = payload.allowancesNone;
  const hasTips = payload.tipsPerHour != null && payload.tipsPerHour > 0;
  const hasMeals = payload.mealsPerMeal != null && payload.mealsPerMeal > 0;
  const hasLodging = Boolean(payload.lodging?.trim());
  const hasOther = Boolean(payload.otherAllowance?.trim());

  return (
    <article className="ls54-notice mx-auto max-w-[720px] bg-white p-8 text-slate-900 print:max-w-none print:p-0">
      <header className="border-b-2 border-slate-900 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          New York State Department of Labor · Labor Law § 195.1
        </p>
        <h1 className="mt-1 text-lg font-black leading-snug">
          Notice and Acknowledgement of Pay Rate and Payday
        </h1>
        <p className="text-sm font-semibold text-slate-700">Notice for Hourly Rate Employees (LS 54)</p>
        {meta.version != null && meta.version > 0 && (
          <p className="mt-1 font-mono text-[11px] text-slate-500">Employer notice version {meta.version}</p>
        )}
      </header>

      <section className="mt-5 space-y-1 text-sm">
        <h2 className="text-xs font-black uppercase tracking-wide">1. Employer Information</h2>
        <Row label="Name" value={payload.employerName} />
        <Row label="Doing Business As (DBA) Name(s)" value={payload.dbaName || '—'} />
        <Row label="FEIN (optional)" value={payload.fein || '—'} />
        <Row label="Physical Address" value={payload.physicalAddress} />
        <Row label="Mailing Address" value={payload.mailingAddress || payload.physicalAddress} />
        <Row label="Phone" value={payload.phone} />
      </section>

      <section className="mt-5 text-sm">
        <h2 className="text-xs font-black uppercase tracking-wide">2. Notice given</h2>
        <p className="mt-1">
          {payload.noticeGiven === 'BEFORE_CHANGE'
            ? '☑ Before a change in pay rate(s), allowances claimed or payday'
            : '☑ At hiring'}
        </p>
      </section>

      <section className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide">3. Employee&apos;s rate of pay</h2>
          <p className="mt-1 text-base font-bold">{money(payload.rateOfPay)} per hour</p>
        </div>
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide">7. Overtime Pay Rate</h2>
          <p className="mt-1 text-base font-bold">{money(payload.overtimeRate)} per hour</p>
          <p className="text-[11px] text-slate-500">
            Must be at least 1½ times the worker&apos;s regular rate with few exceptions.
          </p>
        </div>
      </section>

      <section className="mt-5 text-sm">
        <h2 className="text-xs font-black uppercase tracking-wide">4. Allowances taken</h2>
        <ul className="mt-1 list-inside space-y-0.5">
          <li>{allowancesNone || (!hasTips && !hasMeals && !hasLodging && !hasOther) ? '☑ None' : '☐ None'}</li>
          <li>
            {hasTips ? '☑' : '☐'} Tips: {hasTips ? `${money(payload.tipsPerHour)} per hour` : '—'}
          </li>
          <li>
            {hasMeals ? '☑' : '☐'} Meals: {hasMeals ? `${money(payload.mealsPerMeal)} per meal` : '—'}
          </li>
          <li>
            {hasLodging ? '☑' : '☐'} Lodging: {hasLodging ? payload.lodging : '—'}
          </li>
          <li>
            {hasOther ? '☑' : '☐'} Other: {hasOther ? payload.otherAllowance : '—'}
          </li>
        </ul>
      </section>

      <section className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide">5. Regular payday</h2>
          <p className="mt-1 font-bold">{payload.regularPayday || '—'}</p>
        </div>
        <div>
          <h2 className="text-xs font-black uppercase tracking-wide">6. Pay is</h2>
          <p className="mt-1 font-bold">{payFrequencyLabel(payload)}</p>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm">
        <h2 className="text-xs font-black uppercase tracking-wide">8. Employee Acknowledgement</h2>
        <p className="mt-2 leading-relaxed text-slate-800">
          On this day I have been notified of my pay rate, overtime rate (if eligible), allowances, and
          designated pay day on the date given below. I told my employer what my primary language is.
        </p>
        <div className="mt-3 space-y-1 text-slate-800">
          {meta.primaryLanguageEnglish ? (
            <p>☑ I have been given this pay notice in English because it is my primary language.</p>
          ) : (
            <p>☐ I have been given this pay notice in English because it is my primary language.</p>
          )}
          {!meta.primaryLanguageEnglish && (meta.primaryLanguageOther || meta.englishOnlyNoTemplate) ? (
            <p>
              ☑ My primary language is:{' '}
              <strong>{meta.primaryLanguageOther || '—'}</strong>. I have been given this pay notice in
              English only, because the Department of Labor does not yet offer a pay notice form in my
              primary language.
            </p>
          ) : (
            <p>
              ☐ My primary language is: ________. I have been given this pay notice in English only,
              because the Department of Labor does not yet offer a pay notice form in my primary language.
            </p>
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Row label="Print Employee Name" value={payload.employeeName} />
          <Row label="Employee Signature (electronic)" value={meta.signerName || '(pending)'} />
          <Row label="Date" value={formatDate(meta.signedAt)} />
          <Row
            label="Preparer's Name and Title"
            value={`${payload.preparerName}, ${payload.preparerTitle}`}
          />
        </div>
      </section>

      <footer className="mt-6 space-y-2 border-t border-slate-300 pt-4 text-[11px] leading-relaxed text-slate-600">
        <p>
          The employee must receive a signed copy of this form. The employer must keep the original for 6
          years.
        </p>
        <p>
          Please note: It is unlawful for an employee to be paid less than an employee of the opposite sex
          for equal work. Employers also may not prohibit employees from discussing wages with their
          co-workers.
        </p>
        <p className="text-slate-400">
          This is an employer-generated electronic notice modeled on NYS DOL LS 54. Official blank template:{' '}
          LS 54 (DOL). Retain for Wage Theft Prevention Act recordkeeping.
        </p>
      </footer>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}:</span>
      <span className="font-medium text-slate-900">{value || '—'}</span>
    </div>
  );
}

function escHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildLs54PrintHtml(payload: Ls54Payload, meta?: Ls54NoticeMeta, autoPrint = false) {
  const esc = escHtml;
  const allowancesNone = payload.allowancesNone;
  const tips = payload.tipsPerHour != null && payload.tipsPerHour > 0;
  const meals = payload.mealsPerMeal != null && payload.mealsPerMeal > 0;
  const lodging = Boolean(payload.lodging?.trim());
  const other = Boolean(payload.otherAllowance?.trim());
  const freq =
    payload.payFrequency === 'WEEKLY'
      ? 'Weekly'
      : payload.payFrequency === 'BIWEEKLY'
      ? 'Bi-weekly'
      : esc(payload.payFrequencyOther || 'Other');

  const signed = meta?.signedAt
    ? new Date(meta.signedAt).toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      })
    : '—';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>LS-54 Wage Notice</title>
<style>
  body{font-family:system-ui,Segoe UI,sans-serif;color:#0f172a;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.45}
  h1{font-size:18px;margin:4px 0} h2{font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin:18px 0 6px}
  .muted{color:#64748b;font-size:11px} .box{border:1px solid #cbd5e1;background:#f8fafc;padding:14px;border-radius:8px;margin-top:16px}
  .row{margin:4px 0} .label{font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;margin-right:6px}
  footer{border-top:1px solid #cbd5e1;margin-top:24px;padding-top:12px;font-size:11px;color:#475569}
  @media print{body{margin:0;max-width:none}}
</style></head><body>
<p class="muted">New York State Department of Labor · Labor Law § 195.1</p>
<h1>Notice and Acknowledgement of Pay Rate and Payday</h1>
<p><strong>Notice for Hourly Rate Employees (LS 54)</strong></p>
${meta?.version ? `<p class="muted">Employer notice version ${meta.version}</p>` : ''}
<h2>1. Employer Information</h2>
<div class="row"><span class="label">Name:</span>${esc(payload.employerName)}</div>
<div class="row"><span class="label">DBA:</span>${esc(payload.dbaName || '—')}</div>
<div class="row"><span class="label">FEIN:</span>${esc(payload.fein || '—')}</div>
<div class="row"><span class="label">Physical Address:</span>${esc(payload.physicalAddress)}</div>
<div class="row"><span class="label">Mailing Address:</span>${esc(payload.mailingAddress || payload.physicalAddress)}</div>
<div class="row"><span class="label">Phone:</span>${esc(payload.phone)}</div>
<h2>2. Notice given</h2>
<p>${payload.noticeGiven === 'BEFORE_CHANGE' ? 'Before a change in pay rate(s), allowances claimed or payday' : 'At hiring'}</p>
<h2>3. Employee's rate of pay</h2>
<p><strong>${money(payload.rateOfPay)} per hour</strong></p>
<h2>4. Allowances taken</h2>
<ul>
<li>${allowancesNone || (!tips && !meals && !lodging && !other) ? 'None' : 'See below'}</li>
<li>Tips: ${tips ? money(payload.tipsPerHour) + ' per hour' : '—'}</li>
<li>Meals: ${meals ? money(payload.mealsPerMeal) + ' per meal' : '—'}</li>
<li>Lodging: ${lodging ? esc(payload.lodging) : '—'}</li>
<li>Other: ${other ? esc(payload.otherAllowance) : '—'}</li>
</ul>
<h2>5. Regular payday</h2><p><strong>${esc(payload.regularPayday || '—')}</strong></p>
<h2>6. Pay is</h2><p><strong>${freq}</strong></p>
<h2>7. Overtime Pay Rate</h2>
<p><strong>${money(payload.overtimeRate)} per hour</strong> <span class="muted">(at least 1½× regular rate)</span></p>
<div class="box">
<h2 style="margin-top:0">8. Employee Acknowledgement</h2>
<p>On this day I have been notified of my pay rate, overtime rate (if eligible), allowances, and designated pay day on the date given below. I told my employer what my primary language is.</p>
<p>${meta?.primaryLanguageEnglish ? '☑' : '☐'} I have been given this pay notice in English because it is my primary language.</p>
<p>${!meta?.primaryLanguageEnglish && (meta?.primaryLanguageOther || meta?.englishOnlyNoTemplate) ? '☑' : '☐'} My primary language is: <strong>${esc(meta?.primaryLanguageOther || '—')}</strong>. I have been given this pay notice in English only, because the Department of Labor does not yet offer a pay notice form in my primary language.</p>
<div class="row"><span class="label">Print Employee Name:</span>${esc(payload.employeeName)}</div>
<div class="row"><span class="label">Employee Signature (electronic):</span>${esc(meta?.signerName || '(pending)')}</div>
<div class="row"><span class="label">Date:</span>${signed}</div>
<div class="row"><span class="label">Preparer's Name and Title:</span>${esc(payload.preparerName)}, ${esc(payload.preparerTitle)}</div>
</div>
<footer>
<p>The employee must receive a signed copy of this form. The employer must keep the original for 6 years.</p>
<p>It is unlawful for an employee to be paid less than an employee of the opposite sex for equal work. Employers also may not prohibit employees from discussing wages with their co-workers.</p>
<p class="muted">Employer-generated electronic notice modeled on NYS DOL LS 54.</p>
</footer>
${autoPrint ? '<script>window.onload=function(){window.print()}</script>' : ''}
</body></html>`;
}

/** Open a print window with the LS-54 notice (user can Save as PDF). */
export function printLs54Notice(payload: Ls54Payload, meta?: Ls54NoticeMeta) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
  if (!w) return false;
  w.document.write(buildLs54PrintHtml(payload, meta, true));
  w.document.close();
  return true;
}

export function downloadLs54Html(
  payload: Ls54Payload,
  meta?: Ls54NoticeMeta,
  filename = 'ls-54-wage-notice.html'
) {
  const blob = new Blob([buildLs54PrintHtml(payload, meta, false)], {
    type: 'text/html;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
