'use client';

import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
import {
  computeW4Step3Total,
  emptyBackgroundCheck,
  emptyDirectDeposit,
  emptyIt2104,
  emptyW4,
  validateEmbeddedForm,
  type BackgroundCheckFormValues,
  type DirectDepositFormValues,
  type EmbeddedFormPayload,
  type It2104FormValues,
  type W4FormValues,
} from '@/lib/embeddedOnboardingForms';
import type { OnboardingDocDef } from '@/lib/onboardingDocuments';
import { submitOnboardingEmbeddedForm } from '@/app/actions/onboardingSignatureActions';
import { OfficialPdfBar } from '@/components/rbt/OnboardingStepPanels';
import { OnboardingConfirmModal } from '@/components/rbt/OnboardingConfirmModal';
import { getActiveApplicantId, getActiveApplicantName } from '@/lib/syncAtsProgress';

export function formatSsn(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#F97316] focus:ring-2 focus:ring-orange-500/20';

const EMPTY_APPLICANT_SNAPSHOT = '\u0000';
const APPLICANT_STORAGE_KEYS = new Set([
  'ras_active_impersonated_applicant_id',
  'ras_active_applicant_id',
  'ras_active_impersonated_applicant_name',
]);

function subscribeToActiveApplicant(callback: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || APPLICANT_STORAGE_KEYS.has(event.key)) callback();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener('ras_applicant_session_changed', callback);
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('ras_applicant_session_changed', callback);
  };
}

function getActiveApplicantSnapshot() {
  return `${getActiveApplicantId() || ''}\u0000${getActiveApplicantName() || ''}`;
}

function getServerApplicantSnapshot() {
  return EMPTY_APPLICANT_SNAPSHOT;
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-[#FFFDF9] p-4 shadow-sm">
      <h4 className="font-heading text-sm font-black uppercase tracking-wide text-slate-900">{title}</h4>
      {children}
    </div>
  );
}

function W4Fields({
  values,
  setValues,
}: {
  values: W4FormValues;
  setValues: (v: W4FormValues) => void;
}) {
  const set = <K extends keyof W4FormValues>(key: K, val: W4FormValues[K]) =>
    setValues({ ...values, [key]: val });

  const childrenN = Number(values.qualifyingChildrenCount) || 0;
  const otherN = Number(values.otherDependentsCount) || 0;
  const childrenDollars = childrenN * 2000;
  const otherDollars = otherN * 500;
  const step3Total = computeW4Step3Total(values);

  const [showSsn, setShowSsn] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-slate-600">
        Fields match IRS Form W-4 (2025) Steps 1–5. Employer name / EIN / first date of employment are filled by HR
        after hire — not required from you here.
      </p>

      <StepCard title="Step 1 — Personal information">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="First name (1a)">
            <input className={inputClass} value={values.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label="Middle initial">
            <input
              className={inputClass}
              maxLength={1}
              value={values.middleInitial}
              onChange={(e) => set('middleInitial', e.target.value.slice(0, 1))}
            />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={values.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
        </div>
        <Field label="Social security number (1b)" hint="Must match your Social Security card. Auto-formats as XXX-XX-XXXX.">
          <div className="relative">
            <input
              className={inputClass}
              type={showSsn ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              placeholder="XXX-XX-XXXX"
              value={values.ssn}
              onChange={(e) => set('ssn', formatSsn(e.target.value))}
            />
            <button
              type="button"
              onClick={() => setShowSsn(!showSsn)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              title={showSsn ? 'Hide SSN' : 'Show SSN'}
            >
              {showSsn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Address">
          <input
            className={inputClass}
            value={values.addressLine1}
            onChange={(e) => set('addressLine1', e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City or town">
            <input className={inputClass} value={values.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State">
            <input
              className={inputClass}
              maxLength={2}
              value={values.state}
              onChange={(e) => set('state', e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="ZIP code">
            <input className={inputClass} value={values.zipCode} onChange={(e) => set('zipCode', e.target.value)} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Filing status (1c) — check only one
          </legend>
          {(
            [
              ['SINGLE', 'Single or Married filing separately'],
              ['MARRIED_JOINT', 'Married filing jointly or Qualifying surviving spouse'],
              [
                'HEAD_OF_HOUSEHOLD',
                'Head of household (only if unmarried and you pay more than half the costs of keeping up a home for yourself and a qualifying individual)',
              ],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <input
                type="radio"
                name="w4-filing-status"
                className="mt-0.5 cursor-pointer"
                checked={values.filingStatus === value}
                onChange={() => set('filingStatus', value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      </StepCard>

      <StepCard title="Step 2 — Multiple jobs or spouse works">
        <p className="text-[12px] leading-relaxed text-slate-600">
          Complete if you (1) hold more than one job at a time, or (2) are married filing jointly and your spouse also
          works. Prefer the IRS estimator at irs.gov/W4App, or the Multiple Jobs Worksheet on page 3 of the PDF. Or use
          option (c) below when there are only two jobs total.
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.multipleJobsTwoJobCheckbox}
            onChange={(e) => set('multipleJobsTwoJobCheckbox', e.target.checked)}
          />
          <span>
            <strong>Step 2(c):</strong> There are only two jobs total. Check this box (and do the same on the W-4 for
            the other job). Generally more accurate when pay at the lower-paying job is more than half of pay at the
            higher-paying job.
          </span>
        </label>
      </StepCard>

      <StepCard title="Step 3 — Claim dependents and other credits">
        <p className="text-[12px] text-slate-600">
          Use if total income will be $200,000 or less ($400,000 or less if married filing jointly).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Number of qualifying children under age 17" hint="× $2,000 each">
            <input
              className={inputClass}
              inputMode="numeric"
              value={values.qualifyingChildrenCount}
              onChange={(e) => set('qualifyingChildrenCount', e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-mono font-bold text-emerald-800">
              = ${childrenDollars.toLocaleString('en-US')}
            </div>
          </div>
          <Field label="Number of other dependents" hint="× $500 each">
            <input
              className={inputClass}
              inputMode="numeric"
              value={values.otherDependentsCount}
              onChange={(e) => set('otherDependentsCount', e.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-mono font-bold text-emerald-800">
              = ${otherDollars.toLocaleString('en-US')}
            </div>
          </div>
          <Field
            label="Other credits (dollar amount)"
            hint="Optional — child tax credit is already in the counts above; add other credits here"
          >
            <input
              className={inputClass}
              inputMode="decimal"
              value={values.otherCreditsAmount}
              onChange={(e) => set('otherCreditsAmount', e.target.value)}
            />
          </Field>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
          <span className="font-bold text-slate-700">Step 3 total (line 3): </span>
          <span className="font-mono font-black text-[#F97316]">${step3Total.toLocaleString('en-US')}</span>
        </div>
      </StepCard>

      <StepCard title="Step 4 — Other adjustments (optional)">
        <div className="grid gap-3 sm:grid-cols-1">
          <Field
            label="4(a) Other income (not from jobs)"
            hint="Annual amount you want withheld for (interest, dividends, retirement, etc.)"
          >
            <input
              className={inputClass}
              inputMode="decimal"
              disabled={values.claimExempt}
              value={values.otherIncome}
              onChange={(e) => set('otherIncome', e.target.value)}
            />
          </Field>
          <Field
            label="4(b) Deductions"
            hint="If you expect deductions other than the standard deduction, use the Deductions Worksheet (page 3) and enter the result"
          >
            <input
              className={inputClass}
              inputMode="decimal"
              disabled={values.claimExempt}
              value={values.deductions}
              onChange={(e) => set('deductions', e.target.value)}
            />
          </Field>
          <Field label="4(c) Extra withholding" hint="Additional tax to withhold each pay period">
            <input
              className={inputClass}
              inputMode="decimal"
              disabled={values.claimExempt}
              value={values.extraWithholding}
              onChange={(e) => set('extraWithholding', e.target.value)}
            />
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.claimExempt}
            onChange={(e) => set('claimExempt', e.target.checked)}
          />
          <span>
            <strong>Claim exemption from withholding.</strong> I meet the IRS criteria to write &quot;Exempt&quot; on
            Form W-4 (see page 2 instructions). No federal income tax will be withheld.
          </span>
        </label>
      </StepCard>

      <StepCard title="Step 5 — Sign here">
        <p className="text-[12px] leading-relaxed text-slate-600">
          Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true,
          correct, and complete. Type your legal name below the form to sign electronically.
        </p>
      </StepCard>
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 'YES' | 'NO' | '';
  onChange: (v: 'YES' | 'NO') => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</legend>
      <div className="flex gap-2">
        {(['YES', 'NO'] as const).map((opt) => (
          <label
            key={opt}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
              value === opt
                ? 'border-[#F97316] bg-orange-50 text-orange-900'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          >
            <input
              type="radio"
              className="cursor-pointer"
              checked={value === opt}
              onChange={() => onChange(opt)}
            />
            {opt === 'YES' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function It2104Fields({
  values,
  setValues,
}: {
  values: It2104FormValues;
  setValues: (v: It2104FormValues) => void;
}) {
  const set = <K extends keyof It2104FormValues>(key: K, val: It2104FormValues[K]) =>
    setValues({ ...values, [key]: val });

  const [showSsn, setShowSsn] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-slate-600">
        Fields match NYS Form IT-2104 (Employee&apos;s Withholding Allowance Certificate). Employer / new-hire boxes
        are completed by HR.
      </p>

      <StepCard title="Personal information">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="First name">
            <input className={inputClass} value={values.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label="Middle initial">
            <input
              className={inputClass}
              maxLength={1}
              value={values.middleInitial}
              onChange={(e) => set('middleInitial', e.target.value.slice(0, 1))}
            />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={values.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
        </div>
        <Field label="Your Social Security number" hint="Auto-formats as XXX-XX-XXXX. Masked on-screen for privacy.">
          <div className="relative">
            <input
              className={inputClass}
              type={showSsn ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              placeholder="XXX-XX-XXXX"
              value={values.ssn}
              onChange={(e) => set('ssn', formatSsn(e.target.value))}
            />
            <button
              type="button"
              onClick={() => setShowSsn(!showSsn)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              title={showSsn ? 'Hide SSN' : 'Show SSN'}
            >
              {showSsn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-3">
            <Field label="Permanent home address (number and street or rural route)">
              <input
                className={inputClass}
                value={values.addressLine1}
                onChange={(e) => set('addressLine1', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Apartment number">
            <input
              className={inputClass}
              value={values.apartmentNumber}
              onChange={(e) => set('apartmentNumber', e.target.value)}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City, village, or post office">
            <input className={inputClass} value={values.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State">
            <input
              className={inputClass}
              maxLength={2}
              value={values.state}
              onChange={(e) => set('state', e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="ZIP code">
            <input className={inputClass} value={values.zipCode} onChange={(e) => set('zipCode', e.target.value)} />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Marital status (mark only one)
          </legend>
          {(
            [
              ['SINGLE_OR_HOH', 'Single or Head of household'],
              ['MARRIED', 'Married'],
              ['MARRIED_HIGHER_SINGLE', 'Married, but withhold at higher single rate'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
            >
              <input
                type="radio"
                name="it2104-filing"
                className="mt-0.5 cursor-pointer"
                checked={values.filingStatus === value}
                onChange={() => set('filingStatus', value)}
              />
              <span>{label}</span>
            </label>
          ))}
          <p className="text-[11px] text-slate-500">
            If married but legally separated, mark Single or Head of household.
          </p>
        </fieldset>
        <YesNo
          label="Are you a resident of New York City (Bronx, Brooklyn, Manhattan, Queens, Staten Island)?"
          value={values.nycResident}
          onChange={(v) => set('nycResident', v)}
        />
        <YesNo
          label="Are you a resident of Yonkers?"
          value={values.yonkersResident}
          onChange={(v) => set('yonkersResident', v)}
        />
      </StepCard>

      <StepCard title="Allowances & additional withholding">
        <p className="text-[12px] text-slate-600">
          Single taxpayers with one job and zero dependents: enter 0 on lines 1 and 2. Others may use the worksheet in
          the IT-2104 instructions (tax.ny.gov — search it-2104-i).
        </p>
        <Field label="1 — Total allowances for New York State and Yonkers (if applicable)">
          <input
            className={inputClass}
            inputMode="numeric"
            value={values.nysAllowances}
            onChange={(e) => set('nysAllowances', e.target.value)}
          />
        </Field>
        <Field label="2 — Total allowances for New York City">
          <input
            className={inputClass}
            inputMode="numeric"
            value={values.nycAllowances}
            onChange={(e) => set('nycAllowances', e.target.value)}
          />
        </Field>
        <p className="text-[12px] font-semibold text-slate-700">
          Lines 3–5 — additional withholding per pay period (optional special agreement)
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="3 — New York State amount">
            <input
              className={inputClass}
              inputMode="decimal"
              value={values.additionalNys}
              onChange={(e) => set('additionalNys', e.target.value)}
            />
          </Field>
          <Field label="4 — New York City amount">
            <input
              className={inputClass}
              inputMode="decimal"
              value={values.additionalNyc}
              onChange={(e) => set('additionalNyc', e.target.value)}
            />
          </Field>
          <Field label="5 — Yonkers amount">
            <input
              className={inputClass}
              inputMode="decimal"
              value={values.additionalYonkers}
              onChange={(e) => set('additionalYonkers', e.target.value)}
            />
          </Field>
        </div>
      </StepCard>

      <StepCard title="Certification">
        <p className="text-[12px] leading-relaxed text-slate-600">
          I certify that I am entitled to the number of withholding allowances claimed on this certificate. A penalty of
          $500 may be imposed for any false statement that decreases the amount withheld. Type your legal name below to
          sign.
        </p>
      </StepCard>
    </div>
  );
}

function DirectDepositFields({
  values,
  setValues,
}: {
  values: DirectDepositFormValues;
  setValues: (v: DirectDepositFormValues) => void;
}) {
  const set = <K extends keyof DirectDepositFormValues>(key: K, val: DirectDepositFormValues[K]) =>
    setValues({ ...values, [key]: val });

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-slate-600">
        Fields match the Rise &amp; Shine Direct Deposit Authorization Form. You may designate a secondary account.
      </p>

      <StepCard title="1. Employee information">
        <Field label="Full name">
          <input className={inputClass} value={values.fullName} onChange={(e) => set('fullName', e.target.value)} />
        </Field>
        <Field label="Address">
          <input
            className={inputClass}
            value={values.addressLine1}
            onChange={(e) => set('addressLine1', e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City">
            <input className={inputClass} value={values.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State">
            <input
              className={inputClass}
              maxLength={2}
              value={values.state}
              onChange={(e) => set('state', e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="ZIP">
            <input className={inputClass} value={values.zipCode} onChange={(e) => set('zipCode', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone number">
            <input className={inputClass} value={values.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputClass}
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Social Security number (last 4 digits)">
          <input
            className={inputClass}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="XXXX"
            value={values.ssnLast4}
            onChange={(e) => set('ssnLast4', e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </Field>
      </StepCard>

      <StepCard title="2. Primary bank account (required)">
        <Field label="Bank name">
          <input className={inputClass} value={values.bankName} onChange={(e) => set('bankName', e.target.value)} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Account type</legend>
          <div className="flex gap-2">
            {(['CHECKING', 'SAVINGS'] as const).map((opt) => (
              <label
                key={opt}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  values.accountType === opt
                    ? 'border-[#F97316] bg-orange-50 text-orange-900'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  className="cursor-pointer"
                  checked={values.accountType === opt}
                  onChange={() => set('accountType', opt)}
                />
                {opt === 'CHECKING' ? 'Checking' : 'Savings'}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Routing number (9 digits)">
          <input
            className={inputClass}
            inputMode="numeric"
            maxLength={9}
            value={values.routingNumber}
            onChange={(e) => set('routingNumber', e.target.value.replace(/\D/g, '').slice(0, 9))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Account number">
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="off"
              value={values.accountNumber}
              onChange={(e) => set('accountNumber', e.target.value)}
            />
          </Field>
          <Field label="Confirm account number">
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="off"
              value={values.confirmAccountNumber}
              onChange={(e) => set('confirmAccountNumber', e.target.value)}
            />
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Deposit amount</legend>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <input
              type="radio"
              className="cursor-pointer"
              checked={values.primaryDeposit === 'FULL'}
              onChange={() => set('primaryDeposit', 'FULL')}
            />
            100% of paycheck
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
            <input
              type="radio"
              className="cursor-pointer"
              checked={values.primaryDeposit === 'OTHER'}
              onChange={() => set('primaryDeposit', 'OTHER')}
            />
            Other amount
          </label>
          {values.primaryDeposit === 'OTHER' ? (
            <Field label="Other amount ($)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={values.primaryOtherAmount}
                onChange={(e) => set('primaryOtherAmount', e.target.value)}
              />
            </Field>
          ) : null}
        </fieldset>
      </StepCard>

      <StepCard title="2b. Secondary bank account (optional)">
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="cursor-pointer"
            checked={values.hasSecondary}
            onChange={(e) => set('hasSecondary', e.target.checked)}
          />
          Add a secondary account
        </label>
        {values.hasSecondary ? (
          <div className="space-y-3 pt-1">
            <Field label="Bank name">
              <input
                className={inputClass}
                value={values.secondaryBankName}
                onChange={(e) => set('secondaryBankName', e.target.value)}
              />
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Account type</legend>
              <div className="flex gap-2">
                {(['CHECKING', 'SAVINGS'] as const).map((opt) => (
                  <label
                    key={opt}
                    className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                      values.secondaryAccountType === opt
                        ? 'border-[#F97316] bg-orange-50 text-orange-900'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      className="cursor-pointer"
                      checked={values.secondaryAccountType === opt}
                      onChange={() => set('secondaryAccountType', opt)}
                    />
                    {opt === 'CHECKING' ? 'Checking' : 'Savings'}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Routing number">
              <input
                className={inputClass}
                inputMode="numeric"
                maxLength={9}
                value={values.secondaryRoutingNumber}
                onChange={(e) => set('secondaryRoutingNumber', e.target.value.replace(/\D/g, '').slice(0, 9))}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account number">
                <input
                  className={inputClass}
                  autoComplete="off"
                  value={values.secondaryAccountNumber}
                  onChange={(e) => set('secondaryAccountNumber', e.target.value)}
                />
              </Field>
              <Field label="Confirm account number">
                <input
                  className={inputClass}
                  autoComplete="off"
                  value={values.secondaryConfirmAccountNumber}
                  onChange={(e) => set('secondaryConfirmAccountNumber', e.target.value)}
                />
              </Field>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Deposit amount</legend>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                <input
                  type="radio"
                  className="cursor-pointer"
                  checked={values.secondaryDeposit === 'REMAINDER'}
                  onChange={() => set('secondaryDeposit', 'REMAINDER')}
                />
                Remainder of paycheck
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
                <input
                  type="radio"
                  className="cursor-pointer"
                  checked={values.secondaryDeposit === 'AMOUNT'}
                  onChange={() => set('secondaryDeposit', 'AMOUNT')}
                />
                Fixed amount
              </label>
              {values.secondaryDeposit === 'AMOUNT' ? (
                <Field label="Amount ($)">
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={values.secondaryAmount}
                    onChange={(e) => set('secondaryAmount', e.target.value)}
                  />
                </Field>
              ) : null}
            </fieldset>
          </div>
        ) : null}
      </StepCard>

      <StepCard title="3. Required documentation">
        <p className="text-[12px] text-slate-600">
          Attach (or provide to HR) one of: void check (preferred), bank letter with account/routing numbers, or
          official bank direct-deposit form.
        </p>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.documentationAcknowledged}
            onChange={(e) => set('documentationAcknowledged', e.target.checked)}
          />
          <span>I will provide a void check or bank verification document to HR for account verification.</span>
        </label>
      </StepCard>

      <StepCard title="4. Authorization & agreement">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.authorizeAch}
            onChange={(e) => set('authorizeAch', e.target.checked)}
          />
          <span>
            I authorize Rise &amp; Shine ABA to deposit my paycheck electronically to the account(s) listed, make
            correcting entries if needed, and continue until I submit written notice to change or cancel.
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.understandTiming}
            onChange={(e) => set('understandTiming', e.target.checked)}
          />
          <span>
            I understand changes may take 1–2 payroll cycles, I am responsible for accurate banking information, and
            Rise &amp; Shine ABA is not responsible for delays caused by incorrect information.
          </span>
        </label>
      </StepCard>
    </div>
  );
}

function BackgroundCheckFields({
  values,
  setValues,
}: {
  values: BackgroundCheckFormValues;
  setValues: (v: BackgroundCheckFormValues) => void;
}) {
  const set = <K extends keyof BackgroundCheckFormValues>(key: K, val: BackgroundCheckFormValues[K]) =>
    setValues({ ...values, [key]: val });

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-slate-600">
        Fields match the Rise &amp; Shine Background Check Authorization Form. Administrator clearance is completed by
        HR.
      </p>

      <StepCard title="1. Personal information">
        <Field label="Full legal name">
          <input
            className={inputClass}
            value={values.fullLegalName}
            onChange={(e) => set('fullLegalName', e.target.value)}
          />
        </Field>
        <Field label="Other names used (maiden / alias)" hint="Enter N/A if none">
          <input className={inputClass} value={values.otherNames} onChange={(e) => set('otherNames', e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date of birth">
            <input
              type="date"
              className={inputClass}
              value={values.dateOfBirth}
              onChange={(e) => set('dateOfBirth', e.target.value)}
            />
          </Field>
          <Field label="Social Security number (last 4 digits)">
            <input
              className={inputClass}
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              placeholder="XXXX"
              value={values.ssnLast4}
              onChange={(e) => set('ssnLast4', e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </Field>
          <Field label="Phone number">
            <input className={inputClass} value={values.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label="Email address">
            <input
              type="email"
              className={inputClass}
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Current address">
          <input
            className={inputClass}
            value={values.addressLine1}
            onChange={(e) => set('addressLine1', e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City">
            <input className={inputClass} value={values.city} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State">
            <input
              className={inputClass}
              maxLength={2}
              value={values.state}
              onChange={(e) => set('state', e.target.value.toUpperCase())}
            />
          </Field>
          <Field label="ZIP">
            <input className={inputClass} value={values.zipCode} onChange={(e) => set('zipCode', e.target.value)} />
          </Field>
        </div>
      </StepCard>

      <StepCard title="2. Authorization for background check">
        <ul className="list-disc space-y-1 pl-5 text-[12px] text-slate-600">
          <li>Identity verification</li>
          <li>Criminal history (federal, state, local)</li>
          <li>Sex offender registry search</li>
          <li>Child abuse / neglect registry (state-dependent)</li>
          <li>Employment, education, credential, and license verification</li>
          <li>Motor vehicle record (if applicable)</li>
        </ul>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.authorizeBackground}
            onChange={(e) => set('authorizeBackground', e.target.checked)}
          />
          <span>
            I voluntarily authorize Rise &amp; Shine ABA and its designated agents to conduct the background check
            described above and obtain information from agencies, employers, schools, and licensing boards.
          </span>
        </label>
      </StepCard>

      <StepCard title="3. Applicant rights">
        <ul className="list-disc space-y-1 pl-5 text-[12px] text-slate-600">
          <li>Right to request a copy of any background check report</li>
          <li>Right to dispute or correct inaccurate information</li>
          <li>Results used solely for employment / contracting decisions</li>
          <li>Information kept confidential per state and federal law</li>
          <li>Background check required for employment with Rise &amp; Shine ABA</li>
          <li>Inaccurate information may disqualify me</li>
        </ul>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.acknowledgeRights}
            onChange={(e) => set('acknowledgeRights', e.target.checked)}
          />
          <span>I understand and acknowledge these applicant rights.</span>
        </label>
      </StepCard>

      <StepCard title="4. Ongoing authorization">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.ongoingAuthorization}
            onChange={(e) => set('ongoingAuthorization', e.target.checked)}
          />
          <span>
            I authorize Rise &amp; Shine ABA to conduct periodic or updated background checks during my employment or
            contract period when required by law, regulators, insurance, or company policy.
          </span>
        </label>
      </StepCard>

      <StepCard title="5. Consent & signature">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer"
            checked={values.certifyTrue}
            onChange={(e) => set('certifyTrue', e.target.checked)}
          />
          <span>
            I certify that all information provided is true and complete, and I authorize Rise &amp; Shine ABA to obtain
            and review background check information needed to determine eligibility.
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="cursor-pointer"
            checked={values.isUnder18}
            onChange={(e) => set('isUnder18', e.target.checked)}
          />
          I am under 18 (parent/guardian signature required)
        </label>
        {values.isUnder18 ? (
          <Field label="Parent / guardian full name">
            <input
              className={inputClass}
              value={values.parentGuardianName}
              onChange={(e) => set('parentGuardianName', e.target.value)}
            />
          </Field>
        ) : null}
      </StepCard>
    </div>
  );
}

function EmbeddedFormSubmissionControls({
  doc,
  alreadyDone,
  initialSigner,
  payload,
  onSubmitted,
}: {
  doc: OnboardingDocDef;
  alreadyDone: boolean;
  initialSigner: string;
  payload: EmbeddedFormPayload | null;
  onSubmitted: (auditHash: string) => void;
}) {
  const [localSigner, setLocalSigner] = useState(initialSigner);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const requestSubmit = () => {
    if (!payload) {
      toast.error('Unknown form.');
      return;
    }
    const err = validateEmbeddedForm(payload);
    if (err) {
      toast.error(err);
      return;
    }
    if (!localSigner.trim() || localSigner.trim().length < 2) {
      toast.error('Type your full legal name to certify this form.');
      return;
    }
    setConfirmOpen(true);
  };

  const confirmSubmit = async () => {
    if (!payload) return;
    setPending(true);
    const res = await submitOnboardingEmbeddedForm({
      stepNumber: doc.step,
      signerName: localSigner.trim(),
      payload,
    });
    setPending(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    setConfirmOpen(false);
    toast.success('Form saved with audit trail.');
    onSubmitted(res.data.auditHash);
  };

  return (
    <>
      <div className="space-y-2 rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-3">
        <label className="block text-xs font-bold text-slate-900">
          Type your full legal name to certify
        </label>
        <input
          type="text"
          className={inputClass}
          placeholder="Full legal name"
          value={localSigner}
          onChange={(e) => setLocalSigner(e.target.value)}
        />
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={requestSubmit}
        className="inline-flex w-full cursor-pointer items-center justify-center rounded-2xl bg-[#F97316] px-4 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-[#ea6a0c] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Saving…' : alreadyDone ? 'Update & resubmit form' : 'Submit completed form'}
      </button>

      <OnboardingConfirmModal
        open={confirmOpen}
        title="Submit this form?"
        body={
          <p>
            You are certifying that the information on <strong>{doc.title}</strong> is true and complete, and that
            typing your name (<strong>{localSigner.trim()}</strong>) is your electronic signature under E-SIGN / ESRA.
          </p>
        }
        confirmLabel="Yes, submit form"
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmSubmit()}
      />
    </>
  );
}

export function EmbeddedOnboardingFormPanel({
  doc,
  alreadyDone,
  signerName,
  onSubmitted,
}: {
  doc: OnboardingDocDef;
  alreadyDone: boolean;
  signerName: string;
  onSubmitted: (auditHash: string) => void;
}) {
  const [w4, setW4] = useState(emptyW4);
  const [it2104, setIt2104] = useState(emptyIt2104);
  const [deposit, setDeposit] = useState(emptyDirectDeposit);
  const [bg, setBg] = useState(emptyBackgroundCheck);
  const applicantSnapshot = useSyncExternalStore(
    subscribeToActiveApplicant,
    getActiveApplicantSnapshot,
    getServerApplicantSnapshot
  );

  const buildPayload = (): EmbeddedFormPayload | null => {
    if (doc.key === 'form-w4') return { key: 'form-w4', values: w4 };
    if (doc.key === 'form-it-2104') return { key: 'form-it-2104', values: it2104 };
    if (doc.key === 'direct-deposit') return { key: 'direct-deposit', values: deposit };
    if (doc.key === 'background-check') return { key: 'background-check', values: bg };
    return null;
  };
  const [activeApplicantId, activeApplicantName] = applicantSnapshot.split('\u0000');
  const initialSigner = signerName.trim() || activeApplicantName.trim();
  const signerScope = `${activeApplicantId || 'no-active-applicant'}:${doc.step}:${initialSigner}`;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-800">
        <p className="font-black text-slate-900">Complete this form in the app</p>
        <p className="mt-1 text-[13px] leading-relaxed">
          Fill every required field below, then submit. Your answers are saved to your onboarding packet and an audit
          event is recorded. Official blank PDFs are available for reference only.
        </p>
      </div>

      <OfficialPdfBar doc={doc} />

      {doc.key === 'form-w4' ? <W4Fields values={w4} setValues={setW4} /> : null}
      {doc.key === 'form-it-2104' ? <It2104Fields values={it2104} setValues={setIt2104} /> : null}
      {doc.key === 'direct-deposit' ? <DirectDepositFields values={deposit} setValues={setDeposit} /> : null}
      {doc.key === 'background-check' ? <BackgroundCheckFields values={bg} setValues={setBg} /> : null}

      <EmbeddedFormSubmissionControls
        key={signerScope}
        doc={doc}
        alreadyDone={alreadyDone}
        initialSigner={initialSigner}
        payload={buildPayload()}
        onSubmitted={onSubmitted}
      />
    </div>
  );
}
